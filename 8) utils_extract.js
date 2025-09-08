import dayjs from 'dayjs';
export function parseOCRText(text){
  const find = (re) => { const m = text.match(re); return m ? m[1].trim() : null; };
  const number = find(/verbale\s*n\.?\s*([A-Z0-9\/\-]+)/i);
  const authority = find(/comune di\s+([A-ZÀ-Ùa-zà-ù\s]+)/i);
  const article = find(/art\.?\s*([0-9]+[a-zA-Z\/-]*)/i);
  const place = find(/luogo[:\s]\s*([^\n]+)/i) || find(/via\s+([^\n]+)/i);
  const di = find(/data\s*(?:infrazione|violazione)[:\s]\s*([0-9]{2}\/[0-9]{2}\/[0-9]{4})/i);
  const dn = find(/data\s*(?:notifica)[:\s]\s*([0-9]{2}\/[0-9]{2}\/[0-9]{4})/i);
  const normalizeDate = (s) => { if (!s) return null; const d = dayjs(s, ['DD/MM/YYYY','YYYY-MM-DD'], true); return d.isValid() ? d.format('YYYY-MM-DD') : null; };
  return {
    number:number||'', authority:authority||'', article:article||'',
    place:place||'', dateInfrazione:normalizeDate(di), dateNotifica:normalizeDate(dn),
    amount: null, rawText:text
  };
}
