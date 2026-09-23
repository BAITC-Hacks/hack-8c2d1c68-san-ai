import { test } from "node:test";
import assert from "node:assert/strict";
import { watchExtraction,extractionRequest } from "../src/lib/extraction-client";
import type { ExtractionResult } from "../src/lib/extraction";
const result:ExtractionResult={schema_version:"extraction-v1",document_id:"test",document:"synthetic",side:"before",model:"synthetic",created_at:"",review_required:true,processed_fragments:1,rejected_items:0,warnings:[],units:[],functions:[]};
test("polling reports progress and fetches the completed result without restarting AI",async()=>{
 let requests=0;const values:number[]=[];
 const fetcher:typeof fetch=async(url,options)=>{
  assert.match(String(url),/status=1/);assert.equal(options?.method,"GET");requests++;
  return Response.json(requests===1 ? {status:'running',completed_chunks:1,total_chunks:2} : {status:'complete',result});
 };
 const got=await watchExtraction('id',{status:'running',completed_chunks:0,total_chunks:2},new AbortController().signal,s=>values.push(s.completed_chunks),{intervalMs:1,fetcher});
 assert.deepEqual(got,result);assert.equal(requests,2);assert.deepEqual(values.slice(0,2),[0,1]);
});
test("failed, restarted and cancelled jobs terminate polling with actionable messages",async()=>{
 for(const status of ['failed','idle','cancelled'] as const)await assert.rejects(watchExtraction('id',{status,completed_chunks:0,total_chunks:1,error:'Stopped'},new AbortController().signal,()=>{},{}));
 const controller=new AbortController();controller.abort();
 await assert.rejects(watchExtraction('id',{status:'running',completed_chunks:0,total_chunks:1},controller.signal,()=>{}),{name:'AbortError'});
});
test("proxy HTML and HTTP failures are not mistaken for successful extraction",async()=>{
 await assert.rejects(extractionRequest('id','POST',new AbortController().signal,async()=>new Response('<html>Gateway timeout</html>',{status:504})),/статус обработки/);
 await assert.rejects(extractionRequest('id','POST',new AbortController().signal,async()=>Response.json({error:'Busy'},{status:429})),/Busy/);
});
