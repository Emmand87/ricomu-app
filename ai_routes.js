// src/ai_routes.js
// Router AI per: (1) motivi centrali; (2) generazione ricorso con fallbackMode
// Funziona con package.json "type": "module"

import express from 'express';
import axios from 'axios';

const router = express.Router();

// --- Assunzioni:
// - Variabili env: OPENAI_API_KEY, KNOWLEDGE_BASE_URL (servizio RAG), OPENAI_API_HOST opzionale
// - Il servizio knowledge risponde su /search?q=... con risultati (title, url, snippet)

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_HOST = process.env.OPENAI_API_HOST || 'https://api.openai.com/v1';
const KB_URL = process.env.KNOWLEDGE_BASE_URL; // es: https://ricomu-knowledge-service.onrender.com

if (!OPENAI_API_KEY) {
  console.warn('[AI] OPENAI_API_KEY mancante: /api/ai/* non funzionerà.');
}
if (!KB_URL) {
  console.warn('[AI] KNOWLEDGE_BASE_URL mancante: /api/ai/* userà meno fonti.');
}

// Utility prompt helper
function buildCentralMotivoPrompt(verbale) {
  const v = verbale || {};
  return `
Sei un assistente legale specializzato nel Codice della Strada (Italia).
In base ai dati del verbale qui sotto, individua un SOLO "motivo centrale" del ricorso, se plausibile.
Dati verbale (JSON):
${JSON.stringify(v, null, 2)}

Istruzioni:
- Valuta ipotesi comuni: notifica tardiva, taratura autovelox, segnaletica assente, competenza ente, errore dati soggetto/luogo/data, motivazione insufficiente, ecc.
- Se NON trovi motivo plausibile, restituisci centralMotivo=null.
- Fornisci anche 0..3 citazioni sintetiche da fonti ufficiali (leggi/decreti/sentenze/linee guida ministeriali). Non servono URL perfetti, bastano riferimenti testuali (es. "art. 201 C.d.S.", "Corte Cost. n. 113/2015").

RISPOSTA: un JSON con chiavi:
{
  "centralMotivo": { "type": "...", "detail": "...", "citations": [ {"ref": "...", "link": ""} ] } | null,
  "mainMotivi": [ { "type": "...", "detail": "...", "citations": [...] } ],
  "extraMotivi": [ { "type": "pretestuoso: ...", "citations": [...] } ]
}
Non aggiungere testo fuori dal JSON.
`.trim();
}

function buildRicorsoPrompt({ verbale, fallbackMode }) {
  const header = `
Sei un avvocato amministrativista. Redigi un RICORSO contro verbale del Codice della Strada (Italia).
Output: testo integrale italiano, formale, burocratico, min. 2000 parole.
`.trim();

  const bodyCommon = `
Dati verbale (JSON):
${JSON.stringify(verbale || {}, null, 2)}

Regole generazione:
- Se sono presenti motivi centrali credibili → mettili in "Motivi principali".
- ${fallbackMode ? 'NON sono stati individuati motivi centrali → redigi comunque un ricorso con: "richiesta di accesso agli atti", "eccezioni generiche di riserva", e un blocco corposo di motivi pretestuosi (taratura autovelox, segnaletica, deleghe, catasto strade, omessa motivazione, errata individuazione del luogo, errata notifica, competenza). Non inventare fatti, resta generico ma formale.' : 'Integra sempre una sezione di “richiesta di accesso agli atti” e “eccezioni di riserva”.'}
- Struttura: Intestazione (Autorità competente), Premesse/Fatti, Motivi (principali + pretestuosi), Accesso Atti, Eccezioni di Riserva, Conclusioni (istanze), Elenco allegati.
- Linguaggio jurídico, citazioni al Codice della Strada (artt. 200-204, 126-bis, 142, 201, ecc.), L. 689/1981, DPR 495/1992, e richiami giurisprudenziali di massima (Cass., Corte Cost.) in forma sintetica (senza citare numeri se non certi).
- NON inserire dati personali inesistenti; usa segnaposti se mancano (es. “Nome Cognome”).
- Nessun markdown né JSON: solo il testo del ricorso.
`.trim();

  return `${header}\n\n${bodyCommon}`;
}

// --- Chiamata OpenAI (completions/chat completions compatibile)
async function callOpenAI({ system, user }) {
  const url = `${OPENAI_HOST}/chat/completions`;
  const payload = {
    model: 'gpt-4o-mini', // modello economico e capace per testo lungo; cambia se vuoi
    temperature: 0.2,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ]
  };
  const res = await axios.post(url, payload, {
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    timeout: 60000
  });
  const text = res.data?.choices?.[0]?.message?.content || '';
  return text;
}

// --- Arricchimento fonti (RAG light)
async function searchKbHints(verbale) {
  try {
    if (!KB_URL) return [];
    const qParts = [];
    if (verbale?.article) qParts.push(`articolo ${verbale.article}`);
    if (verbale?.authority) qParts.push(`${verbale.authority}`);
    if (verbale?.place) qParts.push(`${verbale.place}`);
    const q = encodeURIComponent(qParts.join(' ') || 'codice della strada basi ricorso');
    const { data } = await axios.get(`${KB_URL}/search?q=${q}`, { timeout: 8000 });
    const items = Array.isArray(data) ? data.slice(0, 3) : [];
    return items.map(i => `${i.title} — ${i.url}`); // stringhe brevi che l’AI può usare come spunto
  } catch {
    return [];
  }
}

/* ===================== ROUTES ===================== */

// 1) Individuazione motivo centrale
router.post('/motivi-central', async (req, res) => {
  try {
    const verbale = req.body?.verbale || {};
    const kb = await searchKbHints(verbale);
    const prompt = buildCentralMotivoPrompt(verbale) + (kb.length ? `\n\nSuggerimenti fonti:\n- ${kb.join('\n- ')}` : '');
    const system = 'Sei un assistente legale esperto di Codice della Strada. Rispondi solo con JSON valido.';
    const out = await callOpenAI({ system, user: prompt });

    // prova parse; se fallisce, restituisci struttura safe
    let json;
    try { json = JSON.parse(out); }
    catch { json = { centralMotivo: null, mainMotivi: [], extraMotivi: [] }; }

    // normalizza chiavi
    if (!('centralMotivo' in json)) json.centralMotivo = null;
    if (!Array.isArray(json.mainMotivi)) json.mainMotivi = [];
    if (!Array.isArray(json.extraMotivi)) json.extraMotivi = [];

    res.json(json);
  } catch (err) {
    console.error('[AI] /motivi-central error', err?.response?.data || err.message);
    res.json({ centralMotivo: null, mainMotivi: [], extraMotivi: [] });
  }
});

// 2) Genera ricorso (usa fallbackMode se manca motivo centrale)
router.post('/genera-ricorso', async (req, res) => {
  try {
    const verbale = req.body?.verbale || {};
    const fallbackMode = Boolean(req.body?.fallbackMode);

    const kb = await searchKbHints(verbale);
    const user = buildRicorsoPrompt({ verbale, fallbackMode }) + (kb.length ? `\n\nFonti di contesto (non vincolanti):\n- ${kb.join('\n- ')}` : '');
    const system = 'Sei un avvocato. Redigi il ricorso completo in italiano, stile burocratico, senza markdown.';

    const text = await callOpenAI({ system, user });

    // sicurezza: mai vuoto
    const safe = text && text.trim().length > 100
      ? text
      : 'RICORSO – Testo generico: richiesta accesso agli atti; eccezioni di riserva; vizi procedurali… (contenuto generato non pervenuto).';

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(safe);
  } catch (err) {
    console.error('[AI] /genera-ricorso error', err?.response?.data || err.message);
    res.status(200).send('RICORSO – fallback: richiesta di accesso agli atti, eccezioni generiche di riserva, vizi procedurali (contenuto di emergenza).');
  }
});

export default router;
