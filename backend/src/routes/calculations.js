const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const { pool } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { generateCalculationPdf } = require('../services/pdf');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const userId = req.user.sub;
  const q = String(req.query.q || '').trim();

  let where = 'c.user_id = $1 AND c.deleted_at IS NULL';
  const params = [userId];
  if (q) {
    params.push(`%${q}%`);
    where += ` AND (
      COALESCE(c.name, '') ILIKE $2 OR
      to_char(c.created_at, 'YYYY-MM-DD') ILIKE $2
    )`;
  }

  const { rows } = await pool.query(
    `SELECT
       c.id,
       c.name,
       c.created_at,
       c.input_json,
       c.result_json,
       d.id AS document_id
     FROM calculations c
     LEFT JOIN LATERAL (
       SELECT id
       FROM documents
       WHERE calculation_id = c.id AND user_id = $1
       ORDER BY created_at DESC
       LIMIT 1
     ) d ON true
     WHERE ${where}
     ORDER BY c.created_at DESC`,
    params
  );

  return res.json({ calculations: rows });
});

router.patch('/:id/rename', requireAuth, async (req, res) => {
  const userId = req.user.sub;
  const id = req.params.id;
  const name = (req.body && typeof req.body.name === 'string') ? req.body.name.trim() : '';
  if (!name) return res.status(400).json({ error: 'Missing name' });

  const { rows } = await pool.query(
    `UPDATE calculations
     SET name = $1
     WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL
     RETURNING id, name, created_at`,
    [name, id, userId]
  );

  const row = rows[0];
  if (!row) return res.status(404).json({ error: 'Not found' });
  return res.json({ calculation: row });
});

router.delete('/:id', requireAuth, async (req, res) => {
  const userId = req.user.sub;
  const id = req.params.id;

  const { rows } = await pool.query(
    `UPDATE calculations
     SET deleted_at = NOW()
     WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
     RETURNING id`,
    [id, userId]
  );

  const row = rows[0];
  if (!row) return res.status(404).json({ error: 'Not found' });
  return res.json({ ok: true });
});

router.post('/', requireAuth, async (req, res) => {
  const userId = req.user.sub;
  const { professione, riquadro, criterio, input, result } = req.body || {};

  if (!professione || !riquadro || !criterio || !input || !result) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const calcId = uuidv4();
  const docId = uuidv4();

  const { rows: userRows } = await pool.query(
    'SELECT id, email, nome, cognome, professione FROM users WHERE id = $1',
    [userId]
  );
  const user = userRows[0];
  if (!user) return res.status(404).json({ error: 'User not found' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: calcRows } = await client.query(
      `INSERT INTO calculations (id, user_id, professione, riquadro, criterio, input_json, result_json)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [calcId, userId, professione, riquadro, criterio, input, result]
    );

    const calculation = calcRows[0];

    const fileName = `${docId}.pdf`;
    const filePath = path.resolve(__dirname, `../../storage/docs/${fileName}`);

    await generateCalculationPdf({
      filePath,
      user,
      calculation,
      result,
    });

    await client.query(
      `INSERT INTO documents (id, user_id, calculation_id, type, file_path)
       VALUES ($1,$2,$3,$4,$5)`,
      [docId, userId, calcId, 'pdf', filePath]
    );

    await client.query('COMMIT');

    return res.status(201).json({ calculationId: calcId, documentId: docId });
  } catch {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

module.exports = router;
