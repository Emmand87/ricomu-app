// app.js
let state = {
  verbale: null,
  motivi: null,
  token: null,
  scan: { stream: null, images: [] }
};

const el = id => document.getElementById(id);
const show = id => el(id).classList.remove('hidden');
const hide = id => el(id).classList.add('hidden');

/* ===== Loader overlay ===== */
const showLoader = (title = 'Elaborazione in corso…', sub = 'Attendi ~1 minuto.') => {
  const ov = document.getElementById('loaderOverlay');
  ov.querySelector('.loader-title').textContent = title;
  ov.querySelector('.loader-sub').innerHTML = sub;
  ov.classList.remove('hidden');
};
const hideLoader = () => {
  const ov = document.getElementById('loaderOverlay');
  ov.classList.add('hidden');
};

/* ===== Riepilogo / Motivi ===== */
function renderSummary() {
  const c = state.motivi?.centralMotivo;
  const cites = (arr = []) =>
    arr.map(ci =>
      `<small class="muted">[${ci.ref || ''}${ci.link ? ` – <a href="${ci.link}" target="_blank" rel="noopener">fonte</a>` : ''}]</small>`
    ).join(' ');
  const centralHtml = c
    ? `<p><span class="btn btn-outline" style="cursor:default">Motivo centrale (AI): ${c.type}${c.detail ? ' – ' + c.detail : ''}</span> ${cites(c.citations)}</p>`
    : '<p class="muted">Motivo centrale non determinato.</p>';

  el('summary').innerHTML = `
    ${centralHtml}
    <ul>
      <li><strong>Numero:</strong> ${state.verbale?.number || '-'}</li>
      <li><strong>Ente:</strong> ${state.verbale?.authority || '-'}</li>
      <li><strong>Articolo:</strong> ${state.verbale?.article || '-'}</li>
      <li><strong>Infrazione:</strong> ${state.verbale?.dateInfrazione || '-'}</li>
      <li><strong>Notifica:</strong> ${state.verbale?.dateNotifica || '-'}</li>
      <li><strong>Luogo:</strong> ${state.verbale?.place || '-'}</li>
      <li><strong>Importo:</strong> € ${state.verbale?.amount || '-'}</li>
    </ul>
    <p><strong>Motivi individuati (AI):</strong></p>
    <ul>
      ${(state.motivi?.mainMotivi || []).map(m => `<li>${m.type} — ${m.detail || ''} ${cites(m.citations)}</li>`).join('')}
      ${(state.motivi?.extraMotivi || []).map(m => `<li>Pretestuoso: ${m.type} ${cites(m.citations)}</li>`).join('')}
    </ul>`;
}

/* ===== Upload tradizionale ===== */
async function uploadFile() {
  const file = el('file').files[0];
  if (!file) { el('s1status').textContent = 'Seleziona un file.'; return; }
  el('s1status').textContent = 'Elaboro...';
  const fd = new FormData(); fd.append('file', file);

  showLoader('Elaborazione in corso…', 'Stiamo analizzando il verbale con AI e OCR.<br/>Attendi ~1 minuto.');
  try {
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    const data = await res.json();
    await afterExtract(data);
  } catch (err) {
    console.error(err); alert('Errore durante l’elaborazione. Riprova.');
  } finally { hideLoader(); }
}

/* ===== Upload rapido dalla HERO ===== */
async function heroUploadFile(){
  const file = el('heroFile').files[0
