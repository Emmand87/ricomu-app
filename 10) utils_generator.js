function countWords(t){ return (t?.trim().match(/\S+/g) ?? []).length; }
function fill(text, data){
  return text
    .replaceAll('[Nome Cognome]', data.owner?.name ?? 'Nome Cognome')
    .replaceAll('[Comune]', data.owner?.comune ?? (data.authority ?? ''))
    .replaceAll('[Data]', data.owner?.dataNascita ?? 'YYYY-MM-DD')
    .replaceAll('[Indirizzo]', data.owner?.indirizzo ?? 'Indirizzo')
    .replaceAll('[Codice fiscale]', data.owner?.cf ?? 'CODICEFISCALE')
    .replaceAll('[Targa]', data.targa ?? 'TARGA')
    .replaceAll('[Numero Verbale]', data.number ?? 'NUMERO')
    .replaceAll('[Data Notifica]', data.dateNotifica ?? 'YYYY-MM-DD')
    .replaceAll('[Articolo]', data.article ?? 'ARTICOLO');
}
export function buildText(template, verbale, motivi, citations, minWords=2000){
  let text='';
  for (const block of template.ricorso_template){
    let section = `\n\n## ${block.title}\n\n` + fill(block.base_text, verbale) + '\n\n';
    for (const ext of (block.extensions||[])) section += '- ' + ext + '\n';
    text += section;
  }
  text += '\n\n## Motivi individuati\n\n';
  if(motivi.centralMotivo){ text += `- Motivo centrale (auto/AI): ${motivi.centralMotivo.type} — ${motivi.centralMotivo.detail || ''}\n`; }
  for (const m of (motivi.mainMotivi||[])) text += `- Principale: ${m.type} — ${m.detail ?? ''}\n`;
  for (const m of (motivi.extraMotivi||[])) text += `- Pretestuoso: ${m.type}\n`;
  text += '\n\n## Citazioni\n\n';
  for (const c of (citations||[])) text += `- ${c.refCode}: ${c.excerpt}\n`;
  const filler='In via generale, si richiama il principio di legalità, tipicità e proporzionalità che governa l’azione amministrativa, nonché le garanzie partecipative ex L. 241/1990. ';
  while (countWords(text) < minWords) text += '\n\n' + filler;
  return text;
}
