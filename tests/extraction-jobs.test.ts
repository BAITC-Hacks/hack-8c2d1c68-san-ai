import { zipSync, strToU8 } from "fflate";
import type { ParsedDocument } from "../src/lib/server/document-parser";
import type { ExtractionResult } from "../src/lib/extraction";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ExtractionJobs, extractionJobs } from "../src/lib/server/extraction-jobs";
import { saveDocument } from "../src/lib/server/document-store";
import { AiError } from "../src/lib/server/openai-json";
import { POST } from "../src/app/api/documents/[id]/extract/route";
import { comparisonFixture } from "./helpers/comparison-fixtures";

test("refresh replaces cache only on success and concurrent refreshes share a job", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "extraction-refresh-"));
  const fixture = comparisonFixture("before");
  const updated = { ...fixture.extraction, created_at: "2026-09-23T01:00:00Z" };
  const gate = Promise.withResolvers<void>();
  let calls = 0;
  const jobs = new ExtractionJobs(async (_parsed, _signal, progress) => {
    calls++;
    progress(0, 1);
    await gate.promise;
    return updated;
  });
  try {
    const doc = await saveDocument(fixture.bytes, fixture.extraction.document, "before", root);
    const file = path.join(root, doc.id, "extraction-v1.json");
    await writeFile(file, JSON.stringify(fixture.extraction));
    assert.equal((await jobs.start(doc.id, root)).cached, true);
    assert.equal(calls, 0);
    const started = await jobs.start(doc.id, root, true);
    assert.equal(started.cached, false);
    if (started.cached) throw new Error("refresh returned stale cache");
    const concurrent = await jobs.start(doc.id, root, true);
    assert.equal(concurrent.cached, false);
    if (concurrent.cached) throw new Error("refresh returned stale cache");
    assert.equal(concurrent.job, started.job);
    assert.equal(calls, 1);
    assert.equal((await jobs.status(doc.id, root, true)).status, "running");
    const saved = await jobs.status(doc.id, root);
    assert.ok("result" in saved);
    assert.deepEqual(saved.result, fixture.extraction);
    gate.resolve();
    await started.job.promise;
    assert.deepEqual(JSON.parse(await readFile(file, "utf8")), updated);
    assert.equal((await jobs.status(doc.id, root, true)).status, "complete");
  } finally { gate.resolve(); await rm(root, { recursive: true, force: true }); }
});

test("failed or cancelled refresh retains the previous successful result", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "extraction-preserve-"));
  const fixture = comparisonFixture("before");
  try {
    const doc = await saveDocument(fixture.bytes, fixture.extraction.document, "before", root);
    const file = path.join(root, doc.id, "extraction-v1.json");
    await writeFile(file, JSON.stringify(fixture.extraction));
    for (const outcome of ["failed", "cancelled"] as const) {
      const jobs = new ExtractionJobs(async (_parsed, signal) => {
        if (outcome === "failed") throw new AiError("Synthetic provider failure");
        await new Promise<void>(resolve => signal.addEventListener("abort", () => resolve(), { once: true }));
        return { ...fixture.extraction, created_at: "must-not-be-saved" };
      });
      const started = await jobs.start(doc.id, root, true);
      if (started.cached) throw new Error("refresh returned stale cache");
      if (outcome === "cancelled") assert.equal((await jobs.cancel(doc.id, root)).cancel_requested, true);
      await started.job.promise;
      assert.equal((await jobs.status(doc.id, root, true)).status, outcome);
      assert.deepEqual(JSON.parse(await readFile(file, "utf8")), fixture.extraction);
      assert.equal((await jobs.start(doc.id, root)).cached, true);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("synchronous request cancellation reaches the job while background requests return 202", async t => {
  const state = { status: "running" as const, completed_chunks: 0, total_chunks: 1 };
  const controller = new AbortController();
  const job = { state, controller, promise: new Promise<void>(resolve => {
    controller.signal.addEventListener("abort", () => resolve(), { once: true });
  }), errorStatus: 409 };
  const entered = Promise.withResolvers<void>();
  t.mock.method(extractionJobs, "status", async () => state);
  const start = t.mock.method(extractionJobs, "start", async () => {
    entered.resolve();
    return { cached: false as const, job };
  });
  const context = { params: Promise.resolve({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }) };
  const requestController = new AbortController();
  const response = POST(new Request("http://localhost/extract?refresh=1", {
    method: "POST", signal: requestController.signal,
  }), context);
  await entered.promise;
  requestController.abort();
  assert.equal((await response).status, 409);
  assert.equal(controller.signal.aborted, true);
  assert.equal(start.mock.calls[0].arguments[2], true);

  const backgroundController = new AbortController();
  t.mock.method(extractionJobs, "start", async () => ({ cached: false as const,
    job: { state, controller: backgroundController, promise: Promise.resolve() },
  }));
  const backgroundRequest = new AbortController();
  const background = await POST(new Request("http://localhost/extract?background=1&refresh=1", {
    method: "POST", signal: backgroundRequest.signal,
  }), context);
  assert.equal(background.status, 202);
  backgroundRequest.abort();
  assert.equal(backgroundController.signal.aborted, false);
});

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
