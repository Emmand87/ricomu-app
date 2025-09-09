// public/app.js
let state = {
  verbale: null,
  motivi: null,
  token: null,
  scan: { stream: null, images: [] }
};

const el = id => document.getElementById(id);
const show = id => el(id).classList.remove('hidden');
const hide = id => el(id).classList.add('hidden');

/* Loader */
const showLoader = (t='Elaborazione in corso…', s='Attendi ~1 minuto.')=>{
  const ov=el('loaderOverlay');
  ov.querySelector('.loader-title').textContent=t;
  ov.querySelector('.loader-sub').innerHTML=s;
  ov.classList.remove('hidden');
};
const hideLoader = ()=> el('loaderOverlay').classList.add('hidden');

/* Scroll */
const smoothScrollTo = node => setTimeout(()=>node?.scrollIntoView({behavior:'smooth', block:'start'}),60);

/* Reset totale */
function resetAll(){
  try { state.scan.stream?.getTracks().forEach(t=>t.stop()); } catch{}
  state = { verbale:null, motivi:null, token:null, scan:{stream:null, images:[]} };
  // pulizie
  ['v_number','v_authority','v_article','v_place','v_dateInfrazione','v_dateNotifica','v_amount','v_targa','u_name','u_comune','u_dob','u_addr','u_cf',
   'm_number','m_authority','m_article','m_place','m_dateInfrazione','m_dateNotifica','m_amount','m_targa','m_name','m_comune','m_dob','m_addr','m_cf'
  ].forEach(id=>{ const i=el(id); if(i) i.value=''; });
  el('summary').innerHTML=''; el('previewCanvasWrap').innerHTML=''; el('previewTimer').textContent='';
  el('scanThumbs').innerHTML=''; el('scanStatus').textContent='';
  const hf=el('heroFile'); if(hf) hf.value='';
  // sezioni
  hide('workspace'); hide('cameraBlock'); hide('fallback');
  ['step2','step3','step5','step6','step7','step8','step9'].forEach(hide);
  el('manualModal').classList.add('hidden');
  window.scrollTo({ top: 0, behavior:'smooth' });
}

/* Fallback parsing debole */
function showExtractionFallback(){ show('workspace'); hide('cameraBlock'); ['step2','step3','step5','step6','step7','step8','step9'].forEach(hide); show('fallback'); }
function hideExtractionFallback(){ hide('fallback'); }

/* Valutazione campi chiave (0..4) */
function fieldsScore(v={}){ let s=0; if(v.number) s++; if(v.authority) s++; if(v.article) s++; if(v.dateInfrazione) s++; return s; }
function showFieldsWarning(score){ if(score===3) show('fieldsWarn'); else hide('fieldsWarn'); }

/* Riepilogo */
function renderSummary(){
  const c=state.motivi?.centralMotivo;
  const cites=(arr=[])=>arr.map(ci=>`<small class="muted">[${ci.ref||''}${ci.link?` – <a href="${ci.link}" target="_blank" rel="noopener">fonte</a>`:''}]</small>`).join(' ');
  const centralHtml=c?`<p><span class="btn btn-outline" style="cursor:default">Motivo centrale (AI): ${c.type}${c.detail?' – '+c.detail:''}</span> ${cites(c.citations)}</p>`:'';
  el('summary').innerHTML = `
    ${centralHtml}
    <ul>
      <li><strong>Numero:</strong> ${state.verbale?.number||'-'}</li>
      <li><strong>Ente:</strong> ${state.verbale?.authority||'-'}</li>
      <li><strong>Articolo:</strong> ${state.verbale?.article||'-'}</li>
      <li><strong>Infrazione:</strong> ${state.verbale?.dateInfrazione||'-'}</li>
      <li><strong>Notifica:</strong> ${state.verbale?.dateNotifica||'-'}</li>
      <li><strong>Luogo:</strong> ${state.verbale?.place||'-'}</li>
      <li><strong>Importo:</strong> € ${state.verbale?.amount||'-'}</li>
    </ul>
    ${(state.motivi?.mainMotivi?.length || state.motivi?.extraMotivi?.length)?`
    <p><strong>Motivi individuati (AI):</strong></p>
    <ul>
      ${(state.motivi?.mainMotivi||[]).map(m=>`<li>${m.type} — ${m.detail||''} ${cites(m.citations)}</li>`).join('')}
      ${(state.motivi?.extraMotivi||[]).map(m=>`<li>Pretestuoso: ${m.type} ${cites(m.citations)}</li>`).join('')}
    </ul>`:''}
  `;
  if(!c) show('centralFallback'); else hide('centralFallback');
}

/* CAMERA */
async function startCamera(){
  try{
    show('workspace'); show('cameraBlock'); hideExtractionFallback();
    const stream=await navigator.mediaDevices.getUserMedia({audio:false, video:{facingMode:{ideal:'environment'}}});
    state.scan.stream=stream; const v=el('camVideo'); v.srcObject=stream; await v.play();
    state.scan.images=[]; el('scanThumbs').innerHTML=''; el('scanStatus').textContent='Inquadra e premi “Scatta”.';
    ['btnRetake','btnAddPage','btnFinishScan'].forEach(hide);
    smoothScrollTo(el('cameraBlock'));
  }catch(e){
    alert('Fotocamera non disponibile. Usa “Carica PDF/Foto” o “Inserisci a mano”.'); hide('cameraBlock');
  }
}
function stopCamera(){ state.scan.stream?.getTracks().forEach(t=>t.stop()); state.scan.stream=null; }
function drawCurrentFrame(){ const v=el('camVideo'), c=el('camCanvas'); const w=v.videoWidth,h=v.videoHeight; if(!w||!h) return null; c.width=w;c.height=h;const ctx=c.getContext('2d');ctx.drawImage(v,0,0,w,h);const img=ctx.getImageData(0,0,w,h),d=img.data;for(let i=0;i<d.length;i+=4){const gray=d[i]*.299+d[i+1]*.587+d[i+2]*.114;let g=(gray-128)*1.2+128;g=Math.max(0,Math.min(255,g));d[i]=d[i+1]=d[i+2]=g;}ctx.putImageData(img,0,0);return c.toDataURL('image/jpeg',0.92);}
function addThumb(u){ const img=new Image(); img.src=u; el('scanThumbs').appendChild(img); }
function b64toBlob(b64){ const p=b64.split(','), byte=atob(p[1]), mime=(p[0].match(/:(.*?);/)||[])[1]||'image/jpeg';const ab=new ArrayBuffer(byte.length);const ia=new Uint8Array(ab);for(let i=0;i<byte.length;i++) ia[i]=byte.charCodeAt(i);return new Blob([ab],{type:mime});}
async function onShot(){ const d=drawCurrentFrame(); if(!d){ el('scanStatus').textContent='Attendi messa a fuoco…'; return;} state.scan.images.push(d); addThumb(d); ['btnRetake','btnAddPage','btnFinishScan'].forEach(show); }
function onRetake(){ state.scan.images.pop(); const th=el('scanThumbs'); if(th.lastChild) th.removeChild(th.lastChild); if(!state.scan.images.length){ ['btnRetake','btnAddPage','btnFinishScan'].forEach(hide); } }
function onAddPage(){}
async function onFinishScan(){
  if(!state.scan.images.length){ el('scanStatus').textContent='Nessuna pagina scattata.'; return; }
  el('scanStatus').textContent='Invio scansioni…';
  const blob=b64toBlob(state.scan.images[0]); const fd=new FormData(); fd.append('file', new File([blob],'scan.jpg',{type:'image/jpeg'}));
  showLoader();
  try{
    const res=await fetch('/api/upload',{method:'POST',body:fd});
    const data=await res.json();
    await afterExtract(data);
    el('scanStatus').textContent='Scansione inviata.';
  }catch(e){ alert('Errore di elaborazione.'); }
  finally{ hideLoader(); stopCamera(); }
}
function closeCamera(){ stopCamera(); hide('cameraBlock'); }

/* Upload da HERO */
function triggerFileDialog(){ el('heroFile').click(); }
async function onHeroFileChange(){
  const f=el('heroFile').files[0]; if(!f) return;
  show('workspace'); hideExtractionFallback(); el('heroStatus').textContent='Elaboro…';
  const fd=new FormData(); fd.append('file', f);
  showLoader();
  try{
    const r=await fetch('/api/upload',{method:'POST',body:fd});
    const data=await r.json();
    await afterExtract(data);
    el('heroStatus').textContent='File elaborato.';
  }catch(e){ el('heroStatus').textContent='Errore.'; alert('Errore di elaborazione.'); }
  finally{ hideLoader(); el('heroFile').value=''; }
}

/* Inserimento manuale */
function openManualModal(){ el('manualModal').classList.remove('hidden'); }
function closeManualModal(){ el('manualModal').classList.add('hidden'); }
async function submitManual(){
  const v={
    number:el('m_number').value||'',
    authority:el('m_authority').value||'',
    article:el('m_article').value||'',
    place:el('m_place').value||'',
    dateInfrazione:el('m_dateInfrazione').value||'',
    dateNotifica:el('m_dateNotifica').value||'',
    amount:parseFloat(el('m_amount').value||'0'),
    targa:el('m_targa').value||'',
    owner:{name:el('m_name').value||'Nome Cognome', comune:el('m_comune').value||'', dataNascita:el('m_dob').value||'', indirizzo:el('m_addr').value||'', cf:el('m_cf').value||''},
    rawText:''
  };
  closeManualModal(); hideExtractionFallback(); show('workspace');
  await afterExtract({ verbale: v });
}

/* AI */
async function computeMotiviAI(){
  try{
    const r=await fetch('/api/ai/motivi-central',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({verbale:state.verbale})});
    const txt=await r.text();
    try{ state.motivi=JSON.parse(txt); }
    catch{ state.motivi={centralMotivo:null, mainMotivi:[], extraMotivi:[]}; }
  }catch{ state.motivi={centralMotivo:null, mainMotivi:[], extraMotivi:[]}; }
}

/* Heuristica “scansione adeguata” più permissiva */
function isExtractionWeak(data){
  const raw=(data?.extracted || data?.verbale?.rawText || '').trim();
  const v=data?.verbale || {};
  const fields=['number','authority','article','dateInfrazione','place','dateNotifica','amount','targa'];
  const filled=fields.filter(k=>v[k]);
  // era: raw<80 && filled<2 → troppo severo
  // ora: consideriamo adeguata se c'è raw>=20 O almeno 1 campo
  return !(raw.length>=20 || filled.length>=1);
}

/* Flusso comune */
async function afterExtract(data){
  if(isExtractionWeak(data)){ showExtractionFallback(); return; }

  state.verbale = data.verbale || { amount:0, rawText: data.extracted || '' };
  await computeMotiviAI();

  renderSummary();
  ['number','authority','article','place','dateInfrazione','dateNotifica','amount','targa'].forEach(k=>{ const i=el('v_'+k); if(i) i.value=state.verbale[k]||''; });
  show('step2'); show('step3');

  const score=fieldsScore(state.verbale);
  showFieldsWarning(score);

  if(score>=3) await generatePreview();
  else { show('centralFallback'); openManualModal(); }
}

/* Salva correzioni */
async function saveCorrections(){
  const v=state.verbale||{};
  v.number=el('v_number').value; v.authority=el('v_authority').value; v.article=el('v_article').value;
  v.place=el('v_place').value; v.dateInfrazione=el('v_dateInfrazione').value; v.dateNotifica=el('v_dateNotifica').value;
  v.amount=parseFloat(el('v_amount').value||'0'); v.targa=el('v_targa').value;
  v.owner={ name:el('u_name').value||'Nome Cognome', comune:el('u_comune').value||v.authority||'Comune', dataNascita:el('u_dob').value||'YYYY-MM-DD', indirizzo:el('u_addr').value||'Indirizzo', cf:el('u_cf').value||'CODICEFISCALE' };
  state.verbale=v;

  await computeMotiviAI();
  renderSummary();

  const score=fieldsScore(v);
  showFieldsWarning(score);

  if(score>=3) await generatePreview();
  else { hide('step5'); hide('step6'); hide('step7'); show('centralFallback'); openManualModal(); }
}

/* Anteprima auto (con scroll e timer ben visibile) */
async function generatePreview(){
  const fallbackMode=!state.motivi?.centralMotivo;
  const resAI=await fetch('/api/ai/genera-ricorso',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({verbale:state.verbale, fallbackMode})});
  const ricorsoText=await resAI.text();

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
    else line=test;
  }
  if(line) ctx.fillText(line,x,y);

  // Watermark
  ctx.save(); ctx.translate(canvas.width/2,canvas.height/2); ctx.rotate(-Math.PI/7); ctx.globalAlpha=0.12; ctx.fillStyle='#000'; ctx.font='bold 48px system-ui'; ctx.textAlign='center'; ctx.fillText('BOZZA NON UTILIZZABILE',0,0); ctx.restore();

  show('step5');
  smoothScrollTo(el('step5')); // porta l’utente sull’anteprima

  // prezzo & salvataggio payload per pagamento
  const priceRes=await fetch('/api/checkout/price',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({amount:state.verbale.amount||0})});
  const pr=await priceRes.json(); el('price').textContent=pr.priceFormatted;

  const save=await fetch('/api/store/payload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({verbale:state.verbale,motivi:state.motivi,ricorsoAI:ricorsoText})});
  const sj=await save.json(); state.token=sj.token;

  // TIMER 30s ben visibile
  const timer=el('previewTimer');
  let left=30; timer.textContent=`Anteprima disponibile: ${left}s`; timer.style.fontWeight='700';
  const int=setInterval(()=>{ left--; if(left<=0){ clearInterval(int); wrap.innerHTML='<span class="muted">Anteprima scaduta.</span>'; show('step6'); smoothScrollTo(el('step6')); } else { timer.textContent=`Anteprima disponibile: ${left}s`; } },1000);
}

/* Pagamento */
async function payNow(){
  const r=await fetch('/api/checkout/create-session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({amount:state.verbale?.amount||0, token:state.token})});
  const j=await r.json(); if(j.url) window.location.href=j.url; else alert('Errore creazione sessione pagamento');
}

/* Bind UI */
el('heroStartCam').addEventListener('click', startCamera);
el('heroUpload').addEventListener('click', ()=>el('heroFile').click());
el('heroFile').addEventListener('change', onHeroFileChange);
el('openManual').addEventListener('click', openManualModal);

el('btnShot').addEventListener('click', onShot);
el('btnRetake').addEventListener('click', onRetake);
el('btnAddPage').addEventListener('click', onAddPage);
el('btnFinishScan').addEventListener('click', onFinishScan);
el('btnCloseCam').addEventListener('click', closeCamera);

el('fbRetryScan').addEventListener('click', ()=>{ hideExtractionFallback(); startCamera(); });
el('fbManual').addEventListener('click', openManualModal);
const omc=document.getElementById('openManualFromCentral'); if(omc) omc.addEventListener('click', openManualModal);

el('closeManual').addEventListener('click', closeManualModal);
el('submitManual').addEventListener('click', submitManual);

el('btnSaveCorrections').addEventListener('click', saveCorrections);
el('btnPay').addEventListener('click', payNow);
el('btnReset').addEventListener('click', resetAll);

window.addEventListener('beforeunload', ()=>stopCamera());
