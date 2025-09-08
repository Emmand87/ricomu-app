import PDFDocument from 'pdfkit';
import fs from 'fs';

export function createPdfFromText({ text, outPath, watermark=null }){
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size:'A4', margins:{top:56,left:56,right:56,bottom:56} });
    const stream = fs.createWriteStream(outPath);
    doc.pipe(stream);
    const paragraphs = text.split(/\n\n+/);
    const normal = () => doc.fontSize(11).fillColor('black');
    const header = (t) => doc.fontSize(14).fillColor('black').text(t, { underline:true }).moveDown(0.5);
    const drawWatermark = () => {
      if (!watermark) return;
      doc.save(); doc.fillColor('gray'); doc.rotate(-30, { origin:[300,300] });
      for (let y=100; y<800; y+=200){ for (let x=0; x<600; x+=200){ doc.fontSize(36).opacity(0.15).text(watermark,x,y); } }
      doc.opacity(1).restore();
    };
    drawWatermark();
    for (const p of paragraphs){
      if (p.startsWith('## ')){ header(p.replace(/^##\s+/,'')); }
      else { normal(); doc.text(p, { align:'justify' }).moveDown(0.8); }
      if (doc.y > 730){ doc.addPage(); drawWatermark(); }
    }
    doc.end();
    stream.on('finish', ()=>resolve(outPath));
    stream.on('error', reject);
  });
}
