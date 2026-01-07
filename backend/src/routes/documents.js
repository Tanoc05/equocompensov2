const express = require('express');
const path = require('path');

const { pool } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const userId = req.user.sub;
  const { rows } = await pool.query(
    `SELECT d.id, d.type, d.created_at, d.calculation_id
     FROM documents d
     WHERE d.user_id = $1
     ORDER BY d.created_at DESC`,
    [userId]
  );
  return res.json({ documents: rows });
});

router.get('/:id/download', requireAuth, async (req, res) => {
  const userId = req.user.sub;
  const docId = req.params.id;

  const { rows } = await pool.query(
    'SELECT id, file_path, type FROM documents WHERE id = $1 AND user_id = $2',
    [docId, userId]
  );

  const doc = rows[0];
  if (!doc) return res.status(404).json({ error: 'Not found' });

  const filePath = doc.file_path;
  const fileName = `${docId}.${doc.type === 'pdf' ? 'pdf' : 'bin'}`;

  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Content-Type', doc.type === 'pdf' ? 'application/pdf' : 'application/octet-stream');

  return res.sendFile(path.resolve(filePath));
});

module.exports = router;
