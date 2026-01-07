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
    `SELECT d.id, d.file_path, d.type, c.input_json
     FROM documents d
     LEFT JOIN calculations c ON c.id = d.calculation_id
     WHERE d.id = $1 AND d.user_id = $2`,
    [docId, userId]
  );

  const doc = rows[0];
  if (!doc) return res.status(404).json({ error: 'Not found' });

  const filePath = doc.file_path;

  function safePart(v) {
    return String(v || '')
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  const input = doc.input_json || {};
  const p1 = safePart(input.nome_pratica);
  const p2 = safePart(input.cliente_nome);
  const ext = doc.type === 'pdf' ? 'pdf' : 'bin';
  const fileName = (p1 && p2)
    ? `${p1}_${p2}.${ext}`
    : (p1 ? `${p1}.${ext}` : (p2 ? `${p2}.${ext}` : `${docId}.${ext}`));

  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Content-Type', doc.type === 'pdf' ? 'application/pdf' : 'application/octet-stream');

  return res.sendFile(path.resolve(filePath));
});

module.exports = router;
