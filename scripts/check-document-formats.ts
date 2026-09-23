import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { pdfFixture, xlsxFixture } from "../tests/helpers/document-fixtures";

async function main() {
 const root=await mkdtemp(path.join(tmpdir(),"san-format-http-"));
 const server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port","3011"],{env:{...process.env,DOCUMENT_STORAGE_DIR:root},stdio:"ignore"});
 let failed=false; server.on("error",()=>{failed=true;});
 const origin="http://127.0.0.1:3011";
 try {
  let ready=false;
  for(let n=0;n<40;n++) {
   if(failed || server.exitCode!==null) throw new Error("Не удалось запустить тестовый сервер на 3011.");
   try { const r=await fetch(origin+"/api/documents",{signal:AbortSignal.timeout(1000)}); if(r.ok){ready=true;break;} } catch {}
   await pause(250);
  }
  assert.ok(ready,"Тестовый сервер не ответил.");
  const uploaded: string[]=[];
  for(const [name,bytes,count] of [["synthetic.pdf",pdfFixture(),2],["synthetic.xlsx",xlsxFixture(),3]] as const) {
   const response=await fetch(`${origin}/api/documents?side=before&name=${name}`,{method:"POST",headers:{Origin:origin,"Content-Type":"application/octet-stream"},body:Buffer.from(bytes),signal:AbortSignal.timeout(35000)});
   assert.equal(response.status,201);
   const {document}=await response.json(); uploaded.push(document.id); assert.equal(document.status,"parsed"); assert.equal(document.fragment_count,count);
   const parsed=await fetch(`${origin}/api/documents/${document.id}?view=parsed`); assert.equal(parsed.status,200);
   const body=await parsed.json(); assert.equal(body.fragments.length,count);
   const original=await fetch(`${origin}/api/documents/${document.id}`);
   assert.deepEqual(Buffer.from(await original.arrayBuffer()),Buffer.from(bytes));
   console.log(`${name}: upload → parse → sources → original OK`);
  }
  if(process.argv.includes("--ai")) {
   const began=Date.now();
   const starts=await Promise.all(uploaded.map(async id=>{
    const response=await fetch(`${origin}/api/documents/${id}/extract?background=1`,{method:"POST",headers:{Origin:origin},signal:AbortSignal.timeout(15000)});
    assert.equal(response.status,202);
    const body=await response.json();assert.equal(body.status,"running");return body;
   }));
   console.log(`Synthetic AI: ${starts.length} background jobs accepted in ${Date.now()-began} ms. UI: ${origin}`);
   let pending=[...uploaded];
   while(pending.length && Date.now()-began<330000) {
    await pause(1500);
    const done:string[]=[];
    for(const id of pending) {
     const response=await fetch(`${origin}/api/documents/${id}/extract?status=1`,{signal:AbortSignal.timeout(15000)});
     assert.equal(response.status,200);const state=await response.json();
     if(state.status==="complete") {assert.ok(state.result.functions.length);done.push(id);}
     else assert.equal(state.status,"running",state.error || "Background job stopped");
    }
    pending=pending.filter(id=>!done.includes(id));
   }
   assert.equal(pending.length,0);
   for(const id of uploaded) {
    const response=await fetch(`${origin}/api/documents/${id}/extract?background=1`,{method:"POST",headers:{Origin:origin},signal:AbortSignal.timeout(15000)});
    assert.equal(response.status,200);assert.equal((await response.json()).cached,true);
   }
   console.log(`Synthetic AI: two jobs completed, cache verified, ${Math.round((Date.now()-began)/1000)} s total.`);
  }
 } finally {
  if(server.exitCode===null) {server.kill("SIGTERM");await Promise.race([new Promise<void>(resolve=>server.once("exit",()=>resolve())),pause(3000)]);if(server.exitCode===null)server.kill("SIGKILL");}
  await rm(root,{recursive:true,force:true});
 }
}
main().catch(()=>{console.error("Проверка форматов не прошла. Выполните npm run build и освободите порт 3011.");process.exitCode=1;});
