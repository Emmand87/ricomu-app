// server.js
import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import pdfkit from 'pdfkit';
import cors from 'cors';
import tesseract from 'tesseract.js';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import OpenAI from 'openai';
import Stripe from 'stripe';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { extractPdfText } from './utils/pdfText.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
app.use(cors());
app.use(express.json());

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// === STEP 1: Upload multa ===
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    let text = "";

    if ((req.file.mimetype || '').includes('pdf')) {
      // Estrazione testo da PDF con pdfjs-dist
      text = await extractPdfText(req.file.buffer);
    } else {
      // OCR per immagini
      const { data } = await tesseract.recognize(req.file.buffer, 'ita');
      text = data.text;
    }

    res.json({ extracted: text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore durante l’estrazione del testo' });
  }
});

// === STEP 2: Genera ricorso ===
app.post('/api/generate', async (req, res) => {
  try {
    const { extracted } = req.body;
    if (!extracted) return res.status(400).json({ error: 'Nessun testo' });

    // Chiede motivazioni legali al knowledge service
    const kresp = await axios.post(process.env.KNOWLEDGE_URL + "/search", {
      queries: [extracted]
    });

    const knowledge = (kresp.data || []).map(r => r.content).join("\n---\n");

    // Prompt per generare ricorso completo
    const prompt = `
Sei un avvocato esperto in ricorsi per multe italiane.
Testo verbale: ${extracted}
Motivazioni legali trovate: ${knowledge}

Scrivi un ricorso di almeno 2000 parole, con riferimenti normativi, giurisprudenza,
e motivazioni principali + motivazioni aggiuntive.
`;

    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }]
    });

    const ricorso = resp.choices[0].message.content;

    // Genera PDF bozza (con watermark e non scaricabile definitivo)
    const filename = path.join(__dirname, 'ricorso-bozza.pdf');
    const doc = new pdfkit();
    doc.fontSize(14).text("=== BOZZA NON UTILIZZABILE ===", { align: "center" });
    doc.moveDown();
    doc.fontSize(12).text(ricorso);
    doc.end();

    const writeStream = fs.createWriteStream(filename);
    doc.pipe(writeStream);
    writeStream.on("finish", () => {
      res.json({ preview: "/ricorso-bozza.pdf" });
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Errore generazione ricorso' });
  }
});

// === STEP 3: Pagamento ===
app.post('/api/pay', async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount) return res.status(400).json({ error: "Nessun importo" });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: { name: 'Ricorso Multe' },
            unit_amount: amount * 100
          },
          quantity: 1
        }
      ],
      success_url: process.env.PUBLIC_BASE_URL + '/success',
      cancel_url: process.env.PUBLIC_BASE_URL + '/cancel'
    });

    res.json({ url: session.url });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Errore creazione pagamento' });
  }
});

app.get('/ricorso-bozza.pdf', (req, res) => {
  const filename = path.join(__dirname, 'ricorso-bozza.pdf');
  res.sendFile(filename);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("App RICOMU attiva su porta " + PORT));
