import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { zipSync, strToU8, unzipSync } from "fflate";
import { parseDocument, DocumentParseError } from "../src/lib/server/document-parser";
import { saveDocument, readDocument } from "../src/lib/server/document-store";
import { verifySource } from "../src/lib/server/document-sources";
import { extractDocument } from "../src/lib/server/extraction";
import { pdfFixture, xlsxFixture } from "./helpers/document-fixtures";

test("PDF preserves page identities and exact verifiable text",async()=>{
 const result=await parseDocument(pdfFixture(),"demo.pdf","before");
 assert.equal(result.fragments.length,2);
 assert.deepEqual(result.fragments.map(f=>f.location),[{format:"pdf",page:1},{format:"pdf",page:2}]);
 assert.match(result.fragments[1].text,/Director approves/);
 assert.equal(verifySource(result.fragments,{document_id:result.document_id,side:"before",fragment_id:result.fragments[1].fragment_id,quote:"Director approves the plan."}).ok,true);
 const extraction=await extractDocument(result,undefined,async()=>({units:[],functions:[{unit_name:null,action:"approves",object:"plan",scope:null,conditions:null,responsibility_type:"approval",modality:"duty",evidence:[{fragment_id:result.fragments[1].fragment_id,quote:"Director approves the plan."}]}]}));
 assert.equal(extraction.functions[0].evidence[0].location.format,"pdf");
});
test("image-only/empty and corrupt PDFs fail explicitly; mixed pages warn",async()=>{
 await assert.rejects(parseDocument(pdfFixture([""]),"scan.pdf","before"),/OCR/);
 const mixed=await parseDocument(pdfFixture(["", "Visible text"]),"mixed.pdf","after");
 assert.match(mixed.warnings.join(' '),/без извлечённого текста: 1/);
 await assert.rejects(parseDocument(strToU8('%PDF-broken'),"bad.pdf","before"),DocumentParseError);
});
test("XLSX preserves worksheets, sparse ranges, rich strings and formula warnings",async()=>{
 const result=await parseDocument(xlsxFixture(),"book.xlsx","after");
 assert.equal(result.fragments.length,3);
 assert.equal(result.fragments[0].text,"A1: Отдел аудита | C1: Контроль качества");
 assert.deepEqual(result.fragments[0].location,{format:"xlsx",sheet:"Структура",cells:"A1:C1"});
 assert.deepEqual(result.fragments[2].location,{format:"xlsx",sheet:"Роли",cells:"A1"});
 assert.match(result.warnings.join(' '),/без сохранённого значения/);
 assert.match(result.warnings.join(' '),/скрытый лист/);
 const fragment=result.fragments[2];
 assert.equal(verifySource(result.fragments,{...fragment,quote:'Утверждает план'}).ok,true);
});
test("XLSX rejects broken references, unsafe XML and oversized expansions",async()=>{
 const files=unzipSync(xlsxFixture());
 files['xl/sharedStrings.xml']=strToU8('<!DOCTYPE x [<!ENTITY secret "test">]><sst/>');
 await assert.rejects(parseDocument(zipSync(files),"book.xlsx","before"),DocumentParseError);
 const broken=unzipSync(xlsxFixture());
 broken['xl/_rels/workbook.xml.rels']=strToU8('<Relationships><Relationship Id="rId1" Target="../../secret.xml"/></Relationships>');
 await assert.rejects(parseDocument(zipSync(broken),"book.xlsx","before"),DocumentParseError);
 await assert.rejects(parseDocument(zipSync({'xl/workbook.xml':strToU8('x'.repeat(17*1024*1024))}),"big.xlsx","before"),DocumentParseError);
});
test("PDF and XLSX upload persists parsed sources and unchanged originals",async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'san-formats-'));
 try { for (const [name,bytes] of [['demo.pdf',pdfFixture()],['demo.xlsx',xlsxFixture()]] as const) {
  const saved=await saveDocument(bytes,name,'before',root);
  assert.equal(saved.status,'parsed'); assert.ok(saved.fragment_count);
  assert.deepEqual((await readDocument(saved.id,false,root)).data,Buffer.from(bytes));
  assert.ok(JSON.parse((await readDocument(saved.id,true,root)).data.toString()).fragments.length);
 }} finally { await rm(root,{recursive:true,force:true}); }
});
