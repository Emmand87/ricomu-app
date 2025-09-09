// src/ai_routes.js
import express from 'express';
import axios from 'axios';

const router = express.Router();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_HOST = process.env.OPENAI_API_HOST || 'https://api.openai.com/v1';
const KB_URL = process.env.KNOWLEDGE_BASE_URL || '';

/* ------------------- util ------------------- */
function daysBetween(d1, d2) {
  try {
    const a = new Date(d1), b = new Date(d2);
    if (isNaN(a) || isNaN(b)) return null;
    return Math.round((b - a) / (1000 * 60 * 60 * 24));
  } catch { return null; }
}

function detectCentralMotivoLocal(verbale = {}) {
  // euristica locale: notifica tardiva > 90 giorni
  const dd = daysBetween(verbale.dateInfrazione, verbale.dateNotifica);
  if (dd !== null && dd > 90) {
    return {
      type: 'Notifica tardiva',
      detail: `Intervallo ${dd} giorni tra infrazione e notifica; si eccepisce tardività della notifica e decadenza dai termini.`,
      citations: [{ ref: 'Termini di notifica verbali CdS (90 gg)', link: '' }]
    };
  }
  return null;
}

async function searchKbHints(verbale) {
  try {
    if (!KB_URL) return [];
    const qParts = [];
    if (verbale?.article) qParts.push(`articolo ${verbale.article}`);
    if (verbale?.authority) qParts.push(`${verbale.authority}`);
    if (verbale?.place) qParts.push(`${verbale.place}`);
    const q = encodeURIComponent(qParts.join(' ') || 'codice della strada ricorso');
    const { data } = await axios.get(`${KB_URL}/search?q=${q}`, { timeout: 8000 });
    const arr = Array.isArray(data) ? data : [];
    return arr.slice(0, 3).map(i => `${i.title} — ${i.url}`);
  } catch {
    return [];
  }
}

async function callOpenAIChat({ system, user }) {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY mancante');
  const url = `${OPENAI_HOST}/chat/completions`;
  const payload = {
    model: 'gpt-4o-mini',
    temperature: 0.2,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ]
  };
  const res = await axios.post(url, payload, {
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    timeout: 90000
  });
  return res.data?.choices?.[0]?.message?.content || '';
}

/* ------------------- prompt ------------------- */
function promptCentral(verbale) {
  return `
Sei un assistente legale per il Codice della Strada (Italia).
Dati del verbale:
${JSON.stringify(verbale || {}, null, 2)}

Compito:
- Se plausibile, individua UN solo "motivo centrale" del ricorso (es. notifica tardiva, taratura autovelox, segnaletica inadeguata, errori nei dati essenziali, incompetenza dell’ente, ecc.).
- Se non c'è, usa null.
- Aggiungi 0..3 citazioni sintetiche (articoli CdS, L. 689/1981, DPR 495/1992, Cassazione/Corte Cost. in forma generica).

Rispondi SOLO con JSON:
{
  "centralMotivo": { "type": "...", "detail": "...", "citations": [ {"ref": "...", "link": ""} ] } | null,
  "mainMotivi": [ { "type": "...", "detail": "...", "citations": [...] } ],
  "extraMotivi": [ { "type": "pretestuoso: ...", "citations": [...] } ]
}
`.trim();
}

function promptRicorso({ verbale, fallbackMode, kb = [] }) {
  const kbBlock = kb.length ? `\nFonti di contesto (non vincolanti):\n- ${kb.join('\n- ')}` : '';
  return `
Sei un avvocato. Redigi un RICORSO contro verbale CdS (Italia), in italiano formale e burocratico.
Dati verbale:
${JSON.stringify(verbale || {}, null, 2)}
Regole:
- Minimo 2000 parole.
- Struttura: Intestazione; Premesse/Fatti; Motivi principali; Motivi ulteriori/pretestuosi; Richiesta di accesso agli atti; Eccezioni generiche di riserva; Conclusioni; Allegati.
- Inserisci riferimenti generali a CdS (artt. 200–204, 126-bis, 142, 201), L. 689/1981, DPR 495/1992, giurisprudenza di massima (senza numeri specifici se non certi).
- Non inventare dati personali mancanti.
- ${fallbackMode ? 'Non è stato individuato un motivo centrale: elabora comunque un ricorso ricco con accesso atti + eccezioni + motivi pretestuosi (taratura apparecchi, segnaletica, motivazione, deleghe, competenza, individuazione luogo, termini).' : 'Se presenti motivi centrali credibili, valorizzali nei Motivi principali.'}
- Nessun markdown, nessun elenco puntato con asterischi: solo testo continuo in stile atto.

${kbBlock}
`.trim();
}

/* Ricorso lungo di emergenza (senza OpenAI) */
function buildLongFallbackRicorso(verbale = {}) {
  const V = {
    number: verbale.number || '—',
    authority: verbale.authority || 'Ente accertatore',
    article: verbale.article || 'art. ___ CdS',
    place: verbale.place || 'luogo dell’infrazione',
    dateInfrazione: verbale.dateInfrazione || '____-__-__',
    dateNotifica: verbale.dateNotifica || '____-__-__',
    amount: verbale.amount || '—',
    targa: verbale.targa || '—',
    owner: verbale.owner || { name: 'Nome Cognome' }
  };
  const dd = daysBetween(V.dateInfrazione, V.dateNotifica);
  const tard = dd && dd > 90 ? `Si evidenzia altresì che tra la data di presunta commissione dell’illecito (${V.dateInfrazione}) e la data di notifica (${V.dateNotifica}) sono decorsi ${dd} giorni, con conseguente eccezione di tardività della notifica e decadenza dai termini.` : '';

  const par = (t) => t + '\n\n';
  let out = '';

  out += par(`RICORSO AVVERSO VERBALE N. ${V.number} — ${V.authority}`);
  out += par(`Il/La sottoscritto/a ${V.owner.name}, in qualità di interessato, espone quanto segue in relazione al verbale indicato in oggetto, asseritamente elevato in data ${V.dateInfrazione} nel comune di ${V.place}, con riferimento a presunta violazione di ${V.article}, pari ad importo di ${V.amount} euro a carico del veicolo targa ${V.targa}.`);
  out += par(`PREMESSE IN FATTO — L’opponente ha ricevuto notifica del verbale in data ${V.dateNotifica}. ${tard} Si rappresenta, inoltre, che molteplici profili del procedimento sanzionatorio appaiono meritevoli di approfondimento e verifica istruttoria, come meglio infra esposto.`);

  // corpo lungo pretestuoso + accesso atti + eccezioni + conclusioni (testo esteso)
  const blocks = [
    'IN DIRITTO — RICHIAMI NORMATIVI GENERALI',
    'MOTIVI PRINCIPALI — VIZI DI FORMA E DI MOTIVAZIONE',
    'MOTIVI ULTERIORI — PROFILI TECNICI E PROCEDIMENTALI',
    'RICHIESTA DI ACCESSO AGLI ATTI E ISTRUTTORIA',
    'ECCEZIONI GENERICHE DI RISERVA',
    'CONCLUSIONI E ISTANZE'
  ];
  const longPara = `Si richiama la disciplina generale del Codice della Strada (artt. 200–204 CdS), la L. 689/1981 e il DPR 495/1992 per la parte regolamentare. In giurisprudenza si rinviene orientamento secondo cui il procedimento sanzionatorio deve rispettare principi di legalità, tipicità, ragionevolezza e trasparenza; l’atto deve risultare adeguatamente motivato e sorretto da idoneo corredo istruttorio. Con riferimento alla contestazione a mezzo dispositivo elettronico (ove del caso), l’amministrazione è onerata di provare il corretto funzionamento degli strumenti, la sussistenza dei presupposti di legge e la coerenza della segnaletica. In difetto, l’atto è affetto da vizio di legittimità.`;

  // Genera molte sezioni ciascuna con paragrafi ripetuti variati
  for (let i = 0; i < 16; i++) {
    out += par(`${blocks[i % blocks.length]}`);
    for (let j = 0; j < 6; j++) out += par(longPara);
  }

  out += par(`Alla luce di quanto esposto, l’opponente chiede che il verbale n. ${V.number} venga annullato per i profili di illegittimità dedotti e/o per l’accoglimento delle istanze istruttorie. In subordine, si chiede ogni misura ritenuta equa, con sospensione dei termini di pagamento in pendenza del presente procedimento. Si allegano copia del verbale e documento di identità. Luogo e data. Firma.`);
  return out;
}

/* ------------------- ROUTES ------------------- */

// 1) Motivi centrali
router.post('/motivi-central', async (req, res) => {
  try {
    const verbale = req.body?.verbale || {};
    // euristica locale immediata
    const local = detectCentralMotivoLocal(verbale);

    let json = { centralMotivo: local, mainMotivi: [], extraMotivi: [] };

    // prova anche OpenAI (se disponibile)
    if (OPENAI_API_KEY) {
      const kb = await searchKbHints(verbale);
      const system = 'Sei un assistente legale esperto di Codice della Strada. Rispondi solo con JSON valido.';
      const user = promptCentral(verbale) + (kb.length ? `\n\nSuggerimenti fonti:\n- ${kb.join('\n- ')}` : '');
      const raw = await callOpenAIChat({ system, user });
      try {
        const ai = JSON.parse(raw);
        json.centralMotivo = ai.centralMotivo || json.centralMotivo;
        json.mainMotivi = Array.isArray(ai.mainMotivi) ? ai.mainMotivi : json.mainMotivi;
        json.extraMotivi = Array.isArray(ai.extraMotivi) ? ai.extraMotivi : json.extraMotivi;
      } catch { /* keep local */ }
    }

    res.json(json);
  } catch (err) {
    console.error('[AI]/motivi-central', err?.response?.data || err.message);
    res.json({ centralMotivo: null, mainMotivi: [], extraMotivi: [] });
  }
});

// 2) Ricorso completo (usa fallback robusto se AI non disponibile)
router.post('/genera-ricorso', async (req, res) => {
  try {
    const verbale = req.body?.verbale || {};
    const fallbackMode = Boolean(req.body?.fallbackMode);

    const kb = await searchKbHints(verbale);
    const system = 'Sei un avvocato. Redigi un ricorso completo, stile burocratico, nessun markdown.';
    const user = promptRicorso({ verbale, fallbackMode, kb });

    let text = '';
    if (OPENAI_API_KEY) {
      try {
        text = await callOpenAIChat({ system, user });
      } catch (e) {
        console.error('[AI] OpenAI error:', e?.response?.data || e.message);
      }
    }

    // se AI non ha dato testo utile, usa fallback lungo deterministico
    if (!text || text.trim().length < 1200) {
      text = buildLongFallbackRicorso(verbale);
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(text);
  } catch (err) {
    console.error('[AI]/genera-ricorso fatal', err?.response?.data || err.message);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(buildLongFallbackRicorso(req.body?.verbale));
  }
});

export default router;
