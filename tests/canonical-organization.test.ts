import { test } from "node:test";
import assert from "node:assert/strict";
import { toCanonicalOrganization } from "../src/lib/canonical-organization";
import type { ExtractionResult } from "../src/lib/extraction";
const source = { document_id:"d", document:"test.docx", side:"before" as const, fragment_id:"p1", location:{format:"docx" as const,paragraph:1}, text:"Директор не вправе исполнять контроль.", quote:"не вправе исполнять контроль", start:9,end:35 };
function fixture(): ExtractionResult { return {schema_version:"extraction-v1", document_id:"d",document:"test.docx",side:"before",model:"synthetic",created_at:"test",review_required:true,processed_fragments:1,rejected_items:0,warnings:[],units:[{unit_id:"u",unit_name:"Отдел",entity_type:"unit",parent_unit:null,evidence:[source]},{unit_id:"p",unit_name:"Директор",entity_type:"position",parent_unit:"Отдел",evidence:[source]}],functions:[{function_id:"f",unit_name:"Директор",action:"исполнять",object:"контроль",scope:"процессы",conditions:"при проверке",responsibility_type:"execution",modality:"prohibition",evidence:[source]}]}; }
test("canonical links positions, owners and sources while preserving prohibitions",()=>{
 const input=fixture(), before=JSON.stringify(input);
 const {organization:o}=toCanonicalOrganization([input,input],"before");
 assert.equal(o.units.length,1); assert.equal(o.positions[0].unit_id,"u");
 assert.equal(o.functions.length,1); assert.equal(o.functions[0].owner_type,"position");
 assert.equal(o.functions[0].owner_id,"p"); assert.equal(o.functions[0].modality,"prohibition");
 assert.match(o.functions[0].canonical_text,/Запрещено/); assert.match(o.functions[0].canonical_text,/при проверке/);
 assert.equal(o.sources.length,1); assert.equal(o.functions[0].source_refs[0],o.sources[0].source_id);
 assert.equal(JSON.stringify(input),before);
});
test("legacy and ambiguous mentions do not become invented units or owners",()=>{
 const input=fixture(); input.units.forEach(u=>delete u.entity_type);
 const result=toCanonicalOrganization([input],"before");
 assert.equal(result.organization.units.length,0); assert.equal(result.organization.functions[0].owner_id,null);
 assert.ok(result.warnings.length); assert.equal(result.review_required,true);
 const ambiguous=fixture(); ambiguous.units.push({...ambiguous.units[1],unit_id:"p2"});
 assert.equal(toCanonicalOrganization([ambiguous],"before").organization.functions[0].owner_id,null);
});
test("sides are isolated and AFTER is never approved automatically",()=>{
 const input=fixture(); assert.throws(()=>toCanonicalOrganization([input],"after"));
 assert.throws(()=>toCanonicalOrganization([],"before"));
 const after=fixture(); after.side="after"; after.document_id="a";
 after.units=after.units.map(u=>({...u,evidence:u.evidence.map(s=>({...s,side:"after",document_id:"a"}))}));
 after.functions=after.functions.map(f=>({...f,evidence:f.evidence.map(s=>({...s,side:"after",document_id:"a"}))}));
 assert.equal(toCanonicalOrganization([after],"after").organization.state,"proposed");
 assert.notEqual(toCanonicalOrganization([input],"before").organization.sources[0].source_id,toCanonicalOrganization([after],"after").organization.sources[0].source_id);
});
