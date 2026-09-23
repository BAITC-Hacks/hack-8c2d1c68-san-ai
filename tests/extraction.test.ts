import { test } from "node:test";
import assert from "node:assert/strict";
import { chunkFragments, extractDocument, validateExtraction } from "../src/lib/server/extraction";
import { AiError } from "../src/lib/server/openai-json";
import type { SourceFragment } from "../src/lib/server/document-sources";
const fragment: SourceFragment = { document_id:"doc-test", document:"synthetic.docx", side:"before", fragment_id:"paragraph-1", text:"Отдел аудита не вправе внедрять процессы.", location:{format:"docx",paragraph:1} };
const ev = [{fragment_id:fragment.fragment_id,quote:fragment.text}];
const output = () => ({ units:[{ unit_name:"Отдел аудита", parent_unit:null,evidence:ev }],functions:[{unit_name:"Отдел аудита",action:"внедрять",object:"процессы",scope:null,responsibility_type:"execution",modality:"prohibition",conditions:null,evidence:ev}] });
test("extraction retains prohibition and parser-owned evidence coordinates", () => {
 const result = validateExtraction(output(),[fragment]);
 assert.equal(result.functions[0].modality,"prohibition");
 assert.equal(result.functions[0].evidence[0].location.format,"docx");
 assert.equal(result.rejected,0);
 assert.equal(result.functions[0].function_id,validateExtraction(output(),[fragment]).functions[0].function_id);
});
test("fabricated citation, unknown fragment and malformed fields are rejected, counted", () => {
 const fake=output(); fake.functions[0].evidence=[{fragment_id:"other",quote:fragment.text}];
 assert.equal(validateExtraction(fake,[fragment]).rejected,1);
 fake.functions[0].evidence=[{fragment_id:fragment.fragment_id,quote:"выполняет закупки"}];
 assert.equal(validateExtraction(fake,[fragment]).functions.length,0);
 assert.equal(validateExtraction({units:[{}],functions:[{...fake.functions[0],modality:"invented"}]},[fragment]).rejected,2);
 assert.throws(()=>validateExtraction({units:[]},[fragment]),AiError);
});
test("entity classification is retained and unsupported classifications are rejected", () => {
 const unit=output().units[0];
 const result=validateExtraction({units:[{...unit,entity_type:"position"}],functions:[]},[fragment]);
 assert.equal(result.units[0].entity_type,"position");
 assert.equal(validateExtraction({units:[{...unit,entity_type:"person"}],functions:[]},[fragment]).rejected,1);
 assert.equal(validateExtraction(output(),[fragment]).units[0].entity_type,"unknown");
});
test("chunking covers each paragraph exactly once and refuses oversize instead of truncating", () => {
 const input=Array.from({length:8},(_,i)=>({...fragment,fragment_id:`p${i}`}));
 assert.deepEqual(chunkFragments(input,90).flat(),input);
 assert.throws(()=>chunkFragments([fragment],3),AiError);
 assert.throws(()=>chunkFragments([]),AiError);
});
test("execution and oversight survive extraction as distinct responsibilities", async () => {
 const parsed={document_id:fragment.document_id,document:fragment.document,side:fragment.side,fragments:[fragment],warnings:[]};
 const input=output();
 input.functions.push({...input.functions[0],responsibility_type:"oversight"});
 const result=await extractDocument(parsed,undefined,async()=>input);
 assert.equal(result.functions.length,2);
 assert.notEqual(result.functions[0].function_id,result.functions[1].function_id);
 assert.deepEqual(result.functions.map(fn=>fn.responsibility_type),["execution","oversight"]);
});
test("provider failure prevents partial success; successful extraction is explicitly review-required",async()=>{
 const parsed={document_id:fragment.document_id,document:fragment.document,side:fragment.side,fragments:[fragment],warnings:[]};
 const result=await extractDocument(parsed,undefined,async request=>{
  assert.ok(request.instructions.includes("недоверенные"));
  return output();
 });
 assert.equal(result.review_required,true); assert.equal(result.processed_fragments,1);
 assert.equal(result.functions.length,1);
 await assert.rejects(extractDocument(parsed,undefined,async()=>{throw new AiError("test refusal");}),AiError);
});

test("one document uses four available requests and retains all fragments", async () => {
 const fragments=Array.from({length:8},(_,i)=>({...fragment,fragment_id:`p${i}`,text:"а".repeat(8000)}));
 const releases:Array<()=>void>=[];
 const seen:string[]=[];
 const extraction=extractDocument({document_id:fragment.document_id,document:fragment.document,side:fragment.side,fragments,warnings:[]},undefined,async request=>{
  const input=JSON.parse(request.input);
  seen.push(...input.target.map((f:SourceFragment)=>f.fragment_id));
  await new Promise<void>(resolve=>releases.push(resolve));
  return {units:[],functions:[]};
 });
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(seen.length,4);
 releases.splice(0).forEach(release=>release());
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(seen.length,8);
 releases.splice(0).forEach(release=>release());
 const result=await extraction;
 assert.equal(result.processed_fragments,8);
 assert.deepEqual(seen,fragments.map(f=>f.fragment_id));
});
test("a fast chunk starts the next chunk without waiting for its slow peer; progress is real",async()=>{
 const fragments=Array.from({length:3},(_,i)=>({...fragment,fragment_id:`part-${i}`,text:'x'.repeat(8000)}));
 const parsed={document_id:fragment.document_id,document:fragment.document,side:fragment.side,fragments,warnings:[]};
 let unblock!:()=>void;const slow=new Promise<void>(r=>{unblock=r;});
 let active=0,max=0;const counts:number[]=[];const started:string[]=[];
 const extraction=extractDocument(parsed,undefined,async request=>{
  const id=JSON.parse(request.input).target[0].fragment_id;started.push(id);active++;max=Math.max(max,active);
  if(id==='part-1')await slow;
  if(id==='part-2')unblock();
  active--;return {units:[],functions:[]};
 },n=>counts.push(n));
 const result=await extraction;
 assert.equal(result.processed_fragments,3);assert.equal(max,2);
 assert.deepEqual(started,['part-0','part-1','part-2']);assert.deepEqual(counts,[0,1,2,3]);
});
