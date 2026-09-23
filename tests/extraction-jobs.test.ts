import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp,rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { zipSync,strToU8 } from "fflate";
import { saveDocument } from "../src/lib/server/document-store";
import { ExtractionJobs } from "../src/lib/server/extraction-jobs";
import { AiError } from "../src/lib/server/openai-json";
import type { ParsedDocument } from "../src/lib/server/document-parser";
import type { ExtractionResult } from "../src/lib/extraction";
const empty=(p:ParsedDocument):ExtractionResult=>({schema_version:"extraction-v1",document_id:p.document_id,document:p.document,side:p.side,model:"synthetic-test",created_at:"test",review_required:true,processed_fragments:p.fragments.length,rejected_items:0,warnings:[],units:[],functions:[]});
const bytes=()=>zipSync({'word/document.xml':strToU8('<document><body><p><r><t>Synthetic text</t></r></p></body></document>')});
test("background starts immediately, joins duplicate requests, reports progress and survives a new registry via cache",async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'san-jobs-'));
 let release!:()=>void;
 const gate=new Promise<void>(r=>{release=r;});let calls=0;
 const jobs=new ExtractionJobs(async(p,_s,progress)=>{calls++;progress(0,1);await gate;progress(1,1);return empty(p);});
 try {
  const doc=await saveDocument(bytes(),'synthetic.docx','before',root);
  const [a,b]=await Promise.all([jobs.start(doc.id,root),jobs.start(doc.id,root)]);
  assert.equal(calls,1);assert.ok(!a.cached && !b.cached);if(a.cached||b.cached)return;
  assert.equal(a.job,b.job);assert.equal((await jobs.status(doc.id,root)).status,'running');
  release();await a.job.promise;
  assert.equal((await jobs.status(doc.id,root)).status,'complete');
  const fresh=new ExtractionJobs(async()=>{throw new Error('must not call AI');});
  assert.equal((await fresh.start(doc.id,root)).cached,true);
 } finally {release();await rm(root,{recursive:true,force:true});}
});
test("server cancellation and failures never become completed caches and permit retries",async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'san-jobs-'));
 let fail=false;
 const jobs=new ExtractionJobs(async(p,signal)=>{
  if(fail)throw new AiError('Provider quota',429);
  await new Promise<void>((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('abort')),{once:true}));
  return empty(p);
 });
 try {
  const doc=await saveDocument(bytes(),'synthetic.docx','after',root);
  const a=await jobs.start(doc.id,root);assert.ok(!a.cached);if(a.cached)return;
  await jobs.cancel(doc.id,root);await a.job.promise;
  assert.equal((await jobs.status(doc.id,root)).status,'cancelled');
  fail=true;const b=await jobs.start(doc.id,root);assert.ok(!b.cached);if(b.cached)return;
  await b.job.promise;const status=await jobs.status(doc.id,root);
  assert.equal(status.status,'failed');assert.equal('error' in status && status.error,'Provider quota');
  assert.equal(b.job.errorStatus,429);
  assert.equal((await new ExtractionJobs().status(doc.id,root)).status,'idle');
 }finally {await rm(root,{recursive:true,force:true});}
});
test("at most two documents run; cancellation frees capacity",async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'san-jobs-'));
 const jobs=new ExtractionJobs(async(p,signal)=>{await new Promise<void>(r=>signal.addEventListener('abort',()=>r(),{once:true}));return empty(p);});
 const ids:string[]=[];
 try {
  for(let i=0;i<3;i++)ids.push((await saveDocument(bytes(),`synthetic-${i}.docx`,'before',root)).id);
  const a=await jobs.start(ids[0],root),b=await jobs.start(ids[1],root);
  await assert.rejects(jobs.start(ids[2],root),/два документа/);
  await jobs.cancel(ids[0],root);if(!a.cached)await a.job.promise;
  const c=await jobs.start(ids[2],root);assert.ok(!c.cached);
  await jobs.cancel(ids[1],root);await jobs.cancel(ids[2],root);
  if(!b.cached)await b.job.promise;if(!c.cached)await c.job.promise;
 }finally {await rm(root,{recursive:true,force:true});}
});
