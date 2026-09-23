import { zipSync, strToU8 } from "fflate";
/** Small synthetic fixtures, with no user document content. */
export function pdfFixture(texts = ["Audit team controls quality.", "Director approves the plan."]) {
 const objects: string[] = ['<< /Type /Catalog /Pages 2 0 R >>',`<< /Type /Pages /Kids [${texts.map((_,i)=>`${4+i*2} 0 R`).join(' ')}] /Count ${texts.length} >>`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
 texts.forEach((text,i)=>{
  objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5+i*2} 0 R >>`);
  const stream=text ? `BT /F1 12 Tf 50 700 Td (${text}) Tj ET` : "";
  objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
 });
 let pdf='%PDF-1.4\n'; const offsets=[0];
 objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${o}\nendobj\n`;});
 const xref=Buffer.byteLength(pdf);
 pdf+=`xref\n0 ${offsets.length}\n0000000000 65535 f \n`+offsets.slice(1).map(o=>`${String(o).padStart(10,'0')} 00000 n \n`).join('');
 pdf+=`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
 return new Uint8Array(Buffer.from(pdf));
}
export function xlsxFixture() {
 return zipSync({
  'xl/workbook.xml':strToU8('<workbook xmlns:r="urn:rels"><sheets><sheet name="Структура" sheetId="1" r:id="rId1"/><sheet name="Роли" sheetId="2" r:id="rId2" state="hidden"/></sheets></workbook>'),
  'xl/_rels/workbook.xml.rels':strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>'),
  'xl/sharedStrings.xml':strToU8('<sst><si><t>Отдел аудита</t></si><si><r><t>Контроль </t></r><r><t>качества</t></r></si></sst>'),
  'xl/worksheets/sheet1.xml':strToU8('<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Директор</t></is></c><c r="B2"><f>1+1</f><v>2</v></c><c r="C2"><f>2+1</f></c></row></sheetData></worksheet>'),
  'xl/worksheets/sheet2.xml':strToU8('<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Утверждает план</t></is></c></row></sheetData></worksheet>'),
 });
}
