import 'dotenv/config';
import axios from 'axios';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const KNOWLEDGE_URL = process.env.KNOWLEDGE_URL || 'http://localhost:4000/knowledge';

export function registerAIRoutes(app) {
  app.post('/api/ai/motivi-central', async (req, res) => {
    try {
      const { verbale } = req.body || {};
      const queries = buildQueriesFromVerbale(verbale);
      const { data: contexts } = await axios.post(`${KNOWLEDGE_URL}/search`, { queries, k: 12 });
      const prompt = makeCentralMotivoPrompt(verbale, contexts);
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        messages: [
          { role: 'system', content: 'Sei un assistente legale. Usa SOLO le fonti fornite. Rispondi in JSON.' },
          { role: 'user', content: prompt }
        ]
      });
      res.type('application/json').send(completion.choices[0].message.content);
    } catch (e) { console.error(e); res.status(500).json({ error: 'AI error' }); }
  });

  app.post('/api/ai/genera-ricorso', async (req, res) => {
    try {
      const { verbale } = req.body || {};
      const queries = buildQueriesFromVerbale(verbale);
      const { data: contexts } = await axios.post(`${KNOWLEDGE_URL}/search`, { queries, k: 20 });
      const prompt = makeRicorsoPrompt(verbale, contexts);
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        messages: [
          { role: 'system', content: 'Sei un assistente legale. Usa SOLO le fonti fornite.' },
          { role: 'user', content: prompt }
        ]
      });
      res.type('text/plain').send(completion.choices[0].message.content);
    } catch (e) { console.error(e); res.status(500).json({ error: 'AI error' }); }
  });
}

function buildQueriesFromVerbale(v) {
  const qs = [];
  if (v?.article) qs.push(`art. ${v.article} Codice della Strada testo vigente`);
  qs.push('art. 201 termini notifica ricorso verbale');
  qs.push('regolamento esecuzione CdS segnaletica autovelox art. 142');
  qs.push('taratura omologazione dispositivi autovelox giurisprudenza');
  return qs;
}

function makeCentralMotivoPrompt(verbale, contexts) {
  return `Determina il MOTIVO CENTRALE del ricorso usando SOLO le seguenti fonti:
<fonti>
${contexts.map(c=>`Fonte:${c.source} | Art:${c.article||''} | Titolo:${c.title||''} | Data:${c.date_published||''} | Link:${c.url||''}
${c.content}`).join('\n---\n')}
</fonti>

<verbale>
${JSON.stringify(verbale, null, 2)}
</verbale>

Rispondi in JSON:
{
  "centralMotivo": {"type":"...","detail":"...","citations":[{"ref":"...","link":"..."}]},
  "mainMotivi": [{"type":"...","detail":"...","citations":[...]}],
  "extraMotivi": [{"type":"...","detail":"...","citations":[...]}]
}`;
}

function makeRicorsoPrompt(verbale, contexts) {
  return `Redigi un RICORSO COMPLETO (>=2000 parole), stile burocratico, con sezioni:
- Introduzione e premessa
- Motivi principali fondanti (includi MOTIVO CENTRALE)
- Motivi pretestuosi e rinforzo
- Richiesta di accesso agli atti
- Eccezioni generiche di riserva
- Conclusioni

Usa SOLO le seguenti fonti ufficiali, citandole puntualmente (articolo/comma, fonte, data, link).
<fonti>
${contexts.map(c=>`Fonte:${c.source} | Art:${c.article||''} | Titolo:${c.title||''} | Data:${c.date_published||''} | Link:${c.url||''}
${c.content}`).join('\n---\n')}
</fonti>

<verbale>
${JSON.stringify(verbale, null, 2)}
</verbale>

Scrivi in italiano. Evita opinioni. Metti le citazioni tra parentesi quadre [fonte, art/comma, data, link].`;
}
