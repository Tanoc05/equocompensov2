const express = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

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

router.get('/', requireAuth, async (req, res) => {
  const userId = req.user.sub;
  const { rows } = await pool.query(
    'SELECT id, email, nome, cognome, data_nascita, professione, created_at FROM users WHERE id = $1',
    [userId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  return res.json({ user: rows[0] });
});

router.put('/', requireAuth, async (req, res) => {
  const userId = req.user.sub;
  const { nome, cognome, dataNascita, professione } = req.body || {};

  if (!nome || !cognome || !dataNascita || !professione) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const { rows } = await pool.query(
    `UPDATE users
     SET nome = $2, cognome = $3, data_nascita = $4, professione = $5
     WHERE id = $1
     RETURNING id, email, nome, cognome, data_nascita, professione, created_at`,
    [userId, nome, cognome, dataNascita, professione]
  );

  const user = rows[0];
  const token = signToken(user);
  return res.json({ user, token });
});

module.exports = router;
