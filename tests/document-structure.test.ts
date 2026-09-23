import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDocumentStructure } from "../src/lib/document-structure";
import type { ExtractedUnit } from "../src/lib/extraction";
const unit=(id:string,name:string,parent:string|null):ExtractedUnit=>({unit_id:id,unit_name:name,parent_unit:parent,evidence:[]});
test("structure uses exact parent names and preserves aliases and unknown parents",()=>{
 const input=[unit('a','БВА',null),unit('b','Департамент','БВА'),unit('c','Блок внутреннего аудита','Компания')];
 const before=JSON.stringify(input),nodes=buildDocumentStructure(input);
 assert.equal(nodes.find(n=>n.id==='b')?.parentId,'a');
 assert.equal(nodes.length,4); assert.equal(nodes.find(n=>n.name==='Компания')?.entity,undefined);
 assert.equal(JSON.stringify(input),before);
});
test("ambiguous parents and cycles remain visible without recursive loops",()=>{
 const nodes=buildDocumentStructure([unit('a','A','B'),unit('b','B','A'),unit('c','X',null),unit('d','X',null),unit('e','E','X')]);
 assert.equal(nodes.find(n=>n.id==='e')?.parentId,null);
 for (const n of nodes) { const seen=new Set<string>(); let curr: typeof n|undefined=n; while(curr) {assert.ok(!seen.has(curr.id));seen.add(curr.id);curr=nodes.find(x=>x.id===curr?.parentId);} }
});
