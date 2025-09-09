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

/* ===== Smooth scroll helper ===== */
function smoothScrollTo(elm) {
  if (!elm) return;
  setTimeout(() => { elm.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60);
}

/* ===== Fallback visibilità ===== */
function showExtractionFallback() {
  show('workspace');
  hide('cameraBlock');
  hide('step2'); hide('step3'); hide('step5'); hide('step6'); hide('step7'); hide('step8'); hide('step9');
  show('fallback');
}
function hideExtractionFallback() { hide('fallback'); }

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

/* ===== CAMERA ===== */
async function startCamera() {
  try {
    show('workspace'); show('cameraBlock'); hideExtractionFallback();

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' } }
    });
    state.scan.stream = stream;
    const video = el('camVideo');
    video.srcObject = stream;
    await video.play();

    state.scan.images = [];
    el('scanThumbs').innerHTML = '';
    el('scanStatus').textContent = 'Inquadra il verbale e premi “Scatta”.';
    hide('btnRetake'); hide('btnAddPage'); hide('btnFinishScan');

    smoothScrollTo(el('cameraBlock'));
  } catch (e) {
    console.error(e);
    alert('Permesso fotocamera negato o non disponibile. Prova “Carica PDF/Foto” o “Inserisci a mano”.');
    hide('cameraBlock');
  }
}
function stopCamera() {
  if (state.scan.stream) {
    state.scan.stream.getTracks().forEach(t => t.stop());
    state.scan.stream = null;
  }
}
function drawCurrentFrame() {
  const video = el('camVideo');
  const canvas = el('camCanvas');
  const w = video.videoWidth, h = video.videoHeight;
  if (!w || !h) return null;
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, w, h);

  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i=0;i<d.length;i+=4) {
    const gray = d[i]*0.299 + d[i+1]*0.587 + d[i+2]*0.114;
    let g = (gray - 128) * 1.2 + 128;
    g = Math.max(0, Math.min(255, g));
    d[i]=d[i+1]=d[i+2]=g;
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.92);
}
function addThumb(dataUrl) {
  const img = new Image();
  img.src = dataUrl;
  el('scanThumbs').appendChild(img);
}
function b64toBlob(b64) {
  const parts = b64.split(',');
  const byteString = atob(parts[1]);
  const mime = parts[0].match(/:(.*?);/)[1] || 'image/jpeg';
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i=0;i<byteString.length;i++) ia[i] = byteString.charCodeAt(i);
  return new Blob([ab], { type: mime });
}
async function onShot() {
  const dataUrl = drawCurrentFrame();
  if (!dataUrl) { el('scanStatus').textContent = 'Inquadra e attendi la messa a fuoco...'; return; }
  state.scan.images.push(dataUrl);
  addThumb(dataUrl);
  show('btnRetake'); show('btnAddPage'); show('btnFinishScan');
}
function onRetake() {
  state.scan.images.pop();
  const th = el('scanThumbs');
  if (th.lastChild) th.removeChild(th.lastChild);
  if (state.scan.images.length===0){ hide('btnRetake'); hide('btnAddPage'); hide('btnFinishScan'); }
}
function onAddPage() { /* scatta di nuovo */ }
async function onFinishScan() {
  if (state.scan.images.length===0){ el('scanStatus').textContent='Nessuna pagina scattata.'; return; }
  el('scanStatus').textContent='Invio scansioni, estrazione in corso...';

  const first = state.scan.images[0];
  const blob = b64toBlob(first);
  const fd = new FormData(); fd.append('file', new File([blob], 'scan.jpg', { type:'image/jpeg' }));

  showLoader('Elaborazione in corso…', 'Stiamo analizzando il verbale con AI e OCR.<br/>Attendi ~1 minuto.');
  try {
    const res = await fetch('/api/upload', { method:'POST', body: fd });
    const data = await res.json();
    await afterExtract(data);
    el('scanStatus').textContent='Scansione inviata.';
  } catch (err) {
    console.error(err);
    el('scanStatus').textContent='Errore durante l’elaborazione.';
    alert('Errore durante l’elaborazione. Riprova.');
  } finally {
    hideLoader();
    stopCamera();
  }
}
function closeCamera() { stopCamera(); hide('cameraBlock'); }

/* ===== Upload (HERO) ===== */
function triggerFileDialog() { el('heroFile').click(); }
async function onHeroFileChange() {
  const file = el('heroFile').files[0];
  if (!file) return;
  el('heroStatus').textContent = 'Elaboro...';
  show('workspace'); hideExtractionFallback();

  const fd = new FormData(); fd.append('file', file);
  showLoader('Elaborazione in corso…', 'Stiamo analizzando il verbale con AI e OCR.<br/>Attendi ~1 minuto.');
  try {
    const res = await fetch('/api/upload', { method:'POST', body: fd });
    const data = await res.json();
    await afterExtract(data);
    el('heroStatus').textContent = 'File elaborato.';
  } catch (err) {
    console.error(err);
    el('heroStatus').textContent = 'Errore durante l’elaborazione.';
    alert('Errore durante l’elaborazione. Riprova.');
  } finally {
    hideLoader();
    el('heroFile').value = ''; // reset per successive selezioni uguali
  }
}

/* ===== Inserimento Manuale (modale) ===== */
function openManualModal(){ el('manualModal').classList.remove('hidden'); }
function closeManualModal(){ el('manualModal').classList.add('hidden'); }
async function submitManual() {
  const v = {
    number: el('m_number').value || '',
    authority: el('m_authority').value || '',
    article: el('m_article').value || '',
    place: el('m_place').value || '',
    dateInfrazione: el('m_dateInfrazione').value || '',
    dateNotifica: el('m_dateNotifica').value || '',
    amount: parseFloat(el('m_amount').value || '0'),
    targa: el('m_targa').value || '',
    owner: {
      name: el('m_name').value || 'Nome Cognome',
      comune: el('m_comune').value || '',
      dataNascita: el('m_dob').value || '',
      indirizzo: el('m_addr').value || '',
      cf: el('m_cf').value || ''
    },
    rawText: ''
  };
  closeManualModal();
  hideExtractionFallback();
  show('workspace');
  await afterExtract({ verbale: v });
}

/* ===== AI / flusso comune ===== */
async function computeMotiviAI() {
  const r = await fetch('/api/ai/motivi-central', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ verbale: state.verbale })
  });
  const txt = await r.text();
  try {
    state.motivi = JSON.parse(txt);
  } catch (e) {
    console.error('AI parse error', txt);
    state.motivi = { mainMotivi: [], extraMotivi: [], centralMotivo: null };
  }
}

/* Heuristic: determina se i dati sono “insufficienti” */
function isExtractionWeak(data) {
  const raw = (data?.extracted || data?.verbale?.rawText || '').trim();
  const v = data?.verbale || {};
  const fields = ['number','authority','article','place','dateInfrazione','dateNotifica','amount','targa'];
  const filled = fields.filter(k => (v[k] !== undefined && v[k] !== null && String(v[k]).trim() !== ''));
  if (raw.length < 80 && filled.length < 2) return true;
  return false;
}

async function afterExtract(data) {
  if (isExtractionWeak(data)) {
    showExtractionFallback();
    return;
  }

  hideExtractionFallback();
  state.verbale = data.verbale || { amount: 0, rawText: data.extracted || '' };

  await computeMotiviAI();
  renderSummary();

  ['number','authority','article','place','dateInfrazione','dateNotifica','amount','targa'].forEach(k => {
    const i='v_'+k; if (el(i)) el(i).value = state.verbale[k] || '';
  });

  show('step2'); show('step3'); show('step5');
}

/* ===== Correzioni ===== */
async function saveCorrections() {
  const v = state.verbale || {};
  v.number = el('v_number').value;
  v.authority = el('v_authority').value;
  v.article = el('v_article').value;
  v.place = el('v_place').value;
  v.dateInfrazione = el('v_dateInfrazione').value;
  v.dateNotifica = el('v_dateNotifica').value;
  v.amount = parseFloat(el('v_amount').value || '0');
  v.targa = el('v_targa').value;
  v.owner = {
    name: el('u_name').value || 'Nome Cognome',
    comune: el('u_comune').value || v.authority || 'Comune',
    dataNascita: el('u_dob').value || 'YYYY-MM-DD',
    indirizzo: el('u_addr').value || 'Indirizzo',
    cf: el('u_cf').value || 'CODICEFISCALE'
  };
  state.verbale = v;
  await computeMotiviAI();
  renderSummary();
  alert('Dati aggiornati e motivo ricalcolato (AI).');
}

/* ===== Anteprima a tempo + Pagamento ===== */
async function generatePreview() {
  const resAI = await fetch('/api/ai/genera-ricorso', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ verbale: state.verbale })
  });
  const ricorsoText = await resAI.text();

  const wrap=el('previewCanvasWrap'); wrap.innerHTML='';
  const canvas=document.createElement('canvas'); canvas.width=800; canvas.height=1120;
  canvas.style.userSelect='none'; canvas.style.pointerEvents='none'; canvas.style.border='1px solid #1f2a44'; wrap.appendChild(canvas);
  const ctx=canvas.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.fillStyle='#111827'; ctx.font='16px system-ui';
  const words=(ricorsoText||'').split(/\s+/); let x=40,y=60,line=''; const maxW=canvas.width-80;
  for(let i=0;i<words.length;i++){ const test=line+words[i]+' '; if(ctx.measureText(test).width>maxW){ ctx.fillText(line,x,y); line=words[i]+' '; y+=22; if(y>canvas.height-80) break; } else { line=test; } }
  if(line) ctx.fillText(line,x,y);
  ctx.save(); ctx.translate(canvas.width/2,canvas.height/2); ctx.rotate(-Math.PI/7); ctx.globalAlpha=0.12; ctx.fillStyle='#000'; ctx.font='bold 48px system-ui'; ctx.textAlign='center'; ctx.fillText('BOZZA NON UTILIZZABILE',0,0); ctx.restore();

  let left=30; const timer=el('previewTimer'); timer.textContent=`Anteprima visibile per ${left} secondi...`;
  const int=setInterval(()=>{ left--; if(left<=0){ clearInterval(int); wrap.innerHTML='<span class="muted">Anteprima scaduta.</span>'; show('step6'); } else { timer.textContent=`Anteprima visibile per ${left} secondi...`; } },1000);

  const priceRes=await fetch('/api/checkout/price',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({amount:state.verbale.amount||0})});
  const pr=await priceRes.json(); el('price').textContent=pr.priceFormatted;

  state.motivi = state.motivi || {};
  const save = await fetch('/api/store/payload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({verbale:state.verbale,motivi:state.motivi, ricorsoAI: ricorsoText})});
  const sj = await save.json(); state.token = sj.token;
}
async function payNow(){
  const r = await fetch('/api/checkout/create-session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({amount:state.verbale.amount||0, token: state.token})});
  const j = await r.json(); if(j.url){ window.location.href = j.url; } else { alert('Errore creazione sessione pagamento'); }
}

/* ===== Bind UI ===== */
// HERO
el('heroStartCam').addEventListener('click', startCamera);
el('heroUpload').addEventListener('click', () => triggerFileDialog());
el('heroFile').addEventListener('change', onHeroFileChange);
el('openManual').addEventListener('click', openManualModal);

// CAMERA controls
el('btnShot').addEventListener('click', onShot);
el('btnRetake').addEventListener('click', onRetake);
el('btnAddPage').addEventListener('click', onAddPage);
el('btnFinishScan').addEventListener('click', onFinishScan);
el('btnCloseCam').addEventListener('click', () => { closeCamera(); });

// FALLBACK actions
el('fbRetryScan').addEventListener('click', () => { hideExtractionFallback(); startCamera(); });
el('fbManual').addEventListener('click', openManualModal);

// MANUAL modal
el('closeManual').addEventListener('click', closeManualModal);
el('submitManual').addEventListener('click', submitManual);

// FLOW
el('btnSaveCorrections').addEventListener('click', saveCorrections);
el('btnPreview').addEventListener('click', generatePreview);
el('btnPay').addEventListener('click', payNow);

// Chiudi camera se lasci la pagina
window.addEventListener('beforeunload', stopCamera);
