import { randomUUID } from "node:crypto";
import { readFile, rename, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { DocumentError, readDocument, storageRoot } from "./document-store";
import { chunkFragments, extractDocument } from "./extraction";
import { AiError } from "./openai-json";
import type { ParsedDocument } from "./document-parser";
import type { ExtractionResult } from "../extraction";
import type { ExtractionProgress } from "../extraction-progress";

type Runner = (parsed: ParsedDocument, signal: AbortSignal, progress: (done: number, total: number) => void) => Promise<ExtractionResult>;
interface Job { state: ExtractionProgress; controller: AbortController; promise: Promise<void>; result?: ExtractionResult; errorStatus?: number; finished?: number }
/** Single-process jobs for the persistent Node server. Finished results live on disk. */
export class ExtractionJobs {
  private jobs = new Map<string, Job>();
  constructor(private runner: Runner = (parsed, signal, progress) => extractDocument(parsed, signal, undefined, progress)) {}
  private file(root: string, id: string) { return path.join(root, id, "extraction-v1.json"); }
  private async cached(root: string, id: string): Promise<ExtractionResult | null> {
    try { return JSON.parse(await readFile(this.file(root,id),"utf8")); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  }
  async status(id: string, root = storageRoot(), preferJobState = false) {
    await readDocument(id, true, root);
    const result = await this.cached(root,id);
    const job = this.jobs.get(`${root}:${id}`);
    // Polling reports the refresh job; normal reads keep the last successful result.
    if (preferJobState && job && job.state.status !== "complete") return job.state;
    if (result) return { status:"complete" as const, completed_chunks:0, total_chunks:0, result };
    return job?.state ?? {status:"idle" as const,completed_chunks:0,total_chunks:0};
  }
  async start(id: string, root = storageRoot(), refresh = false) {
    const document = await readDocument(id,true,root);
    const cached = await this.cached(root,id);
    if (cached && !refresh) return {cached:true as const,result:cached};
    const key=`${root}:${id}`;
    const existing=this.jobs.get(key);
    if(existing?.state.status === "running") return {cached:false as const,job:existing};
    for(const [k,j] of this.jobs) if(j.finished && Date.now()-j.finished>10*60_000) this.jobs.delete(k);
    if([...this.jobs.values()].filter(j=>j.state.status==="running").length>=2) throw new DocumentError("Уже обрабатываются два документа. Дождитесь завершения и повторите запуск.",429);
    const parsed=JSON.parse(document.data.toString()) as ParsedDocument;
    const total=chunkFragments(parsed.fragments).length;
    const controller=new AbortController();
    const job:Job={state:{status:"running",completed_chunks:0,total_chunks:total,started_at:new Date().toISOString()},controller,promise:Promise.resolve()};
    this.jobs.set(key,job);
    job.promise=(async()=>{
      try {
        const result=await this.runner(parsed,controller.signal,(completed_chunks,total_chunks)=>{
          job.state={...job.state,completed_chunks,total_chunks};
        });
        controller.signal.throwIfAborted();
        const file=this.file(root,id), temporary=`${file}.${randomUUID()}.tmp`;
        try { await writeFile(temporary,JSON.stringify(result)); controller.signal.throwIfAborted(); await rename(temporary,file); }
        finally { await rm(temporary,{force:true}); }
        job.result=result; job.state={...job.state,status:"complete",completed_chunks:total};
      } catch(error) {
        const cancelled=controller.signal.aborted;
        const errorText=cancelled ? "Обработка остановлена." : error instanceof AiError || error instanceof DocumentError ? error.message : "Не удалось завершить обработку документа. Повторите запуск.";
        job.errorStatus=cancelled ? 409 : error instanceof AiError || error instanceof DocumentError ? error.status : 503;
        job.state={...job.state,status:cancelled ? "cancelled" : "failed",error:errorText};
      } finally { job.finished=Date.now(); }
    })();
    return {cached:false as const,job};
  }
  async cancel(id: string, root = storageRoot()) {
    await readDocument(id,true,root);
    const job=this.jobs.get(`${root}:${id}`);
    if(job?.state.status==="running") job.controller.abort();
    return {cancel_requested:!!job && job.state.status==="running"};
  }
}
const shared=globalThis as typeof globalThis & { documentExtractionJobs?: ExtractionJobs };
export const extractionJobs=shared.documentExtractionJobs ??= new ExtractionJobs();
