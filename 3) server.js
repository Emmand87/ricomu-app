import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { createWorker } from 'tesseract.js';
import pdfParse from 'pdf-parse';
import Stripe from 'stripe';

import { parseOCRText } from './utils/extract.js';
import { detectMotivations } from './utils/motivations.js';
import { buildText } from './utils/generator.js';
import { createPdfFromText } from './utils/pdf.js';
import { registerAIRoutes } from './ai_routes.js';

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json({ limit: '8mb' }));
app.use(express.static('public'));
app.use('/output', express.static('output'));
registerAIRoutes(app);

// OCR worker (italiano)
const workerPromise = (async () => {
  const worker = await createWorker('ita');
  return worker;
})();

// Stripe
const stripeSecret = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecret ? new Stripe(stripeSecret, { apiVersion: '2024-06-20' }) : null;
const BASE_URL = process.env.PUBLIC_BASE_URL || 'http://localhost:3000';

// Store in memoria (in produzione: DB)
const store = new Map();

function priceForAmount(amount) {
  if (amount <= 50) return 15;
  if (amount <= 100) return 19;
  if (amount <= 200) return 29;
  return 39;
}

app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'File mancante' });
    let text = '';
    if ((req.file.mimetype || '').includes('pdf')) {
      const data = await pdfParse(req.file.buffer);
      text = data.text || '';
    } else {
      const worker = await workerPromise;
      const { data } = await worker.recognize(req.file.buffer, { lang: 'ita' });
      text = data.text || '';
    }
    const parsed = parseOCRText(text);
    parsed.targa = parsed.targa || '';
    parsed.owner = { name: '', comune: '', dataNascita: '', indirizzo: '', cf: '' };

    // euristica locale (fallback)
    const motivations = detectMotivations(parsed);
    res.json({ verbale: parsed, motivations });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Parsing fallito' });
  }
});

app.post('/api/motivazioni/auto', (req, res) => {
  const v = req.body?.verbale || {};
  const motivations = detectMotivations(v);
  res.json({ motivations });
});

app.post('/api/generate/preview', (req, res) => {
  const template = JSON.parse(fs.readFileSync('./templates/template.json', 'utf-8'));
  const citations = JSON.parse(fs.readFileSync('./templates/citations.json', 'utf-8'));
  const { verbale, motivi } = req.body || {};
  const text = buildText(template, verbale || {}, motivi || {}, citations, template.target_total_words || 2000);
  res.json({ text });
});

app.post('/api/checkout/price', (req, res) => {
  const amount = parseFloat((req.body?.amount ?? 0));
  const price = priceForAmount(amount);
  res.json({ price, priceFormatted: `€ ${price.toFixed(2)}` });
});

app.post('/api/store/payload', (req, res) => {
  const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
  store.set(token, { payload: req.body, createdAt: Date.now() });
  res.json({ token });
});

app.post('/api/checkout/create-session', async (req, res) => {
  try {
    if (!stripe) return res.status(500).json({ error: 'Stripe non configurato' });
    const amount = parseFloat((req.body?.amount ?? 0));
    const token = req.body?.token;
    if (!token || !store.has(token)) return res.status(400).json({ error: 'Token non valido' });
    const price = priceForAmount(amount);
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      client_reference_id: token,
      line_items: [{
        price_data: { currency: 'eur', product_data: { name: 'RICOMU – PDF finale ricorso' }, unit_amount: Math.round(price * 100) },
        quantity: 1
      }],
      success_url: `${BASE_URL}/success.html?token=${encodeURIComponent(token)}`,
      cancel_url: `${BASE_URL}`
    });
    res.json({ url: session.url });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Errore Stripe' });
  }
});

app.get('/api/checkout/verify', async (req, res) => {
  try {
    if (!stripe) return res.status(500).json({ error: 'Stripe non configurato' });
    const token = (req.query.token || '').toString();
    if (!token || !store.has(token)) return res.status(400).json({ error: 'Token non valido' });
    const sessions = await stripe.checkout.sessions.list({ limit: 50 });
    const match = sessions.data.find(s => s.client_reference_id === token && s.payment_status === 'paid');
    if (!match) return res.status(402).json({ error: 'Pagamento non risultante' });

    const template = JSON.parse(fs.readFileSync('./templates/template.json', 'utf-8'));
    const citations = JSON.parse(fs.readFileSync('./templates/citations.json', 'utf-8'));
    const { verbale, motivi, ricorsoAI } = store.get(token).payload || {};
    const text = (ricorsoAI && ricorsoAI.length > 300)
      ? ricorsoAI
      : buildText(template, verbale || {}, motivi || {}, citations, template.target_total_words || 2000);

    const out = path.join('output', 'ricorso-finale.pdf');
    await createPdfFromText({ text, outPath: out, watermark: null });
    res.json({ path: '/' + out });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Errore verifica/generazione PDF' });
  }
});

app.get('/api/vademecum', (req, res) => {
  const cfg = JSON.parse(fs.readFileSync('./config/legal-config.json', 'utf-8'));
  const k = (req.query.path || 'gdp').toString().toLowerCase();
  const entry = cfg.vademecum[k] || cfg.vademecum.gdp;
  res.json({ message: `Attendi circa ${entry.attesa_giorni} giorni (${k.toUpperCase()}). Nota: valore configurabile.` });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server RICOMU su http://localhost:' + PORT));
