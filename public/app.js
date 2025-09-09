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
const hideLoader = () => { el('loaderOverlay').classList.add('hidden'); };

/* ===== Smooth scroll ===== */
function smoothScrollTo(elm) { if (elm) setTimeout(() => elm.scrollIntoView({ behavior:'smooth', block:'start' }), 60); }

/* ===== Reset totale ===== */
function resetAll() {
  try { if (state.scan.stream) state.scan.stream.getTracks().forEach(t=>t.stop()); } catch(e){}
  state = { verbale:null, motivi:null, token:null, scan:{stream:null, images:[]} };

  // pulisci form correzioni
  ['v_number','v_authority','v_article','v_place','v_dateInfrazione','v_dateNotifica','v_amount','v_targa',
   'u_name','u_comune','u_dob','u_addr','u_cf'].forEach(id => { const i=el(id); if(i) i.value=''; });
  // pulisci modale manuale
  ['m_number','m_authority','m_article','m_place','m_dateInfrazione','m_dateNotifica','m_amount','m_targa',
   'm_name','m_comune','m_dob','m_addr','m_cf'].forEach(id => { const i=el(id); if(i) i.value=''; });
  // pulisci UI
  el('summary').innerHTML = '';
  el('previewCanvasWrap').innerHTML = '';
  el('previewTimer').textContent = '';
  el('scanThumbs').innerHTML = '';
  el('scanStatus').textContent = '';
  const hf = el('heroFile'); if (hf) hf.value = '';

  // nascondi sezioni
  hide('workspace'); hide('cameraBlock'); hide('fallback');
  ['step2','step3','step5','step6','step7','step8','step9'].forEach(hide);
  // chiudi modale se aperta
  el('manualModal').classList.add('hidden');
  // scroll top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ===== Fallback parsing debole ===== */
function showExtractionFallback() {
  show('workspace'); hide('cameraBlock');
  hide('step2'); hide('step3'); hide('step5'); hide('step6'); hide('step7'); hide('step8'); hide('step9');
  show('fallback');
}
function hideExtractionFallback() { hide('fallback'); }

/* ===== Dati minimi (solo campi) ===== */
function hasMinimumFields(v = {}) {
  let score = 0;
  if (v.number) score++;
  if (v.authority) score++;
  if (v.article) score++;
  if (v.dateInfrazione) score++;
  // almeno 3 su 4
  return score >= 3;
}

/* ===== Riepilogo / Motivi ===== */
function renderSummary() {
  const c = state.motivi?.centralMotivo;
  const cites = (arr = []) =>
    arr.map(ci =>
      `<small class="muted">[${ci.ref || ''}${ci.link ? ` – <a href="${ci.link}" target="_blank" rel="noopener">fonte</a>` : ''}]</small>`
    ).join(' ');
  const centralHtml = c
    ? `<p><span class="btn btn-outline" style="cursor:default">Motivo centrale (AI): ${c.type}${c.detail ? ' – ' + c.detail : ''}</span> ${cites(c.citations)}</p>`
    : '';

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
    ${(state.motivi?.mainMotivi?.length || state.motivi?.extraMotivi?.length) ? `
    <p><strong>Motivi individuati (AI):</strong></p>
    <ul>
      ${(state.motivi?.mainMotivi || []).map(m => `<li>${m.type} — ${m.detail || ''} ${cites(m.citations)}</li>`).join('')}
      ${(state.motivi?.extraMotivi || []).map(m => `<li>Pretestuoso: ${m.type} ${cites(m.citations)}</li>`).join('')}
    </ul>` : '' }
  `;

  // pannello guida per inserimento manuale se manca motivo centrale
  if (!c) show('centralFallback'); else hide('centralFallback');

  const btn = document.getElementById('openManualFromCentral');
  if (btn) btn.onclick = openManualModal;
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
function stopCamera(){ if (state.scan.stream) { state.scan.stream.getTracks().forEach(t=>t.stop()); state.scan.stream=null; } }
function drawCurrentFrame(){
  const v=el('camVideo'), c=el('camCanvas'); const w=v.videoWidth, h=v.videoHeight; if(!w||!h) return null;
  c.width=w; c.height=h; const ctx=c.getContext('2d'); ctx.drawImage(v,0,0,w,h);
  const img=ctx.getImageData(0,0,w,h), d=img.data;
  for(let i=0;i<d.length;i+=4){ const gray=d[i]*0.299+d[i+1]*0.587+d[i+2]*0.114; let g=(gray-128)*1.2+128; g=Math.max(0,Math.min(255,g)); d[i]=d[i+1]=d[i+2]=g; }
  ctx.putImageData(img,0,0);
  return c.toDataURL('image/jpeg',0.92);
}
function addThumb(dataUrl){ const img=new Image(); img.src=dataUrl; el('scanThumbs').appendChild(img); }
function b64toBlob(b64){ const parts=b64.split(','), byte=atob(parts[1]), mime=(parts[0].match(/:(.*?);/)||[])[1]||'image/jpeg'; const ab=new ArrayBuffer(byte.length); const ia=new Uint8Array(ab); for(let i=0;i<byte.length;i++) ia[i]=byte.charCodeAt(i); return new Blob([ab],{type:mime}); }
async function onShot(){ const dataUrl=drawCurrentFrame(); if(!dataUrl){ el('scanStatus').textContent='Inquadra e attendi la messa a fuoco...'; return; } state.scan.images.push(dataUrl); addThumb(dataUrl); show('btnRetake'); show('btnAddPage'); show('btnFinishScan'); }
function onRetake(){ state.scan.images.pop(); const th=el('scanThumbs'); if(th.lastChild) th.removeChild(th.lastChild); if(state.scan.images.length===0){ hide('btnRetake'); hide('btnAddPage'); hide('btnFinishScan'); } }
function onAddPage(){}
async function onFinishScan(){
  if(state.scan.images.length===0){ el('scanStatus').textContent='Nessuna pagina scattata.'; return; }
  el('scanStatus').textContent='Invio scansioni, estrazione in corso...';
  const first=state.scan.images[0];
  const blob=b64toBlob(first);
  const fd=new FormData(); fd.append('file', new File([blob],'scan.jpg',{type:'image/jpeg'}));

  showLoader('Elaborazione in corso…','Stiamo analizzando il verbale con AI e OCR.<br/>Attendi ~1 minuto.');
  try{
    const res=await fetch('/api/upload',{method:'POST',body:fd});
    const data=await res.json();
    await afterExtract(data);
    el('scanStatus').textContent='Scansione inviata.';
  }catch(err){
    console.error(err);
    el('scanStatus').textContent='Errore durante l’elaborazione.';
    alert('Errore durante l’elaborazione. Riprova.');
  }finally{
    hideLoader();
    stopCamera();
  }
}
function closeCamera(){ stopCamera(); hide('cameraBlock'); }

/* ===== Upload (HERO) ===== */
function triggerFileDialog(){ el('heroFile').click(); }
async function onHeroFileChange(){
  const file=el('heroFile').files[0];
  if (!file) return;
  el('heroStatus').textContent='Elaboro...';
  show('workspace'); hideExtractionFallback();

  const fd=new FormData(); fd.append('file', file);
  showLoader('Elaborazione in corso…','Stiamo analizzando il verbale con AI e OCR.<br/>Attendi ~1 minuto.');
  try{
    const res=await fetch('/api/upload',{method:'POST',body:fd});
    const data=await res.json();
    await afterExtract(data);
    el('heroStatus').textContent='File elaborato.';
  }catch(err){
    console.error(err);
    el('heroStatus').textContent='Errore durante l’elaborazione.';
    alert('Errore durante l’elaborazione. Riprova.');
  }finally{
    hideLoader();
    el('heroFile').value='';
  }
}

/* ===== Inserimento Manuale ===== */
function openManualModal(){ el('manualModal').classList.remove('hidden'); }
function closeManualModal(){ el('manualModal').classList.add('hidden'); }
async function submitManual(){
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
  closeManualModal(); hideExtractionFallback(); show('workspace');
  await afterExtract({ verbale: v });
}

/* ===== AI ===== */
async function computeMotiviAI(){
  const r=await fetch('/api/ai/motivi-central',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({verbale:state.verbale})
  });
  const txt=await r.text();
  try{ state.motivi=JSON.parse(txt); }
  catch(e){ console.error('AI parse error',txt); state.motivi={ mainMotivi:[], extraMotivi:[], centralMotivo:null }; }
}

/* Debolezza parsing (prima ancora dei motivi) */
function isExtractionWeak(data){
  const raw=(data?.extracted || data?.verbale?.rawText || '').trim();
  const v=data?.verbale || {};
  const fields=['number','authority','article','place','dateInfrazione','dateNotifica','amount','targa'];
  const filled=fields.filter(k => (v[k]!==undefined && v[k]!==null && String(v[k]).trim()!==''));
  return (raw.length<80 && filled.length<2);
}

/* ===== Flusso comune ===== */
async function afterExtract(data){
  // 1) se parsing è scarso → blocco fallback
  if(isExtractionWeak(data)){ showExtractionFallback(); return; }

  // 2) aggiorna stato e calcola motivi
  state.verbale = data.verbale || { amount:0, rawText: data.extracted || '' };
  await computeMotiviAI();

  // 3) mostra riepilogo & correzioni
  renderSummary();
  ['number','authority','article','place','dateInfrazione','dateNotifica','amount','targa'].forEach(k => {
    const i='v_'+k; if(el(i)) el(i).value = state.verbale[k] || '';
  });
  show('step2'); show('step3');

  // 4) se i dati minimi ci sono → genera anteprima (anche senza motivo centrale) altrimenti invita al form
  if(hasMinimumFields(state.verbale)){
    await generatePreview(/* auto */);
  } else {
    show('centralFallback');
    openManualModal();
  }
}

/* ===== Salva correzioni ===== */
async function saveCorrections(){
  const v=state.verbale||{};
  v.number=el('v_number').value; v.authority=el('v_authority').value; v.article=el('v_article').value;
  v.place=el('v_place').value; v.dateInfrazione=el('v_dateInfrazione').value; v.dateNotifica=el('v_dateNotifica').value;
  v.amount=parseFloat(el('v_amount').value||'0'); v.targa=el('v_targa').value;
  v.owner={ name:el('u_name').value||'Nome Cognome', comune:el('u_comune').value||v.authority||'Comune', dataNascita:el('u_dob').value||'YYYY-MM-DD', indirizzo:el('u_addr').value||'Indirizzo', cf:el('u_cf').value||'CODICEFISCALE' };
  state.verbale=v;

  await computeMotiviAI();
  renderSummary();

  if(hasMinimumFields(v)){
    await generatePreview();
  }else{
    hide('step5'); hide('step6'); hide('step7');
    show('centralFallback');
    openManualModal();
  }
}

/* ===== Anteprima auto (senza testi extra) ===== */
async function generatePreview(){
  // Genera testo ricorso; se non c'è motivo centrale, chiediamo al backend di usare il fallback “pretestuoso + accesso atti”
  const fallbackMode = !state.motivi?.centralMotivo;
  const resAI = await fetch('/api/ai/genera-ricorso',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({verbale:state.verbale, fallbackMode})
  });
  const ricorsoText = await resAI.text();

  const wrap=el('previewCanvasWrap'); wrap.innerHTML='';
  const canvas=document.createElement('canvas'); canvas.width=800; canvas.height=1120;
  canvas.style.userSelect='none'; canvas.style.pointerEvents='none'; canvas.style.border='1px solid #1f2a44';
  wrap.appendChild(canvas);
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#fff'; ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle='#111827'; ctx.font='16px system-ui';

  const words=(ricorsoText||'').split(/\s+/); let x=40,y=60,line=''; const maxW=canvas.width-80;
  for(let i=0;i<words.length;i++){
    const test=line+words[i]+' ';
    if(ctx.measureText(test).width>maxW){ ctx.fillText(line,x,y); line=words[i]+' '; y+=22; if(y>canvas.height-80) break; }
    else { line=test; }
  }
  if(line) ctx.fillText(line,x,y);

  // watermark
  ctx.save(); ctx.translate(canvas.width/2,canvas.height/2); ctx.rotate(-Math.PI/7); ctx.globalAlpha=0.12; ctx.fillStyle='#000'; ctx.font='bold 48px system-ui'; ctx.textAlign='center'; ctx.fillText('BOZZA NON UTILIZZABILE',0,0); ctx.restore();

  // mostra step5 e avvia timer → poi pagamento
  show('step5');

  // calcolo prezzo e salvo payload
  const priceRes=await fetch('/api/checkout/price',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({amount:state.verbale.amount||0})});
  const pr=await priceRes.json(); el('price').textContent=pr.priceFormatted;

  const save = await fetch('/api/store/payload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({verbale:state.verbale,motivi:state.motivi, ricorsoAI: ricorsoText})});
  const sj = await save.json(); state.token = sj.token;

  // timer 30s (solo numeri)
  let left=30; const timer=el('previewTimer'); timer.textContent=`Anteprima: ${left}s`;
  const int=setInterval(()=>{ left--; if(left<=0){ clearInterval(int); wrap.innerHTML='<span class="muted">Anteprima scaduta.</span>'; show('step6'); } else { timer.textContent=`Anteprima: ${left}s`; } },1000);
}

/* ===== Pagamento ===== */
async function payNow(){
  const r=await fetch('/api/checkout/create-session',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({amount:state.verbale?.amount||0, token: state.token})
  });
  const j=await r.json(); if(j.url){ window.location.href=j.url; } else { alert('Errore creazione sessione pagamento'); }
}

/* ===== Bind UI ===== */
// HERO
el('heroStartCam').addEventListener('click', startCamera);
el('heroUpload').addEventListener('click', triggerFileDialog);
el('heroFile').addEventListener('change', onHeroFileChange);
el('openManual').addEventListener('click', openManualModal);

// CAMERA
el('btnShot').addEventListener('click', onShot);
el('btnRetake').addEventListener('click', onRetake);
el('btnAddPage').addEventListener('click', onAddPage);
el('btnFinishScan').addEventListener('click', onFinishScan);
el('btnCloseCam').addEventListener('click', () => { closeCamera(); });

// FALLBACK
el('fbRetryScan').addEventListener('click', () => { hideExtractionFallback(); startCamera(); });
el('fbManual').addEventListener('click', openManualModal);

// CENTRAL FALLBACK
const openManualFromCentral = document.getElementById('openManualFromCentral');
if (openManualFromCentral) openManualFromCentral.addEventListener('click', openManualModal);

// MANUAL modal
el('closeManual').addEventListener('click', closeManualModal);
el('submitManual').addEventListener('click', submitManual);

// FLOW
el('btnSaveCorrections').addEventListener('click', saveCorrections);
el('btnPay').addEventListener('click', payNow);

// RESET
el('btnReset').addEventListener('click', resetAll);

// sicurezza: chiudi camera in uscita
window.addEventListener('beforeunload', stopCamera);
