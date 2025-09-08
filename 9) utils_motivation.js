export function detectMotivations(p){
  const main=[]; const extra=[{type:'difetto_motivazione'},{type:'proporzionalita'},{type:'competenza_territoriale'},{type:'carenza_prova_fotografica'}];
  if (!p) return { mainMotivi:[], extraMotivi:[], centralMotivo:null };
  if (p.dateInfrazione && p.dateNotifica){
    const di = new Date(p.dateInfrazione); const dn = new Date(p.dateNotifica);
    const diff = Math.round((dn - di)/86400000);
    if (diff > 90){ main.push({type:'notifica_tardiva', detail:`notifica oltre 90 giorni (${diff})`}); }
  }
  if ((p.article||'').startsWith('142')){
    main.push({type:'segnaletica_inadeguata', detail:'possibile carenza di segnalazione autovelox'});
    main.push({type:'difetti_documentali', detail:'omologazione/taratura non provata'});
  }
  if (main.length === 0){ main.push({type:'richiesta_accesso_atti', detail:'necessaria verifica documentale'}); }
  const central = main[0] || null;
  return { mainMotivi: main, extraMotivi: extra, centralMotivo: central };
}
