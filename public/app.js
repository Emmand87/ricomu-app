// public/app.js
let state = {
  verbale: null,
  motivi: null,
  token: null,
  scan: { stream: null, images: [] }
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
  state = { verbale:null, motivi:null, token:null, scan:{stream:null, images:[]} };

  // pulizia campi
  [
    'v_number','v_authority','v_article','v_place','v_dateInfrazione','v_dateNotifica','v_amount','v_targa',
    'u_name','u_comune','u_dob','u_addr','u_cf',
    'm_number','m_authority','m_article','m_place','m_dateInfrazione','m_dateNotifica','m_amount','m_targa',
    'm_name','m_comune','m_dob','m_addr','m_cf'
  ].forEach(id=>{ const i=el(id); if(i) i.value=''; });

  // pulizia UI
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

/* Heuristica “scansione adeguata” (più permissiva) */
function isExtractionWeak(data){
  const raw=(data?.extracted || data?.verbale?.rawText || '').trim();
  const v=data?.verbale || {};
  const fields=['number','authority','article','dateInfrazione','place','dateNotifica','amount','targa'];
  const filled=fields.filter(k=>v[k]);
  // adeguata se c'è un minimo di testo O almeno 1 campo
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

/* ========= IMPAGINAZIONE MULTIPAGINA SU CANVAS ========= */

/** Crea il frontespizio (intestazione + oggetto) come primissimi paragrafi */
function buildFrontMatter(verbale){
  const ente   = verbale?.authority || 'All’Autorità competente';
  const num    = verbale?.number   || '________';
  const luogo  = verbale?.place    || '________';
  const dataInf= verbale?.dateInfrazione || '____-__-__';
  const art    = verbale?.article  || 'art. ___ CdS';

  const intestazione = `${ente}\n\n`;
  const titolo = `RICORSO AVVERSO VERBALE N. ${num}\n`;
  const oggetto = `OGGETTO: Ricorso avverso verbale n. ${num} per presunta violazione di ${art} in ${luogo} in data ${dataInf}.\n\n`;

  // blocco anagrafico base (se disponibile)
  const an = verbale?.owner?.name ? `Ricorrente: ${verbale.owner.name}\n` : '';
  return `${intestazione}${titolo}${oggetto}${an}\n`;
}

/** Scomponi testo in paragrafi (rispetta doppi a capo) */
function splitParagraphs(text){
  const raw = String(text||'').replace(/\r\n/g,'\n');
  return raw.split(/\n{2,}/).map(p=>p.trim()).filter(Boolean);
}

/** Impagina un array di paragrafi in più canvas */
function renderMultipagePreview(paragraphs, opts){
  const {
    container,           // element che conterrà i canvas
    pageWidth = 800,
    pageHeight = 1120,
    margin = 60,
    font = '16px system-ui',
    lineHeight = 24,
    titleFont = 'bold 18px system-ui',
    watermark = 'BOZZA NON UTILIZZABILE'
  } = opts;

  container.innerHTML = '';

  // calcolo righe dal contenuto
  const maxW = pageWidth - margin*2;

  // funzione di misurazione con canvas “fantasma”
  const measCanvas = document.createElement('canvas');
  const mctx = measCanvas.getContext('2d');
  mctx.font = font;

  // helper: wrap di un paragrafo in righe
  function wrapParagraph(text){
    const words = text.split(/\s+/);
    let line = '', lines = [];
    for (let i=0;i<words.length;i++){
      const test = line + words[i] + ' ';
      if (mctx.measureText(test).width > maxW) {
        lines.push(line.trim());
        line = words[i] + ' ';
      } else {
        line = test;
      }
    }
    if (line.trim()) lines.push(line.trim());
    return lines;
  }

  // costruisci array totale di righe con spazio tra paragrafi
  let allLines = [];
  paragraphs.forEach((p,idx)=>{
    // titoli del frontespizio (prime 3 righe “speciali” se marcate con \n)
    if (idx===0 && p.startsWith('RICORSO AVVERSO VERBALE')) {
      // frontespizio già incluso nel primo paragrafo? lo trattiamo come normale
    }
    const wrapped = wrapParagraph(p);
    allLines.push(...wrapped);
    allLines.push(''); // riga vuota tra paragrafi
  });

  // Paginazione
  const linesPerPage = Math.floor((pageHeight - margin*2) / lineHeight);
  let pageCount = Math.ceil(allLines.length / linesPerPage);
  if (pageCount < 1) pageCount = 1;

  // disegniamo pagina per pagina
  let cursor = 0;
  const canvases = [];

  for (let pg = 0; pg < pageCount; pg++){
    const canvas = document.createElement('canvas');
    canvas.width = pageWidth; canvas.height = pageHeight;
    canvas.style.userSelect='none'; canvas.style.pointerEvents='none';
    canvas.className = 'preview-page';
    const ctx = canvas.getContext('2d');

    // sfondo bianco
    ctx.fillStyle = '#fff'; ctx.fillRect(0,0,pageWidth,pageHeight);

    // header (solo pagina 1: intestazione + titolo + oggetto)
    ctx.fillStyle = '#111827';
    ctx.font = font;
    let y = margin;

    if (pg === 0) {
      // intestazione/oggetto sono nelle prime righe del testo (front matter è già nel testo)
      // Per rendere più "ufficiale", centriamo SOLO il titolo se presente.
      const firstLine = allLines[0] || '';
      const isRicorso = firstLine.toUpperCase().startsWith('RICORSO AVVERSO VERBALE');
      if (isRicorso) {
        // stampa prime 2-3 righe in grassetto/centro
        ctx.font = titleFont;
        ctx.textAlign = 'center';
        ctx.fillText(firstLine, pageWidth/2, y);
        y += lineHeight * 1.3;

        // oggetto (la seconda riga inizia con "OGGETTO:")
        ctx.font = font;
        const second = allLines[1] || '';
        if (second.toUpperCase().startsWith('OGGETTO')) {
          ctx.textAlign = 'center';
          ctx.fillText(second, pageWidth/2, y);
          y += lineHeight * 1.2;

          // terza riga (se c'è, es. Ricorrente)
          const third = allLines[2] || '';
          if (third.toUpperCase().startsWith('RICORRENTE')) {
            ctx.textAlign = 'center';
            ctx.fillText(third, pageWidth/2, y);
            y += lineHeight * 1.2;
            // consumiamo queste 3 righe
            cursor = 3;
          } else {
            cursor = 2;
          }
          // separatore
          ctx.textAlign = 'left';
          y += 6;
          ctx.fillRect(margin, y, pageWidth - margin*2, 1);
          y += lineHeight;
        } else {
          // nessun "OGGETTO", rimetti font normale
          ctx.textAlign = 'left';
          ctx.font = font;
          // non consumiamo righe se non erano quelle attese
          y = margin; cursor = 0;
        }
      } else {
        ctx.textAlign = 'left';
      }
    } else {
      ctx.textAlign = 'left';
    }

    // corpo pagina
    ctx.font = font;
    let linesDrawn = 0;
    while (linesDrawn < linesPerPage && cursor < allLines.length) {
      const line = allLines[cursor];
      // paragrafi: riga vuota → spazio extra
      if (line === '') {
        y += lineHeight * 0.6;
      } else {
        ctx.fillText(line, margin, y);
        y += lineHeight;
      }
      linesDrawn++;
      cursor++;
    }

    // watermark
    ctx.save();
    ctx.translate(pageWidth/2, pageHeight/2);
    ctx.rotate(-Math.PI/7);
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#000';
    ctx.font = 'bold 48px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('BOZZA NON UTILIZZABILE', 0, 0);
    ctx.restore();

    // footer pagina
    ctx.fillStyle = '#6b7280';
    ctx.font = '12px system-ui';
    ctx.textAlign = 'right';
    ctx.fillText(`Pagina ${pg+1}/${pageCount}`, pageWidth - margin, pageHeight - margin/2);

    container.appendChild(canvas);
    canvases.push(canvas);
  }

  return canvases.length;
}

/* ===== Anteprima auto (con impaginazione multi-pagina e timer) ===== */
async function generatePreview(){
  const fallbackMode=!state.motivi?.centralMotivo;

  // 1) chiedi testo ricorso al backend
  const resAI=await fetch('/api/ai/genera-ricorso',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({verbale:state.verbale, fallbackMode})
  });
  let ricorsoText = await resAI.text();

  // 2) frontespizio (intestazione + oggetto + ricorrente)
  const front = buildFrontMatter(state.verbale);
  ricorsoText = `${front}\n${ricorsoText}`;

  // 3) impagina multi-pagina su canvas
  const wrap = el('previewCanvasWrap');
  const paragraphs = splitParagraphs(ricorsoText);
  show('step5'); // mostra il riquadro anteprima
  const pages = renderMultipagePreview(paragraphs, {
    container: wrap,
    pageWidth: 800,
    pageHeight: 1120,
    margin: 60,
    font: '16px system-ui',
    lineHeight: 24,
    titleFont: 'bold 18px system-ui',
    watermark: 'BOZZA NON UTILIZZABILE'
  });

  // scroll verso l’anteprima
  smoothScrollTo(el('step5'));

  // 4) calcola prezzo e salva payload per pagamento
  const priceRes=await fetch('/api/checkout/price',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({amount:state.verbale.amount||0})});
  const pr=await priceRes.json(); el('price').textContent=pr.priceFormatted;

  const save=await fetch('/api/store/payload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({verbale:state.verbale,motivi:state.motivi,ricorsoAI:ricorsoText})});
  const sj=await save.json(); state.token=sj.token;

  // 5) TIMER 30s (visibile e in grassetto). Allo 0 → oscura anteprima e mostra pagamento
  const timer=el('previewTimer');
  let left=30; timer.textContent=`Anteprima disponibile: ${left}s`; timer.style.fontWeight='700';
  const int=setInterval(()=>{
    left--;
    if(left<=0){
      clearInterval(int);
      // “oscura” l’anteprima e disattiva l’interazione
      wrap.innerHTML = '<div style="padding:16px;color:#94a3b8">Anteprima scaduta.</div>';
      show('step6');
      smoothScrollTo(el('step6'));
    } else {
      timer.textContent = `Anteprima disponibile: ${left}s`;
    }
  },1000);
}

/* Pagamento */
async function payNow(){
  const r=await fetch('/api/checkout/create-session',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({amount:state.verbale?.amount||0, token:state.token})
  });
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
