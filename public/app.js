// public/app.js — fix timer, numbering (titles only), AI text de-dup & re-try

let state = {
  verbale: null,
  motivi: null,
  token: null,
  scan: { stream: null, images: [] },
  articles: [],
  previewPages: [],
  previewIndex: 0,
  timerId: null
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
const smoothScrollTo = node => setTimeout(()=>node?.scrollIntoView({behavior:'smooth', block:'start'}),60);

/* Reset */
function resetAll(){
  try { state.scan.stream?.getTracks().forEach(t=>t.stop()); } catch{}
  if (state.timerId) { clearInterval(state.timerId); state.timerId=null; }
  state = { verbale:null, motivi:null, token:null, scan:{stream:null, images:[]}, articles:[], previewPages:[], previewIndex:0, timerId:null };

  // pulizia UI
  ['summary','previewCanvasWrap','previewTimer','scanThumbs','scanStatus'].forEach(id=>{
    const n=el(id);
    if(id==='previewCanvasWrap') n.innerHTML='';
    else n.textContent='';
  });
  const hf=el('heroFile'); if(hf) hf.value='';
  hide('workspace'); hide('cameraBlock'); hide('fallback');
  ['step2','step3','step5','step6','step7','step8','step9'].forEach(hide);
  el('manualModal').classList.add('hidden');
  window.scrollTo({ top: 0, behavior:'smooth' });
}

/* Debole OCR */
function showExtractionFallback(){ show('workspace'); hide('cameraBlock'); ['step2','step3','step5','step6','step7','step8','step9'].forEach(hide); show('fallback'); }
function hideExtractionFallback(){ hide('fallback'); }
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

/* ===== CAMERA ===== */
async function startCamera(){
  try{
    show('workspace'); show('cameraBlock'); hideExtractionFallback();
    const stream=await navigator.mediaDevices.getUserMedia({audio:false, video:{facingMode:{ideal:'environment'}}});
    state.scan.stream=stream; const v=el('camVideo'); v.srcObject=stream; await v.play();
    state.scan.images=[]; el('scanThumbs').innerHTML=''; el('scanStatus').textContent='Inquadra e premi “Scatta”.';
    ['btnRetake','btnAddPage','btnFinishScan'].forEach(hide);
    smoothScrollTo(el('cameraBlock'));
  }catch(e){ alert('Fotocamera non disponibile. Usa “Carica PDF/Foto” o “Inserisci a mano”.'); hide('cameraBlock'); }
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

/* ===== UPLOAD ===== */
el('heroUpload')?.addEventListener('click', ()=>el('heroFile').click());
el('heroFile')?.addEventListener('change', onHeroFileChange);
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

/* ===== MODALE MANUALE + AUTOCOMPLETE + CHIPS ===== */
function openManualModal(){ el('manualModal').classList.remove('hidden'); }
function closeManualModal(){ el('manualModal').classList.add('hidden'); }

function bindTypeahead(inputId, listId, endpoint, onPick){
  const input = el(inputId);
  const box = el(listId);
  input.addEventListener('input', async ()=>{
    const q = input.value.trim();
    if (!q){ box.classList.add('hidden'); box.innerHTML=''; return; }
    try{
      const res = await fetch(`/api/meta/${endpoint}?q=${encodeURIComponent(q)}`);
      const items = await res.json();
      if(!Array.isArray(items) || !items.length){ box.classList.add('hidden'); return; }
      box.innerHTML = items.map(v=>`<li>${v}</li>`).join('');
      box.classList.remove('hidden');
      box.querySelectorAll('li').forEach(li=>{
        li.addEventListener('click', ()=>{
          onPick(li.textContent);
          box.classList.add('hidden'); box.innerHTML='';
        });
      });
    }catch(e){ console.error('autocomplete error', e); }
  });
  document.addEventListener('click', (e)=>{
    if(!box.contains(e.target) && e.target!==input){ box.classList.add('hidden'); }
  });
}

// CHIPS articoli
function renderArticleChips(){
  const wrap = el('m_articles_chips'); wrap.innerHTML='';
  state.articles.forEach(text=>{
    const chip = document.createElement('span');
    chip.className='chip'; chip.textContent=text;
    const x = document.createElement('button');
    x.type='button'; x.className='chip-x'; x.textContent='×';
    x.onclick = ()=>{ state.articles = state.articles.filter(a=>a!==text); renderArticleChips(); };
    chip.appendChild(x);
    wrap.appendChild(chip);
  });
}
function addArticle(text){ if(text && !state.articles.includes(text)){ state.articles.push(text); renderArticleChips(); }

}
bindTypeahead('m_authority','sugg_authority','authorities', (val)=>{ el('m_authority').value = val; });
bindTypeahead('m_placeComune','sugg_place','municipalities', (val)=>{ el('m_placeComune').value = val; });
bindTypeahead('m_article_search','sugg_articles','cds-articles', addArticle);

el('submitManual')?.addEventListener('click', submitManual);
el('openManual')?.addEventListener('click', openManualModal);
el('closeManual')?.addEventListener('click', closeManualModal);

async function submitManual(){
  const v={
    number:el('m_number').value||'',
    authority:el('m_authority').value||'',
    article: (state.articles.length ? state.articles.join('; ') : ''),
    place:el('m_placeComune').value||'',
    placeSpecific:el('m_placeSpecific').value||'',
    dateInfrazione:el('m_dateInfrazione').value||'',
    dateNotifica:el('m_dateNotifica').value||'',
    amount:parseFloat(el('m_amount').value||'0'),
    targa:el('m_targa').value||'',
    owner:{
      name:el('m_name').value||el('u_name')?.value||'Nome Cognome',
      comune:el('m_comune').value||el('u_comune')?.value||'',
      dataNascita:el('m_dob').value||el('u_dob')?.value||'',
      indirizzo:el('m_addr').value||el('u_addr')?.value||'',
      cf:el('m_cf').value||el('u_cf')?.value||''
    },
    rawText: (el('m_extra').value||'')
  };
  closeManualModal(); hideExtractionFallback(); show('workspace');
  await afterExtract({ verbale: v });
}

/* ===== AI ===== */
async function computeMotiviAI(){
  try{
    const r=await fetch('/api/ai/motivi-central',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({verbale:state.verbale})});
    const txt=await r.text();
    try{ state.motivi=JSON.parse(txt); }
    catch{ state.motivi={centralMotivo:null, mainMotivi:[], extraMotivi:[]}; }
  }catch{ state.motivi={centralMotivo:null, mainMotivi:[], extraMotivi:[]}; }
}

/* Heuristica deboli/forti */
function isExtractionWeak(data){
  const raw=(data?.extracted || data?.verbale?.rawText || '').trim();
  const v=data?.verbale || {};
  const fields=['number','authority','article','dateInfrazione','place','dateNotifica','amount','targa'];
  const filled=fields.filter(k=>v[k]);
  return !(raw.length>=20 || filled.length>=1);
}

/* Post-processing AI text: segmenta, ripulisce ripetizioni, numerazione TITOLI */
const TITLE_REGEX = /^(RICORSO AVVERSO VERBALE|OGGETTO|PREMESSE|IN DIRITTO|MOTIVI(?:\s+PRINCIPALI)?|MOTIVI\s+AGGIUNTIVI|ECCEZIONI|RICHIESTA|CONCLUSIONI|ALLEGATI)/i;

function normalizeText(t){
  let s = String(t||'').replace(/\r\n/g,'\n');
  s = s.replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n');
  return s.trim();
}
function splitParagraphs(text){
  const raw = normalizeText(text);
  let parts = raw.split(/\n{2,}/).map(p=>p.trim()).filter(Boolean);

  // se l’AI ha sputato un “muro” senza doppi ritorni, prova a splittare su titoli noti
  if (parts.length <= 3) {
    parts = raw.split(/\n(?=(RICORSO AVVERSO VERBALE|OGGETTO|PREMESSE|IN DIRITTO|MOTIVI|ECCEZIONI|CONCLUSIONI|ALLEGATI)\b)/i);
    parts = parts.map(p=>p.trim()).filter(Boolean);
  }
  return parts;
}
function dedupeParagraphs(pars){
  const seen = new Map(); // testoNormalizzato -> count
  const out = [];
  for (const p of pars){
    const key = p.replace(/\s+/g,' ').toLowerCase();
    const c = (seen.get(key) || 0) + 1;
    seen.set(key, c);
    if (c <= 1) out.push(p); // consenti al massimo 1 volta
  }
  return out;
}
function numberTitlesOnly(pars){
  let i=1;
  return pars.map(p=>{
    const first = p.split('\n')[0] || '';
    if (TITLE_REGEX.test(first)) {
      // se già numerato, sostituisci
      return p.replace(first, `${i++}. ${first}`);
    }
    return p;
  });
}

/* afterExtract */
async function afterExtract(data){
  if(isExtractionWeak(data)){ showExtractionFallback(); return; }

  const oldOwner = state.verbale?.owner || null;
  state.verbale = data.verbale || { amount:0, rawText: data.extracted || '' };
  if (oldOwner) state.verbale.owner = { ...oldOwner, ...(state.verbale.owner||{}) };

  await computeMotiviAI();
  renderSummary();

  // Popola i campi (senza cancellare ciò che l’utente ha già scritto nei dati anagrafici)
  ['number','authority','article','place','placeSpecific','dateInfrazione','dateNotifica','amount','targa']
    .forEach(k=>{ const i=el('v_'+k); if(i && !i.value) i.value=state.verbale[k]||''; });

  if (state.verbale.owner){
    const o = state.verbale.owner;
    if (el('u_name') && !el('u_name').value && o.name) el('u_name').value = o.name;
    if (el('u_comune') && !el('u_comune').value && o.comune) el('u_comune').value = o.comune;
    if (el('u_dob') && !el('u_dob').value && o.dataNascita) el('u_dob').value = o.dataNascita;
    if (el('u_addr') && !el('u_addr').value && o.indirizzo) el('u_addr').value = o.indirizzo;
    if (el('u_cf') && !el('u_cf').value && o.cf) el('u_cf').value = o.cf;
  }
  if (el('u_extra') && !el('u_extra').value) el('u_extra').value = state.verbale.rawText || '';

  show('step2'); show('step3');

  const score=fieldsScore(state.verbale);
  showFieldsWarning(score);
  if(score>=3) await generatePreview(); else { show('centralFallback'); openManualModal(); }
}

/* Salva correzioni */
el('btnSaveCorrections')?.addEventListener('click', saveCorrections);
async function saveCorrections(){
  const v=state.verbale||{};
  v.number=el('v_number').value; v.authority=el('v_authority').value; v.article=el('v_article').value;
  v.place=el('v_place').value; v.placeSpecific=el('v_placeSpecific').value;
  v.dateInfrazione=el('v_dateInfrazione').value; v.dateNotifica=el('v_dateNotifica').value;
  v.amount=parseFloat(el('v_amount').value||'0'); v.targa=el('v_targa').value;
  v.owner={
    name:el('u_name').value||'Nome Cognome',
    comune:el('u_comune').value||v.authority||'Comune',
    dataNascita:el('u_dob').value||'YYYY-MM-DD',
    indirizzo:el('u_addr').value||'Indirizzo',
    cf:el('u_cf').value||'CODICEFISCALE'
  };
  v.rawText = el('u_extra').value || v.rawText;
  state.verbale=v;

  await computeMotiviAI();
  renderSummary();

  const score=fieldsScore(v);
  showFieldsWarning(score);
  if(score>=3) await generatePreview();
  else { hide('step5'); hide('step6'); hide('step7'); show('centralFallback'); openManualModal(); }
}

/* ===== IMPAGINAZIONE multipagina ===== */

function buildFrontMatter(v){
  const ente   = v?.authority || 'All’Autorità competente';
  const num    = v?.number   || '________';
  const comune = v?.place    || '________';
  const dataInf= v?.dateInfrazione || '____-__-__';
  const art    = v?.article  || 'art. ___ CdS';
  const ric    = v?.owner?.name ? `Ricorrente: ${v.owner.name}\n` : '';
  return `${ente}\n\nRICORSO AVVERSO VERBALE N. ${num}\nOGGETTO: Ricorso avverso verbale n. ${num} per presunta violazione di ${art} in ${comune} in data ${dataInf}.\n\n${ric}`;
}

function renderMultipagePreview(paragraphs, opts){
  const {
    pageWidth=800, pageHeight=1120, margin=60,
    font='13px system-ui', lineHeight=20,
    titleFont='bold 16px system-ui', watermark='BOZZA NON UTILIZZABILE',
    frontExtraTopLines = 5
  } = opts;

  state.previewPages = [];
  const meas = document.createElement('canvas').getContext('2d');
  const maxW = pageWidth - margin*2;

  function wrapParagraph(text, isTitle=false){
    meas.font = isTitle ? titleFont : font;
    const words = text.split(/\s+/);
    let line = '', lines = [];
    for (let w of words){
      const test = line + w + ' ';
      if (meas.measureText(test).width > maxW){ lines.push(line.trim()); line = w + ' '; }
      else line = test;
    }
    if (line.trim()) lines.push(line.trim());
    lines.push(''); // spazio tra paragrafi
    return lines.map(l => ({ text: l, isTitle }));
  }

  const TITLE_DET = /^(RICORSO AVVERSO VERBALE|OGGETTO|PREMESSE|IN DIRITTO|MOTIVI|ECCEZIONI|CONCLUSIONI|ALLEGATI)/i;
  let lines = [];
  for (let p of paragraphs){
    const first = p.split('\n')[0] || '';
    const isTitle = TITLE_DET.test(first);
    lines.push(...wrapParagraph(p, isTitle));
  }

  const linesPerPage = Math.floor((pageHeight - margin*2) / lineHeight);
  let cursor = 0, page = 0;

  while (cursor < lines.length){
    const canvas = document.createElement('canvas');
    canvas.width = pageWidth; canvas.height = pageHeight;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle='#fff'; ctx.fillRect(0,0,pageWidth,pageHeight);

    let y = margin;
    let startCursor = cursor;
    let printed = 0;
    let frontBlockConsumed = false;

    while (printed < linesPerPage && cursor < lines.length){
      const ln = lines[cursor];
      ctx.font = ln.isTitle ? titleFont : font;
      ctx.fillStyle = '#111827';
      ctx.textAlign = 'left';

      if (page === 0 && !frontBlockConsumed){
        if (printed === 0 || /^RICORSO AVVERSO VERBALE/i.test(ln.text) || /^OGGETTO/i.test(ln.text)){
          ctx.textAlign = 'center';
          if (ln.text !== '') ctx.fillText(ln.text, pageWidth/2, y);
          ctx.textAlign = 'left';
        } else {
          if (ln.text !== '') ctx.fillText(ln.text, margin, y);
        }
        y += lineHeight; printed++; cursor++;
        if (cursor - startCursor >= 3 && !frontBlockConsumed){
          y += lineHeight * frontExtraTopLines;
          printed += frontExtraTopLines;
          frontBlockConsumed = true;
        }
        continue;
      }

      if (ln.text === '') y += Math.floor(lineHeight*0.6);
      else { ctx.fillText(ln.text, margin, y); y += lineHeight; }

      printed++; cursor++;
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

    state.previewPages.push(canvas);
    page++;
  }

  state.previewIndex = 0;
  renderPreviewStage();
}

function renderPreviewStage(){
  const wrap = el('previewCanvasWrap');
  wrap.innerHTML = '';
  const page = state.previewPages[state.previewIndex];
  if (page) { page.className = 'preview-page'; wrap.appendChild(page); }
  el('pageIndicator').textContent = `Pagina ${state.previewIndex+1}/${state.previewPages.length}`;
  el('prevPage').disabled = (state.previewIndex === 0);
  el('nextPage').disabled = (state.previewIndex >= state.previewPages.length-1);
}

/* ===== GENERA ANTEPRIMA + TIMER ===== */
async function generatePreview(){
  // protezioni timer
  if (state.timerId) { clearInterval(state.timerId); state.timerId=null; }
  hide('step6'); // pagamento solo dopo countdown

  // 1) ottieni corpo ricorso dall’AI, con retry se corto
  let fullText = '';
  let tries = 0;
  while (tries < 3){
    tries++;
    const fallbackMode=!state.motivi?.centralMotivo;
    const resAI=await fetch('/api/ai/genera-ricorso',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        verbale:state.verbale,
        fallbackMode,
        qualityHints: {
          minWords: 2000,
          structure: ["PREMESSE IN FATTO","IN DIRITTO — RICHIAMI NORMATIVI","MOTIVI PRINCIPALI","MOTIVI AGGIUNTIVI","ECCEZIONI E ISTANZE","CONCLUSIONI"],
          avoidRepetition: true,
          tone: "formale, tecnico, forense"
        }
      })
    });
    let ricorsoText = normalizeText(await resAI.text());

    // chiusura formale
    const closing = `

Si allega copia del verbale e documento di identità.



Luogo e data: ______________________

Firma: _____________________________
`;
    const front = buildFrontMatter(state.verbale);
    fullText = `${front}\n${ricorsoText}${closing}`;

    // - split + dedupe
    let pars = splitParagraphs(fullText);
    pars = dedupeParagraphs(pars);

    // se non contiene titoli noti, aggiungine uno per blocchi lunghi
    const hasTitles = pars.some(p => TITLE_REGEX.test(p.split('\n')[0]||''));
    if (!hasTitles){
      pars = [
        'PREMESSE IN FATTO',
        ...pars.slice(0, Math.ceil(pars.length/3)),
        'IN DIRITTO — RICHIAMI NORMATIVI',
        ...pars.slice(Math.ceil(pars.length/3), Math.ceil(2*pars.length/3)),
        'MOTIVI PRINCIPALI',
        ...pars.slice(Math.ceil(2*pars.length/3))
      ];
    }

    // numerazione SOLO dei titoli
    pars = numberTitlesOnly(pars);

    // parola-count
    const wc = pars.join(' ').split(/\s+/).filter(Boolean).length;
    if (wc >= 1600 || tries === 3){
      // render e salvataggio
      show('step5');
      renderMultipagePreview(pars, {
        pageWidth: 800,
        pageHeight: 1120,
        margin: 60,
        font: '13px system-ui',
        lineHeight: 20,
        titleFont: 'bold 16px system-ui',
        watermark: 'BOZZA NON UTILIZZABILE',
        frontExtraTopLines: 5
      });
      smoothScrollTo(el('step5'));

      // calcolo prezzo + payload (testo ricostruito)
      const cleanText = pars.join('\n\n');
      const priceRes=await fetch('/api/checkout/price',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({amount:state.verbale.amount||0})});
      const pr=await priceRes.json(); el('price').textContent=pr.priceFormatted;

      const save=await fetch('/api/store/payload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({verbale:state.verbale,motivi:state.motivi,ricorsoAI:cleanText})});
      const sj=await save.json(); state.token=sj.token;

      break; // esci dal retry
    }
  }

  // 2) TIMER 30s — sempre avviato qui
  const timer=el('previewTimer');
  let left=30;
  timer.textContent=`Anteprima disponibile: ${left}s`;
  if (state.timerId) { clearInterval(state.timerId); }
  state.timerId = setInterval(()=>{
    left--;
    timer.textContent = `Anteprima disponibile: ${left}s`;
    if(left<=0){
      clearInterval(state.timerId); state.timerId=null;
      el('previewCanvasWrap').innerHTML = '<div style="padding:16px;color:#94a3b8">Anteprima scaduta. Procedi al pagamento per scaricare il ricorso in PDF e Word.</div>';
      show('step6');
      smoothScrollTo(el('step6'));
    }
  },1000);
}

/* ===== PAGAMENTO ===== */
async function payNow(){
  const r=await fetch('/api/checkout/create-session',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({amount:state.verbale?.amount||0, token:state.token})
  });
  const j=await r.json(); if(j.url) window.location.href=j.url; else alert('Errore creazione sessione pagamento');
}

/* ===== BINDINGS ===== */
el('heroStartCam')?.addEventListener('click', startCamera);
el('btnShot')?.addEventListener('click', onShot);
el('btnRetake')?.addEventListener('click', onRetake);
el('btnAddPage')?.addEventListener('click', onAddPage);
el('btnFinishScan')?.addEventListener('click', onFinishScan);
el('btnCloseCam')?.addEventListener('click', closeCamera);

el('fbRetryScan')?.addEventListener('click', ()=>{ hideExtractionFallback(); startCamera(); });
el('fbManual')?.addEventListener('click', openManualModal);
el('openManualFromCentral')?.addEventListener('click', openManualModal);
el('openManual')?.addEventListener('click', openManualModal);
el('closeManual')?.addEventListener('click', closeManualModal);

el('btnPay')?.addEventListener('click', payNow);
el('btnReset')?.addEventListener('click', resetAll);

/* Navigazione anteprima (una pagina alla volta) */
el('prevPage')?.addEventListener('click', ()=>{
  if (state.previewIndex>0){ state.previewIndex--; renderPreviewStage(); }
});
el('nextPage')?.addEventListener('click', ()=>{
  if (state.previewIndex < state.previewPages.length-1){ state.previewIndex++; renderPreviewStage(); }
});

window.addEventListener('beforeunload', ()=>stopCamera());
