require('dotenv').config();
const path = require('path');
const express = require('express');

const {
  MAILGUN_API_KEY,
  MAILGUN_DOMAIN = 'mail.bina.cloud',
  MAILGUN_SENDER_EMAIL = 'noreply@bina.cloud',
  MAILGUN_SENDER_NAME = 'BinaXone Website',
  SALES_INBOX = 'sales@bina.cloud',
  PORT = 8080,
} = process.env;

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '16kb' }));
app.use(express.static(__dirname));

app.get('/healthz', (_req, res) => res.status(200).send('ok'));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FROM = `${MAILGUN_SENDER_NAME} <${MAILGUN_SENDER_EMAIL}>`;
const MG_URL = `https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`;
const MG_AUTH = 'Basic ' + Buffer.from(`api:${MAILGUN_API_KEY || ''}`).toString('base64');

async function sendMail(fields) {
  const body = new URLSearchParams(fields);
  const res = await fetch(MG_URL, {
    method: 'POST',
    headers: {
      Authorization: MG_AUTH,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Mailgun ${res.status}: ${text.slice(0, 300)}`);
  }
}

app.post('/api/contact', async (req, res) => {
  const { name = '', email = '', message = '', hp_field_xyz = '' } = req.body || {};

  if (hp_field_xyz.trim() !== '') {
    return res.status(200).json({ ok: true });
  }

  const cleanName = String(name).trim();
  const cleanEmail = String(email).trim();
  const cleanMessage = String(message).trim();

  if (!cleanName || !EMAIL_RE.test(cleanEmail) || !cleanMessage) {
    return res.status(400).json({ ok: false, error: 'Please fill in name, a valid email, and a message.' });
  }
  if (cleanName.length > 200 || cleanEmail.length > 200 || cleanMessage.length > 5000) {
    return res.status(400).json({ ok: false, error: 'Submission too long.' });
  }

  if (!MAILGUN_API_KEY) {
    console.error('MAILGUN_API_KEY is not configured.');
    return res.status(500).json({ ok: false, error: 'Server is not configured to send mail.' });
  }

  const notification = {
    from: FROM,
    to: SALES_INBOX,
    'h:Reply-To': cleanEmail,
    subject: `New Contact Sales inquiry — ${cleanName}`,
    text: `Name: ${cleanName}\nEmail: ${cleanEmail}\n\nMessage:\n${cleanMessage}\n`,
  };

  const ack = {
    from: FROM,
    to: cleanEmail,
    subject: 'We received your message — BinaXone',
    text:
      `Hi ${cleanName},\n\n` +
      `Thanks for reaching out to BinaXone. We've received your message and a member of our team will get back to you within 1 business day.\n\n` +
      `For your records, here is what you sent:\n\n` +
      `${cleanMessage}\n\n` +
      `— BinaXone Sales\nBina Cloudtech Sdn Bhd, Putrajaya\n`,
  };

  try {
    await sendMail(notification);
    try {
      await sendMail(ack);
    } catch (ackErr) {
      console.error('Auto-ack failed (notification was sent):', ackErr.message);
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error('Mailgun send failed:', err.message);
    return res.status(502).json({ ok: false, error: 'Could not send your message right now.' });
  }
});

const server = app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server.');
  server.close(() => process.exit(0));
});
