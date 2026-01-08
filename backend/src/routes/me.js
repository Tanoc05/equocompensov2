const express = require('express');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { pool } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const avatarsDir = path.resolve(__dirname, '../../storage/avatars');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      ensureDir(avatarsDir);
      cb(null, avatarsDir);
    },
    filename: (req, file, cb) => {
      const ext = String(path.extname(file.originalname) || '').toLowerCase();
      const safeExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.bin';
      cb(null, `avatar-${req.user.sub}-${Date.now()}${safeExt}`);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.mimetype)) {
      const err = new Error('Invalid file type');
      err.code = 'INVALID_FILE_TYPE';
      return cb(err);
    }
    return cb(null, true);
  },
});

function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      nome: user.nome,
      cognome: user.cognome,
      professione: user.professione,
      avatar_url: user.avatar_url,
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

router.get('/', requireAuth, async (req, res) => {
  const userId = req.user.sub;
  const { rows } = await pool.query(
    'SELECT id, email, nome, cognome, data_nascita, professione, studio_nome, sede_indirizzo, sede_citta, sede_cap, sede_provincia, avatar_url, created_at FROM users WHERE id = $1',
    [userId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  return res.json({ user: rows[0] });
});

router.put('/', requireAuth, async (req, res) => {
  const userId = req.user.sub;
  const { nome, cognome, dataNascita, professione, studioNome, sedeIndirizzo, sedeCitta, sedeCap, sedeProvincia } = req.body || {};

  if (!nome || !cognome || !dataNascita || !professione) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const { rows } = await pool.query(
    `UPDATE users
     SET nome = $2, cognome = $3, data_nascita = $4, professione = $5,
         studio_nome = $6, sede_indirizzo = $7, sede_citta = $8, sede_cap = $9, sede_provincia = $10
     WHERE id = $1
     RETURNING id, email, nome, cognome, data_nascita, professione, studio_nome, sede_indirizzo, sede_citta, sede_cap, sede_provincia, avatar_url, created_at`,
    [
      userId,
      nome,
      cognome,
      dataNascita,
      professione,
      studioNome || null,
      sedeIndirizzo || null,
      sedeCitta || null,
      sedeCap || null,
      sedeProvincia || null,
    ]
  );

  const user = rows[0];
  const token = signToken(user);
  return res.json({ user, token });
});

router.patch('/password', requireAuth, async (req, res) => {
  const userId = req.user.sub;
  const { currentPassword, newPassword } = req.body || {};

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  if (String(newPassword).length < 6) {
    return res.status(400).json({ error: 'Password too short' });
  }

  const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
  const user = rows[0];
  if (!user) return res.status(404).json({ error: 'Not found' });

  const ok = await bcrypt.compare(String(currentPassword), user.password_hash);
  if (!ok) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const passwordHash = await bcrypt.hash(String(newPassword), 10);
  await pool.query('UPDATE users SET password_hash = $2 WHERE id = $1', [userId, passwordHash]);
  return res.json({ ok: true });
});

router.post('/avatar', requireAuth, (req, res) => {
  upload.single('avatar')(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large (max 2MB)' });
      }
      if (err.code === 'INVALID_FILE_TYPE') {
        return res.status(400).json({ error: 'Invalid file type' });
      }
      return res.status(400).json({ error: 'Upload error' });
    }

    const userId = req.user.sub;
    if (!req.file) return res.status(400).json({ error: 'Missing file' });

    const avatarUrl = `/uploads/avatars/${req.file.filename}`;
    try {
      const { rows } = await pool.query(
        `UPDATE users
         SET avatar_url = $2
         WHERE id = $1
         RETURNING id, email, nome, cognome, data_nascita, professione, avatar_url, created_at`,
        [userId, avatarUrl]
      );

      const user = rows[0];
      if (!user) return res.status(404).json({ error: 'Not found' });

      const token = signToken(user);
      return res.json({ user, token });
    } catch {
      return res.status(500).json({ error: 'Server error' });
    }
  });
});

module.exports = router;
