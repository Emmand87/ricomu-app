// src/meta_routes.js
import express from 'express';
import axios from 'axios';

const router = express.Router();

/* ============================================================
   1) AUTORITÀ — elenco esteso (puoi aggiungere altre voci)
   ============================================================ */
const AUTHORITIES = [
  // Forze di polizia e corpi locali
  'Polizia Locale', 'Polizia Municipale', 'Polizia Metropolitana', 'Polizia Provinciale',
  'Polizia Stradale', 'Carabinieri', 'Guardia di Finanza', 'Polizia Ferroviaria',
  'Polizia Penitenziaria (aree di competenza)', 'Esercito (aree militari)',
  // Enti proprietari/gestori di strade
  'Comune', 'Città Metropolitana', 'Provincia', 'Regione', 'ANAS',
  'Concessionario Autostradale', 'Società Autostrada per l’Italia (o altri concessionari)',
  'Consorzio per la viabilità', 'Ente Parco (strade interne)',
  // Autorità amministrative
  'Prefettura', 'Questura', 'Ufficio Territoriale del Governo',
  // Aree speciali
  'Capitaneria di Porto (aree portuali)', 'Autorità di Sistema Portuale',
  'Ente Parco Nazionale/Regionale', 'Autorità Aeroportuale/ENAC (aree aeroportuali)',
  'Ferrovie dello Stato (aree di competenza)', 'RFI (aree ferroviarie)',
  // Altri organi con compiti specifici
  'Ispettorato del Lavoro (trasporto merci/persone – ambiti specifici)',
  'Motorizzazione Civile (Uffici Provinciali – accertamenti documentali)',
  // Polizie locali specifiche (sinonimi ricorrenti)
  'Vigili Urbani', 'Corpo di Polizia Locale', 'Comando Polizia Municipale',
  // Corpi di vigilanza territoriale
  'Guardie Ecologiche/Zoofile (limiti specifici)', 'Guardie Parco (limiti specifici)'
];

/* ============================================================
   2) ARTICOLI CdS — generati 1..240 + più usati “bis/ter…”
   Fonti di contesto:
   - Il CdS ha ~240–245 articoli (d.lgs. 285/1992) e regolamento di esecuzione. :contentReference[oaicite:1]{index=1}
   ============================================================ */
function buildCdSArticles() {
  const base = [];
  for (let i = 1; i <= 240; i++) base.push(`Art. ${i}`);
  // Aggiunte comuni con suffisso
  const extras = [
    'Art. 34-bis', 'Art. 61-bis', 'Art. 116-bis', 'Art. 121-bis',
    'Art. 126-bis', 'Art. 142-bis', 'Art. 164-bis', 'Art. 168-bis',
    'Art. 180-bis', 'Art. 201-bis', 'Art. 204-bis', 'Art. 218-bis'
  ];
  // Etichette descrittive per i più usati (servono per la ricerca testuale)
  const labels = {
    7:  'Art. 7 — Regolamentazione nei centri abitati',
    37: 'Art. 37 — Segnaletica stradale',
    116:'Art. 116 — Patente di guida',
    121:'Art. 121 — Esami di idoneità',
    126:'Art. 126-bis — Decurtazione punti',
    141:'Art. 141 — Velocità',
    142:'Art. 142 — Limiti di velocità',
    146:'Art. 146 — Violazione della segnaletica',
    154:'Art. 154 — Cambiamento di direzione/senso',
    157:'Art. 157 — Arresto, fermata e sosta',
    158:'Art. 158 — Divieto di sosta e fermata',
    171:'Art. 171 — Casco',
    173:'Art. 173 — Uso apparecchi durante la guida',
    180:'Art. 180 — Documenti di circolazione',
    186:'Art. 186 — Guida in stato di ebbrezza',
    187:'Art. 187 — Sostanze stupefacenti',
    188:'Art. 188 — Veicoli al servizio di persone con disabilità',
    193:'Art. 193 — Assicurazione RC',
    200:'Art. 200 — Contestazione immediata',
    201:'Art. 201 — Notificazione delle violazioni',
    203:'Art. 203 — Ricorso al Prefetto',
    204:'Art. 204 — Ordinanza-ingiunzione del Prefetto',
    205:'Art. 204-bis — Ricorso al Giudice di Pace'
  };
  // Sostituisci l’etichetta dove disponibile
  Object.keys(labels).forEach(k => {
    const i = parseInt(k, 10);
    if (i >= 1 && i <= 240) base[i - 1] = labels[k];
  });
  return [...base, ...extras];
}
const CDS_ARTICLES = buildCdSArticles();

/* ============================================================
   3) COMUNI — fetch dinamico da ISTAT (CSV ufficiale)
   - URL di default: dataset ISTAT “Elenco comuni italiani” (CSV). :contentReference[oaicite:2]{index=2}
   - Puoi sovrascrivere con process.env.MUNICIPALITIES_SOURCE_URL
   - Cache in memoria (refresh ogni 24h)
   ============================================================ */
const MUNICIPALITIES_SOURCE_URL =
  process.env.MUNICIPALITIES_SOURCE_URL ||
  'https://www.istat.it/storage/codici-unita-amministrative/Elenco-comuni-italiani.csv';

let municipalitiesCache = { list: [], fetchedAt: 0 };

function parseIstatCSV(text) {
  // CSV separato da ; — cerchiamo la colonna “Denominazione in italiano”
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  const header = lines[0].split(';').map(s => s.replace(/(^"|"$)/g,''));
  const idxName = header.findIndex(h => /Denominazione in italiano/i.test(h));
  if (idxName === -1) return [];
  const names = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(';').map(s => s.replace(/(^"|"$)/g,''));
    const name = cols[idxName]?.trim();
    if (name) names.push(name);
  }
  // rimuovi duplicati e ordina
  return Array.from(new Set(names)).sort((a,b)=>a.localeCompare(b,'it'));
}

async function ensureMunicipalities() {
  const now = Date.now();
  const freshForMs = 24 * 60 * 60 * 1000; // 24h
  if (municipalitiesCache.list.length && (now - municipalitiesCache.fetchedAt) < freshForMs) {
    return municipalitiesCache.list;
  }
  try {
    const { data } = await axios.get(MUNICIPALITIES_SOURCE_URL, { responseType: 'text', timeout: 20000 });
    const list = parseIstatCSV(data);
    if (list.length) {
      municipalitiesCache = { list, fetchedAt: now };
      return list;
    }
  } catch (e) {
    console.error('[meta] ISTAT fetch error:', e.message);
  }
  // fallback minimale se il fetch fallisce
  if (!municipalitiesCache.list.length) {
    municipalitiesCache.list = [
      'Roma','Milano','Napoli','Torino','Palermo','Genova','Bologna','Firenze','Bari','Catania','Venezia','Verona','Trieste','Padova','Taranto','Brescia'
    ];
    municipalitiesCache.fetchedAt = now;
  }
  return municipalitiesCache.list;
}

/* ============================================================
   HELPERS DI RICERCA
   ============================================================ */
function search(arr, q = '', limit = 20) {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return arr.slice(0, limit);
  const res = arr.filter(v => v.toLowerCase().includes(s));
  return res.slice(0, limit);
}

/* ============================================================
   ROUTES
   ============================================================ */

// GET /api/meta/authorities?q=pol
router.get('/authorities', (req, res) => {
  const out = search(AUTHORITIES, req.query.q, 25);
  res.json(out);
});

// GET /api/meta/cds-articles?q=146
router.get('/cds-articles', (req, res) => {
  const out = search(CDS_ARTICLES, req.query.q, 40);
  res.json(out);
});

// GET /api/meta/municipalities?q=rom
router.get('/municipalities', async (req, res) => {
  const list = await ensureMunicipalities();
  // ricerca case-insensitive con accenti
  let q = String(req.query.q || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const norm = s => String(s).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const filtered = list.filter(name => norm(name).includes(q)).slice(0, 40);
  res.json(filtered);
});

export default router;
