// public/app.js
let state = {
  verbale: null,
  motivi: null,
  token: null,
  scan: { stream: null, images: [] },
  articlesSelected: [] // per i chip articoli
};

const el   = id => document.getElementById(id);
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
  state = { verbale:null, motivi:null, token:null, scan:{stream:null, images:[]}, articlesSelected: [] };

  [
    'v_number','v_authority','v_article','v_place','v_placeSpecific','v_dateInfrazione','v_dateNotifica','v_amount','v_targa',
    'u_name','u_comune','u_dob','u_addr','u_cf','u_extra',
    'm_number','m_authority','m_article_search','m_place','m_placeSpecific','m_dateInfrazione','m_dateNotifica','m_amount','m_targa',
    'm_name','m_comune','m_dob','m_addr','m_cf','m_extra'
  ].forEach(id=>{ const i=el(id); if(i) i.value=''; });
  el('m_articles_chips').innerHTML='';

  el('summary').innerHTML=''; el('previewCanvasWrap').innerHTML=''; el('previewTimer').textContent='';
  el('scanThumbs').innerHTML=''; el('scanStatus').textContent='';
  const hf=el('heroFile'); if(hf) hf.value='';

  hide('workspace'); hide('cameraBlock'); hide('fallback');
  ['step2','step3','step5','step6','step7','step8','step9'].forEach(hide);
  el('manualModal').classList.add('hidden');
  window.scrollTo({ top: 0, behavior:'smooth' });
}

/* Fallback parsing debole */
function showExtractionFallback(){ show('workspace'); hide('cameraBlock'); ['step2','step3','step5','step6','step7','step8','step9'].forEach(hide); show('fallback'); }
function hideExtractionFallback(){ hide('fallback'); }

/* Campi chiave */
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
      <li><strong>Comune:</strong> ${state.verbale?.place||'-'}</li>
      <li><strong>Luogo specifico:</strong> ${state.verbale?.placeSpecific||'-'}</li>
      <li><strong>Importo:</strong> € ${state.verbale?.amount||'-'}</li>
    </ul>
  `;
  if(!c) show('centralFallback'); else hide('centralFallback');
}

/* CAMERA (uguale a prima, accorciato per brevità) */
async function startCamera(){
  try{
    show('workspace'); show('cameraBlock'); hideExtractionFallback();
    const stream=await navigator.mediaDevices.getUserMedia({audio:false, video:{facingMode:{ideal:'environment'}}});
    state.scan.stream=stream; const v=el('camVideo'); v.srcObject=stream; await v.play();
    state.scan.images=[]; el('scanThumbs').innerHTML=''; el('scanStatus').textContent='Inquadra e premi “Scatta”.';
    ['btnRetake','btnAddPage','btnFinishScan'].forEach(hide);
    smoothScrollTo(el('cameraBlock'));
  }catch(e){ alert('Fotocamera non disponibile.'); hide('cameraBlock'); }
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
  try{ const res=await fetch('/api/upload',{method:'POST',body:fd}); const data=await res.json(); await afterExtract(data); el('scanStatus').textContent='Scansione inviata.'; }
  catch(e){ alert('Errore di elaborazione.'); }
  finally{ hideLoader(); stopCamera(); }
}
function closeCamera(){ stopCamera(); hide('cameraBlock'); }

/* Upload da HERO */
el('heroUpload')?.addEventListener('click', ()=>el('heroFile').click());
el('heroFile')?.addEventListener('change', onHeroFileChange);
async function onHeroFileChange(){
  const f=el('heroFile').files[0]; if(!f) return;
  show('workspace'); hideExtractionFallback(); el('heroStatus').textContent='Elaboro…';
  const fd=new FormData(); fd.append('file', f);
  showLoader();
  try{ const r=await fetch('/api/upload',{method:'POST',body:fd}); const data=await res.json(); await afterExtract(data); el('heroStatus').textContent='File elaborato.'; }
  catch(e){ el('heroStatus').textContent='Errore.'; alert('Errore di elaborazione.'); }
  finally{ hideLoader(); el('heroFile').value=''; }
}

/* Inserimento manuale */
function openManualModal(){ el('manualModal').classList.remove('hidden'); }
function closeManualModal(){ el('manualModal').classList.add('hidden'); }

/* === TYPEAHEAD helpers === */
async function fetchSugg(endpoint, q){ const r=await fetch(`/api/meta/${endpoint}?q=${encodeURIComponent(q||'')}`); return r.json(); }
function bindSimpleTypeahead(inputId, listId, endpoint){
  const input = el(inputId), ul = el(listId);
  input.addEventListener('input', async ()=>{
    const q = input.value.trim(); const items = await fetchSugg(endpoint, q);
    ul.innerHTML = items.map(v=>`<li data-v="${v.replace(/"/g,'&quot;')}">${v}</li>`).join('');
    if(items.length){ ul.classList.remove('hidden'); } else { ul.classList.add('hidden'); }
  });
  ul.addEventListener('click', e=>{
    const li = e.target.closest('li'); if(!li) return;
    input.value = li.getAttribute('data-v'); ul.classList.add('hidden');
  });
  document.addEventListener('click', (e)=>{ if(!ul.contains(e.target) && e.target!==input) ul.classList.add('hidden'); });
}
function addArticleChip(text){
  if(!text) return;
  if(state.articlesSelected.includes(text)) return;
  state.articlesSelected.push(text);
  const wrap = el('m_articles_chips');
  const chip = document.createElement('span');
  chip.className = 'chip';
  chip.textContent = text;
  const x = document.createElement('button');
  x.type='button'; x.className='chip-x'; x.textContent='×';
  x.onclick = ()=>{
    state.articlesSelected = state.articlesSelected.filter(a=>a!==text);
    chip.remove();
  };
  chip.appendChild(x);
  wrap.appendChild(chip);
}
function bindArticlesTypeahead(){
  const input = el('m_article_search'), ul = el('sugg_articles');
  input.addEventListener('input', async ()=>{
    const items = await fetchSugg('cds-articles', input.value.trim());
    ul.innerHTML = items.map(v=>`<li data-v="${v.replace(/"/g,'&quot;')}">${v}</li>`).join('');
    if(items.length){ ul.classList.remove('hidden'); } else { ul.classList.add('hidden'); }
  });
  ul.addEventListener('click', e=>{
    const li = e.target.closest('li'); if(!li) return;
    addArticleChip(li.getAttribute('data-v'));
    ul.classList.add('hidden');
    input.value='';
  });
  document.addEventListener('click', (e)=>{ if(!ul.contains(e.target) && e.target!==input) ul.classList.add('hidden'); });
}

bindSimpleTypeahead('m_authority','sugg_authority','authorities');
bindSimpleTypeahead('m_place','sugg_place','municipalities');
bindArticlesTypeahead();

/* Submit manuale */
el('submitManual')?.addEventListener('click', submitManual);
async function submitManual(){
  const articleStr = state.articlesSelected.length ? state.articlesSelected.join('; ') : (el('m_article_search').value || '');
  const v={
    number:el('m_number').value||'',
    authority:el('m_authority').value||'',
    article:articleStr,
    place:el('m_place').value||'',
    placeSpecific:el('m_placeSpecific').value||'',
    dateInfrazione:el('m_dateInfrazione').value||'',
    dateNotifica:el('m_dateNotifica').value||'',
    amount:parseFloat(el('m_amount').value||'0'),
    targa:el('m_targa').value||'',
    owner:{name:el('m_name').value||'Nome Cognome', comune:el('m_comune').value||'', dataNascita:el('m_dob').value||'', indirizzo:el('m_addr').value||'', cf:el('m_cf').value||''},
    rawText: (el('m_extra').value||'')
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

/* Heuristica “scansione adeguata” */
function isExtractionWeak(data){
  const raw=(data?.extracted || data?.verbale?.rawText || '').trim();
  const v=data?.verbale || {};
  const fields=['number','authority','article','dateInfrazione','place','dateNotifica','amount','targa'];
  const filled=fields.filter(k=>v[k]);
  return !(raw.length>=20 || filled.length>=1);
}

/* Flusso comune */
async function afterExtract(data){
  if(isExtractionWeak(data)){ showExtractionFallback(); return; }

  state.verbale = data.verbale || { amount:0, rawText: data.extracted || '' };
  await computeMotiviAI();

  renderSummary();
  ['number','authority','article','place','placeSpecific','dateInfrazione','dateNotifica','amount','targa'].forEach(k=>{ const i=el('v_'+k); if(i) i.value=state.verbale[k]||''; });
  if (el('u_extra')) el('u_extra').value = state.verbale.rawText || '';
  show('step2'); show('step3');

  const score=fieldsScore(state.verbale);
  showFieldsWarning(score);

  if(score>=3) await generatePreview();
  else { show('centralFallback'); openManualModal(); }
}

/* Salva correzioni */
el('btnSaveCorrections')?.addEventListener('click', saveCorrections);
async function saveCorrections(){
  const v=state.verbale||{};
  v.number=el('v_number').value; v.authority=el('v_authority').value; v.article=el('v_article').value;
  v.place=el('v_place').value; v.placeSpecific=el('v_placeSpecific').value;
  v.dateInfrazione=el('v_dateInfrazione').value; v.dateNotifica=el('v_dateNotifica').value;
  v.amount=parseFloat(el('v_amount').value||'0'); v.targa=el('v_targa').value;
  v.owner={ name:el('u_name').value||'Nome Cognome', comune:el('u_comune').value||v.authority||'Comune', dataNascita:el('u_dob').value||'YYYY-MM-DD', indirizzo:el('u_addr').value||'Indirizzo', cf:el('u_cf').value||'CODICEFISCALE' };
  v.rawText = el('u_extra').value || v.rawText;
  state.verbale=v;

  await computeMotiviAI();
  renderSummary();

  const score=fieldsScore(v);
  showFieldsWarning(score);

  if(score>=3) await generatePreview();
  else { hide('step5'); hide('step6'); hide('step7'); show('centralFallback'); openManualModal(); }
}

/* ======== RENDER MULTIPAGINA MIGLIORATO ======== */

function buildFrontMatter(v){
  const ente   = v?.authority || 'All’Autorità competente';
  const num    = v?.number   || '________';
  const luogo  = v?.place    || '________';
  const dataInf= v?.dateInfrazione || '____-__-__';
  const art    = v?.article  || 'art. ___ CdS';
  const ric    = v?.owner?.name ? `Ricorrente: ${v.owner.name}\n` : '';
  return `${ente}\n\nRICORSO AVVERSO VERBALE N. ${num}\nOGGETTO: Ricorso avverso verbale n. ${num} per presunta violazione di ${art} in ${luogo} in data ${dataInf}.\n\n${ric}`;
}

function splitParagraphs(text){
  const raw = String(text||'').replace(/\r\n/g,'\n');
  // preserva doppi a capo
  return raw.split(/\n{2,}/).map(p=>p.trim()).filter(Boolean);
}

// Linea “titolo”? (render in grassetto)
function isTitleLine(line){
  return /^(RICORSO AVVERSO VERBALE|OGGETTO|PREMESSE|IN DIRITTO|MOTIVI|RICHIESTA|ECCEZIONI|CONCLUSIONI|ALLEGATI)/i.test(line);
}

function renderMultipagePreview(paragraphs, opts){
  const {
    container, pageWidth=800, pageHeight=1120, margin=60,
    font='14px system-ui', lineHeight=22,
    titleFont='bold 16px system-ui', watermark='BOZZA NON UTILIZZABILE',
    frontExtraTopLines = 5 // spazio (5 righe) prima del corpo
  } = opts;

  container.innerHTML = '';

  const meas = document.createElement('canvas').getContext('2d');
  meas.font = font;
  const maxW = pageWidth - margin*2;

  function wrapParagraph(text, isTitle=false){
    const ctx = meas;
    ctx.font = isTitle ? titleFont : font;
    const words = text.split(/\s+/);
    let line = '', lines = [];
    for (let w of words){
      const test = line + w + ' ';
      if (ctx.measureText(test).width > maxW){
        lines.push(line.trim()); line = w + ' ';
      } else line = test;
    }
    if (line.trim()) lines.push(line.trim());
    // aggiungi una riga vuota tra paragrafi
    lines.push('');
    return lines.map(l => ({ text: l, isTitle }));
  }

  // crea array di righe con flag title
  let lines = [];
  for (let p of paragraphs){
    const firstLine = p.split('\n')[0] || '';
    const titleFlag = isTitleLine(firstLine.toUpperCase());
    lines.push(...wrapParagraph(p, titleFlag));
  }

  const linesPerPage = Math.floor((pageHeight - margin*2) / lineHeight);
  let cursor = 0, page = 0;

  while (cursor < lines.length){
    const canvas = document.createElement('canvas');
    canvas.width = pageWidth; canvas.height = pageHeight;
    canvas.className = 'preview-page';
    const ctx = canvas.getContext('2d');

    // sfondo
    ctx.fillStyle='#fff'; ctx.fillRect(0,0,pageWidth,pageHeight);

    let y = margin;

    // Header/frontespizio (prima pagina): è già nel testo ma vogliamo “alto pagina”
    if (page === 0){
      // niente offset speciale qui, il frontespizio sta nelle prime righe
    }

    // Se prima pagina: dopo il frontespizio lascia 5 righe extra
    let used = 0;
    const startCursor = cursor;

    // calcolo quante righe entrano
    while (used < linesPerPage && cursor < lines.length){
      const ln = lines[cursor];
      let isBlank = ln.text === '';
      // posizione: se siamo nella prima pagina e stiamo ancora dentro il frontespizio (prime 3 righe),
      // lo stampiamo comunque; poi aggiungiamo frontExtraTopLines di spazio prima del resto.
      cursor++; used++;
    }

    // reset puntatore per disegno reale
    cursor = startCursor;
    used = 0; y = margin;

    let frontBlockConsumed = false;
    let printedLines = 0;

    while (printedLines < linesPerPage && cursor < lines.length){
      const ln = lines[cursor];
      let text = ln.text;

      // Applica font per titoli
      ctx.font = ln.isTitle ? titleFont : font;
      ctx.fillStyle = '#111827';
      ctx.textAlign = 'left';

      if (page === 0 && !frontBlockConsumed){
        // Le prime 3 righe costituiranno tipicamente: "Ente", "RICORSO...", "OGGETTO..."
        // Le disegniamo in centro per renderle più formali:
        if (printedLines === 0 || /^RICORSO AVVERSO VERBALE/i.test(text) || /^OGGETTO/i.test(text)){
          ctx.textAlign = 'center';
          ctx.fillText(text, pageWidth/2, y);
          ctx.textAlign = 'left';
        } else {
          ctx.fillText(text, margin, y);
        }
        y += lineHeight;
        printedLines++; cursor++;

        // dopo 3-4 righe, aggiungi 5 righe di spazio (solo una volta)
        if (cursor - startCursor >= 3 && !frontBlockConsumed){
          y += lineHeight * frontExtraTopLines;
          printedLines += frontExtraTopLines;
          frontBlockConsumed = true;
        }
        continue;
      }

      // riga vuota = spazio
      if (text === '') {
        y += Math.floor(lineHeight*0.6);
      } else {
        ctx.fillText(text, margin, y);
        y += lineHeight;
      }
      printedLines++; cursor++;
    }

    // watermark
    ctx.save();
    ctx.translate(pageWidth/2, pageHeight/2);
    ctx.rotate(-Math.PI/7);
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#000';
    ctx.font = 'bold 48px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(watermark, 0, 0);
    ctx.restore();

    // footer
    ctx.fillStyle = '#6b7280';
    ctx.font = '12px system-ui';
    ctx.textAlign = 'right';
    ctx.fillText(`Pagina ${page+1}`, pageWidth - margin, pageHeight - margin/2);

    el('previewCanvasWrap').appendChild(canvas);
    page++;
  }
}

/* Anteprima (con fine documento formale + timer) */
async function generatePreview(){
  const fallbackMode=!state.motivi?.centralMotivo;

  const resAI=await fetch('/api/ai/genera-ricorso',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({verbale:state.verbale, fallbackMode})
  });
  let ricorsoText = await resAI.text();

  // append chiusura formale + spazi
  const closing = `

Si allega copia del verbale e documento di identità.



Luogo e data: ______________________

Firma: _____________________________
`;
  const front = buildFrontMatter(state.verbale);
  ricorsoText = `${front}\n${ricorsoText}${closing}`;

  const paragraphs = splitParagraphs(ricorsoText);
  show('step5');
  el('previewCanvasWrap').innerHTML='';
  renderMultipagePreview(paragraphs, {
    container: el('previewCanvasWrap'),
    pageWidth: 800,
    pageHeight: 1120,
    margin: 60,
    font: '14px system-ui',
    lineHeight: 22,
    titleFont: 'bold 16px system-ui',
    watermark: 'BOZZA NON UTILIZZABILE',
    frontExtraTopLines: 5
  });

  smoothScrollTo(el('step5'));

  // prezzo & payload
  const priceRes=await fetch('/api/checkout/price',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({amount:state.verbale.amount||0})});
  const pr=await priceRes.json(); el('price').textContent=pr.priceFormatted;

  const save=await fetch('/api/store/payload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({verbale:state.verbale,motivi:state.motivi,ricorsoAI:ricorsoText})});
  const sj=await save.json(); state.token=sj.token;

  // COUNTDOWN 30s → poi pagamento
  const timer=el('previewTimer');
  let left=30; timer.textContent=`Anteprima disponibile: ${left}s`; timer.style.fontWeight='700';
  const int=setInterval(()=>{
    left--;
    if(left<=0){
      clearInterval(int);
      el('previewCanvasWrap').innerHTML = '<div style="padding:16px;color:#94a3b8">Anteprima scaduta.</div>';
      show('step6'); smoothScrollTo(el('step6'));
    } else { timer.textContent = `Anteprima disponibile: ${left}s`; }
  },1000);
}

/* Pagamento */
async function payNow(){
  const r=await fetch('/api/checkout/create-session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({amount:state.verbale?.amount||0, token:state.token})});
  const j=await r.json(); if(j.url) window.location.href=j.url; else alert('Errore creazione sessione pagamento');
}

/* Bind UI */
el('heroStartCam')?.addEventListener('click', startCamera);
el('openManual')?.addEventListener('click', openManualModal);
el('btnShot')?.addEventListener('click', onShot);
el('btnRetake')?.addEventListener('click', onRetake);
el('btnAddPage')?.addEventListener('click', onAddPage);
el('btnFinishScan')?.addEventListener('click', onFinishScan);
el('btnCloseCam')?.addEventListener('click', closeCamera);
el('fbRetryScan')?.addEventListener('click', ()=>{ hideExtractionFallback(); startCamera(); });
el('fbManual')?.addEventListener('click', openManualModal);
el('openManualFromCentral')?.addEventListener('click', openManualModal);
el('closeManual')?.addEventListener('click', closeManualModal);
el('btnPay')?.addEventListener('click', payNow);
el('btnReset')?.addEventListener('click', resetAll);
window.addEventListener('beforeunload', ()=>stopCamera());
