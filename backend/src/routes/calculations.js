const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const { pool } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { generateCalculationPdf } = require('../services/pdf');

const router = express.Router();

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
