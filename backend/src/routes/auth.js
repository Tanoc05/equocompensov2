const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const https = require('https');
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
      avatar_url: user.avatar_url,
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function requestResendSendEmail({ apiKey, from, to, subject, html, text }) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ from, to, subject, html, text });

    const req = https.request(
      {
        hostname: 'api.resend.com',
        path: '/emails',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += String(chunk);
        });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            return resolve({ ok: true });
          }
          return reject(new Error(`Resend error (${res.statusCode}): ${data || 'Unknown'}`));
        });
      }
    );

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function generateNumericOtp(length) {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += String(crypto.randomInt(0, 10));
  }
  return out;
}

function hashOtp(code) {
  const pepper = process.env.OTP_PEPPER || process.env.JWT_SECRET || '';
  return crypto.createHash('sha256').update(`${code}:${pepper}`).digest('hex');
}

function buildOtpEmailHtml({ otpCode, logoUrl }) {
  const safeLogoUrl = logoUrl || '';
  return `<!doctype html>
<html lang="it">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Codice di verifica</title>
  </head>
  <body style="margin:0;padding:0;background:#f5f7fb;font-family:Arial, sans-serif;">
    <div style="max-width:640px;margin:0 auto;padding:24px;">
      <div style="background:#ffffff;border:1px solid #e6eaf2;padding:24px;">
        <div style="text-align:center;padding-bottom:16px;">
          ${safeLogoUrl ? `<img src="${safeLogoUrl}" alt="Equo Compenso" style="display:block;margin:0 auto;max-width:240px;width:auto;height:auto;" />` : ''}
        </div>
        <div style="color:#1C4D8D;font-size:18px;font-weight:700;margin-bottom:12px;">Codice di verifica</div>
        <div style="color:#111827;font-size:14px;line-height:1.6;">
          Gentile utente, il tuo codice di verifica per accedere ai calcoli di Equo Compenso è:
        </div>
        <div style="margin:18px 0;padding:14px 16px;background:#eef3ff;border:1px solid #d9e3ff;text-align:center;font-size:26px;letter-spacing:6px;color:#1C4D8D;font-weight:800;">${otpCode}</div>
        <div style="color:#6b7280;font-size:12px;line-height:1.5;">
          Il codice è valido per 10 minuti.
        </div>
        <hr style="border:none;border-top:1px solid #e6eaf2;margin:20px 0;" />
        <div style="color:#6b7280;font-size:12px;line-height:1.5;">Se non hai richiesto tu questo codice, ignora questa email.</div>
        <div style="color:#6b7280;font-size:12px;line-height:1.5;margin-top:8px;">Giardini Naxos | info@equocompenso.eu | 0942 550660</div>
      </div>
    </div>
  </body>
</html>`;
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
       RETURNING id, email, nome, cognome, professione, avatar_url`,
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
    'SELECT id, email, password_hash, nome, cognome, professione, avatar_url FROM users WHERE email = $1',
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
  return res.json({ token, user: { id: user.id, email: user.email, nome: user.nome, cognome: user.cognome, professione: user.professione, avatar_url: user.avatar_url } });
});

router.post('/otp/resend', async (req, res) => {
  const { email } = req.body || {};
  const normalizedEmail = String(email || '').trim().toLowerCase();

  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    return res.status(400).json({ error: 'Invalid email' });
  }

  const otpLength = 6;
  const expiryMinutes = 10;
  const cooldownSeconds = 60;

  try {
    const existing = await pool.query('SELECT last_sent_at FROM email_otps WHERE email = $1', [normalizedEmail]);
    if (existing.rows && existing.rows[0] && existing.rows[0].last_sent_at) {
      const last = new Date(existing.rows[0].last_sent_at);
      const elapsedSeconds = Math.floor((Date.now() - last.getTime()) / 1000);
      if (elapsedSeconds < cooldownSeconds) {
        return res.status(429).json({ error: 'Cooldown', retryAfterSeconds: cooldownSeconds - elapsedSeconds });
      }
    }

    const otpCode = generateNumericOtp(otpLength);
    const otpHash = hashOtp(otpCode);
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

    await pool.query(
      `INSERT INTO email_otps (email, otp_hash, expires_at, last_sent_at, attempts)
       VALUES ($1, $2, $3, NOW(), 0)
       ON CONFLICT (email)
       DO UPDATE SET otp_hash = $2, expires_at = $3, last_sent_at = NOW(), attempts = 0`,
      [normalizedEmail, otpHash, expiresAt]
    );

    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      return res.status(500).json({ error: 'Missing email provider configuration' });
    }

    const baseUrl = process.env.PUBLIC_APP_URL || process.env.APP_BASE_URL || process.env.FRONTEND_BASE_URL || '';
    const logoUrl = baseUrl ? `${String(baseUrl).replace(/\/$/, '')}/img/logo2.png` : '';
    const html = buildOtpEmailHtml({ otpCode, logoUrl });

    await requestResendSendEmail({
      apiKey: resendApiKey,
      from: 'Equo Compenso <info@equocompenso.eu>',
      to: normalizedEmail,
      subject: 'Codice di verifica - Equo Compenso',
      html,
      text: `Gentile utente, il tuo codice di verifica per accedere ai calcoli di Equo Compenso è: ${otpCode}.`,
    });

    return res.json({ ok: true, expiresInSeconds: expiryMinutes * 60 });
  } catch (e) {
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
