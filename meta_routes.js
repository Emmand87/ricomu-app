// src/meta_routes.js
import express from 'express';

const router = express.Router();

/* ====== DATI DI ESEMPIO (SOSTITUISCI/ESTENDI) ======
   - Puoi spostare questi array in file JSON (es. /data/*.json) e leggerli da lì
   - Basta aumentare gli elementi. Le API fanno già la ricerca testuale case-insensitive.
*/

// Autorità che emettono verbali (esempi)
const AUTHORITIES = [
  'Polizia Locale',
  'Polizia Municipale',
  'Polizia Stradale',
  'Carabinieri',
  'Guardia di Finanza',
  'Polizia Provinciale',
  'Città Metropolitana',
  'Prefettura (per ordinanze-ingiunzione)',
  'ANAS',
  'Concessionario Autostradale',
  'Capitaneria di Porto (aree portuali)',
  'Polizia Ferroviaria'
];

// Articoli CdS (estratto dei più frequenti; estendi a piacere)
const CDS_ARTICLES = [
  'Art. 6 - Regolamentazione circolazione fuori centri abitati',
  'Art. 7 - Regolamentazione circolazione nei centri abitati',
  'Art. 14 - Poteri e compiti degli enti proprietari delle strade',
  'Art. 37 - Segnaletica stradale',
  'Art. 116 - Patente di guida',
  'Art. 121 - Esami di idoneità',
  'Art. 126-bis - Decurtazione punti',
  'Art. 141 - Velocità',
  'Art. 142 - Limiti di velocità',
  'Art. 146 - Violazione della segnaletica',
  'Art. 154 - Cambiamento di direzione/senso',
  'Art. 157 - Arresto, fermata e sosta',
  'Art. 158 - Divieto di sosta e fermata',
  'Art. 171 - Casco',
  'Art. 173 - Uso apparecchi durante la guida',
  'Art. 180 - Documenti di circolazione',
  'Art. 186 - Guida in stato di ebbrezza',
  'Art. 187 - Sostanze stupefacenti',
  'Art. 188 - Veicoli al servizio persone con disabilità',
  'Art. 193 - Assicurazione di responsabilità civile',
  'Art. 200 - Contestazione immediata',
  'Art. 201 - Notificazione delle violazioni',
  'Art. 203 - Ricorso al Prefetto',
  'Art. 204 - Ordinanza-ingiunzione Prefetto',
  'Art. 204-bis - Ricorso al Giudice di Pace'
];

// Comuni (campione; sostituisci con l’elenco completo ISTAT)
const MUNICIPALITIES = [
  'Roma', 'Milano', 'Napoli', 'Torino', 'Palermo', 'Genova', 'Bologna', 'Firenze', 'Bari', 'Catania',
  'Venezia', 'Verona', 'Messina', 'Padova', 'Trieste', 'Taranto', 'Brescia', 'Parma', 'Prato', 'Modena',
  'Reggio di Calabria', 'Reggio nell\'Emilia', 'Perugia', 'Ravenna', 'Livorno', 'Cagliari', 'Foggia'
];

/* ====== HELPERS ====== */
function search(arr, q = '', limit = 20) {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return arr.slice(0, limit);
  const res = arr.filter(v => v.toLowerCase().includes(s));
  return res.slice(0, limit);
}

/* ====== ROUTES ====== */

// GET /api/meta/authorities?q=pol
router.get('/authorities', (req, res) => {
  const out = search(AUTHORITIES, req.query.q, 20);
  res.json(out);
});

// GET /api/meta/cds-articles?q=146
router.get('/cds-articles', (req, res) => {
  const out = search(CDS_ARTICLES, req.query.q, 25);
  res.json(out);
});

// GET /api/meta/municipalities?q=rom
router.get('/municipalities', (req, res) => {
  const out = search(MUNICIPALITIES, req.query.q, 25);
  res.json(out);
});

export default router;
