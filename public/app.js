let state = { verbale:null, motivi:null, token:null };
const el = id => document.getElementById(id);
function show(id){ el(id).classList.remove('hidden'); }

function renderSummary(){
  const c = state.motivi?.centralMotivo;
  const cites = (arr=[]) => arr.map(ci => `<small class="muted">[${ci.ref}${ci.link?` – <a href="${ci.link}" target="_blank" rel="noopener">fonte</a>`:''}]</small>`).join(' ');
  const centralHtml = c ? `<p><span class="pill">Motivo centrale (AI): ${c.type}${c.detail ? ' – '+c.detail : ''}</span> ${cites(c.citations)}</p>` : '<p class="muted">Motivo centrale non determinato.</p>';
  el('summary').innerHTML = `
    ${centralHtml}
    <ul>
      <li><strong>Numero:</strong> ${state.verbale.number||'-'}</li>
      <li><strong>Ente:</strong> ${state.verbale.authority||'-'}</li>
      <li><strong>Articolo:</strong> ${state.verbale.article||'-'}</li>
      <li><strong>Infrazione:</strong> ${state.verbale.dateInfrazione||'-'}</li>
      <li><strong>Notifica:</strong> ${state.verbale.dateNotifica||'-'}</li>
      <li><strong>Luogo:</strong> ${state.verbale.place||'-'}</li>
      <li><strong>Importo:</strong> € ${state.verbale.amount||'-'}</li>
    </ul>
    <p><strong>Motivi individuati (AI):</strong></p>
    <ul>
      ${(state.motivi.mainMotivi||[]).map(m=>`<li>${m.type} – ${m.detail||''} ${cites(m.citations)}</li>`).join('')}
      ${(state.motivi.extraMotivi||[]).map(m=>`<li>Pretestuoso: ${m.type} ${cites(m.citations)}</li>`).join('')}
    </ul>`;
}

async function computeMotiviAI(){
  const r = await fetch('/api/ai/motivi-central', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ verbale: state.verbale })
  });
  const txt = await r.text();
  try { state.motivi = JSON.parse(txt); } catch(e){ console.error('AI parse error', txt); state.motivi = { mainMotivi:[], extraMotivi:[], centralMotivo:null }; }
}

async function uploadFile(){
  const file = el('file').files[0];
  if(!file){ el('s1status').textContent='Seleziona un file.'; return; }
  el('s1status').textContent='Elaboro...';
  const fd = new FormData(); fd.append('file', file);
  const res = await fetch('/api/upload',{ method:'POST', body:fd });
  const data = await res.json();
  state.verbale = data.verbale;

  await computeMotiviAI();

  el('s1status').textContent='Dati estratti e motivi AI calcolati.';
  renderSummary();
  ['number','authority','article','place','dateInfrazione','dateNotifica','amount','targa'].forEach(k => { const i='v_'+k; if(el(i)) el(i).value = state.verbale[k]||''; });
  show('step2'); show('step3'); show('step5');
}

async function saveCorrections(){
  const v = state.verbale;
  v.number=el('v_number').value; v.authority=el('v_authority').value; v.article=el('v_article').value;
  v.place=el('v_place').value; v.dateInfrazione=el('v_dateInfrazione').value; v.dateNotifica=el('v_dateNotifica').value;
  v.amount=parseFloat(el('v_amount').value||'0'); v.targa=el('v_targa').value;
  v.owner={ name:el('u_name').value||'Nome Cognome', comune:el('u_comune').value||v.authority||'Comune', dataNascita:el('u_dob').value||'YYYY-MM-DD', indirizzo:el('u_addr').value||'Indirizzo', cf:el('u_cf').value||'CODICEFISCALE' };
  await computeMotiviAI();
  renderSummary();
  alert('Dati aggiornati e motivo ricalcolato (AI).');
}

async function generatePreview(){
  const resAI = await fetch('/api/ai/genera-ricorso',{
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ verbale: state.verbale })
  });
  const ricorsoText = await resAI.text();

  const wrap=el('previewCanvasWrap'); wrap.innerHTML='';
  const canvas=document.createElement('canvas'); canvas.width=800; canvas.height=1120;
  canvas.style.userSelect='none'; canvas.style.pointerEvents='none'; canvas.style.border='1px solid #e5e7eb'; wrap.appendChild(canvas);
  const ctx=canvas.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.fillStyle='#111827'; ctx.font='16px sans-serif';
  const words=(ricorsoText||'').split(/\s+/); let x=40,y=60,line=''; const maxW=canvas.width-80;
  for(let i=0;i<words.length;i++){ const test=line+words[i]+' '; if(ctx.measureText(test).width>maxW){ ctx.fillText(line,x,y); line=words[i]+' '; y+=22; if(y>canvas.height-80) break; } else { line=test; } }
  if(line) ctx.fillText(line,x,y);
  ctx.save(); ctx.translate(canvas.width/2,canvas.height/2); ctx.rotate(-Math.PI/7); ctx.globalAlpha=0.12; ctx.fillStyle='#000'; ctx.font='bold 48px sans-serif'; ctx.textAlign='center'; ctx.fillText('BOZZA NON UTILIZZABILE',0,0); ctx.restore();

  let left=30; const timer=el('previewTimer'); timer.textContent=`Anteprima visibile per ${left} secondi...`;
  const int=setInterval(()=>{ left--; if(left<=0){ clearInterval(int); wrap.innerHTML='<span class="muted">Anteprima scaduta.</span>'; show('step6'); } else { timer.textContent=`Anteprima visibile per ${left} secondi...`; } },1000);

  const priceRes=await fetch('/api/checkout/price',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({amount:state.verbale.amount||0})}); const pr=await priceRes.json(); el('price').textContent=pr.priceFormatted;

  state.motivi = state.motivi || {};
  const save = await fetch('/api/store/payload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({verbale:state.verbale,motivi:state.motivi, ricorsoAI: ricorsoText})});
  const sj = await save.json(); state.token = sj.token;
}

async function payNow(){
  const r = await fetch('/api/checkout/create-session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({amount:state.verbale.amount||0, token: state.token})});
  const j = await r.json(); if(j.url){ window.location.href = j.url; } else { alert('Errore creazione sessione pagamento'); }
}

document.getElementById('btnUpload').onclick=uploadFile;
document.getElementById('btnSaveCorrections').onclick=saveCorrections;
document.getElementById('btnPreview').onclick=generatePreview;
document.getElementById('btnPay').onclick=payNow;
