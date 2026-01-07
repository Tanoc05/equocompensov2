const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const { pool } = require('../db/pool');

const router = express.Router();

function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      nome: user.nome,
      cognome: user.cognome,
      professione: user.professione,
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

router.post('/register', async (req, res) => {
  const { email, password, nome, cognome, dataNascita, professione } = req.body || {};

  if (!email || !password || !nome || !cognome || !dataNascita || !professione) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  if (!String(email).includes('@') || String(password).length < 6) {
    return res.status(400).json({ error: 'Invalid credentials' });
  }

  const passwordHash = await bcrypt.hash(String(password), 10);
  const userId = uuidv4();

  try {
    const { rows } = await pool.query(
      `INSERT INTO users (id, email, password_hash, nome, cognome, data_nascita, professione)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, email, nome, cognome, professione`,
      [userId, email, passwordHash, nome, cognome, dataNascita, professione]
    );

    const user = rows[0];
    const token = signToken(user);
    return res.json({ token, user });
  } catch (e) {
    if (String(e && e.code) === '23505') {
      return res.status(409).json({ error: 'Email already in use' });
    }
    return res.status(500).json({ error: 'Server error' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const { rows } = await pool.query(
    'SELECT id, email, password_hash, nome, cognome, professione FROM users WHERE email = $1',
    [email]
  );

  const user = rows[0];
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const ok = await bcrypt.compare(String(password), user.password_hash);
  if (!ok) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = signToken(user);
  return res.json({ token, user: { id: user.id, email: user.email, nome: user.nome, cognome: user.cognome, professione: user.professione } });
});

module.exports = router;
