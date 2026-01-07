const path = require('path');
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const { ensureSchema } = require('./db/schema');
const authRoutes = require('./routes/auth');
const meRoutes = require('./routes/me');
const calculationsRoutes = require('./routes/calculations');
const documentsRoutes = require('./routes/documents');

const app = express();

app.use(morgan('dev'));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.use('/api/auth', authRoutes);
app.use('/api/me', meRoutes);
app.use('/api/calculations', calculationsRoutes);
app.use('/api/documents', documentsRoutes);

// Serve frontend static
const frontendDir = path.resolve(__dirname, '../../frontend');
app.use(express.static(frontendDir));

// SPA-ish fallback (for direct navigation)
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
});

const port = Number(process.env.PORT || 3000);

(async () => {
  await ensureSchema();
  app.listen(port, () => {
    console.log(`Backend listening on http://localhost:${port}`);
  });
})();
