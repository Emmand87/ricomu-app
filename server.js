// server.js
import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import PDFDocument from 'pdfkit';
import cors from 'cors';
import tesseract from 'tesseract.js';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import OpenAI from 'openai';
import Stripe from 'stripe';
import { fileURLToPath } from 'url';
import aiRouter from './ai_routes.js';
import { dirname } from 'path';
import { extractPdfText } from './utils/pdfText.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json({ limit: '8mb' }));

app.use('/api/ai', aiRouter);

// ➜ SERVE la UI (index.html, app.js, ecc.)
app.use(express.static(path.join(__dirname, 'public')));

// cartella per file generati (PDF finale/bozza)
const OUTPUT_DIR = path.join(__dirname, 'public');
app.use('/output', express.static(OUTPUT_DIR));

// rotta salute per debug rapido
app.get('/health', (_req, res) => res.json({ ok: true }));

// fallback esplicito alla home (utile su alcuni hosting)
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Stripe e OpenAI (con controlli chiave)
const stripeKey = process.env.STRIPE_SECRET_KEY || '';
const stripe = stripeKey ? new Stripe(stripeKey) : null;
const openaiKey = process.env.OPENAI_API_KEY || '';
const openai = openaiKey ? new OpenAI({ apiKey: openaiKey }) : null;

// === STEP 1: Upload multa (PDF o immagine) ===
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'File mancante' });

    let text = '';
    const mime = req.file.mimetype || '';

    if (mime.includes('pdf')) {
      // Estrazione testo da PDF con pdfjs-dist
      text = await extractPdfText(req.file.buffer);
    } else {
      // OCR per immagini (italiano)
      const { data } = await tesseract.recognize(req.file.buffer, 'ita');
      text = data.text || '';
    }

    res.json({ extracted: text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore durante l’estrazione del testo' });
  }
});

// === STEP 2: Genera ricorso con AI + knowledge-service ===
app.post('/api/generate', async (req, res) => {
  try {
    const { extracted } = req.body || {};
    if (!extracted) return res.status(400).json({ error: 'Nessun testo' });
    if (!openai) return res.status(500).json({ error: 'OPENAI_API_KEY mancante' });
    if (!process.env.KNOWLEDGE_URL) return res.status(500).json({ error: 'KNOWLEDGE_URL mancante' });

    // recupera contesto legale dal knowledge service
    const kresp = await axios.post(`${process.env.KNOWLEDGE_URL}/search`, {
      queries: [extracted],
      k: 12
    });
    const knowledge = (kresp.data || []).map(r => r.content).join('\n---\n');

    const prompt = `
Sei un avvocato esperto in ricorsi per multe italiane.
Testo del verbale (OCR/parsing):
${extracted}

Fonti/contesto:
${knowledge}

Scrivi un ricorso completo (>=2000 parole), con:
- motivi principali (incluso il motivo centrale)
- motivi aggiuntivi/pretestuosi
- riferimenti normativi (CdS, L. 241/1990, ecc.) e giurisprudenza
- conclusioni e richieste
Stile formale/burocratico.`;

    const ai = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      messages: [{ role: 'user', content: prompt }]
    });

    const ricorso = ai.choices?.[0]?.message?.content || 'Testo non disponibile';

    // Genera BOZZA con watermark dentro /public per essere servita via HTTP
    const filename = path.join(OUTPUT_DIR, 'ricorso-bozza.pdf');
    const doc = new PDFDocument({ size: 'A4', margins: { top: 56, left: 56, right: 56, bottom: 56 } });
    const stream = fs.createWriteStream(filename);
    doc.pipe(stream);

    // watermark “BOZZA NON UTILIZZABILE”
    doc.save();
    doc.fillColor('gray');
    doc.rotate(-30, { origin: [300, 400] });
    doc.fontSize(40).opacity(0.15).text('BOZZA NON UTILIZZABILE', 80, 200);
    doc.opacity(1).restore();

    doc.fontSize(14).fillColor('black').text('Ricorso (bozza anteprima)', { align: 'center', underline: true }).moveDown();
    doc.fontSize(11).text(ricorso, { align: 'justify' });
    doc.end();

    stream.on('finish', () => {
      // restituisco il path relativo (sarà visibile come /ricorso-bozza.pdf)
      res.json({ preview: '/ricorso-bozza.pdf' });
    });
    stream.on('error', (e) => {
      console.error(e);
      res.status(500).json({ error: 'Errore creazione PDF bozza' });
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Errore generazione ricorso' });
  }
});

// === STEP 3: Pagamento Stripe ===
app.post('/api/pay', async (req, res) => {
  try {
    if (!stripe) return res.status(500).json({ error: 'STRIPE_SECRET_KEY mancante' });

    const { amount } = req.body || {};
    if (!amount) return res.status(400).json({ error: 'Nessun importo' });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: { name: 'Ricorso Multe - PDF finale' },
          unit_amount: Math.round(Number(amount) * 100)
        },
        quantity: 1
      }],
      success_url: `${process.env.PUBLIC_BASE_URL}/success.html`,
      cancel_url: `${process.env.PUBLIC_BASE_URL}/`
    });

    res.json({ url: session.url });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Errore creazione pagamento' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('RICOMU app live on http://localhost:' + PORT);
});

