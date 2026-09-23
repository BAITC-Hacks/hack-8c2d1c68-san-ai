import type { ExtractionResult } from "./extraction";
import type { ExtractionProgress } from "./extraction-progress";
export type ExtractionStatus = ExtractionProgress & { result?: ExtractionResult; cached?: boolean };
export async function extractionRequest(id: string, method: "GET" | "POST" | "DELETE", signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<ExtractionStatus> {
  const suffix=method==="POST" ? "?background=1" : method==="GET" ? "?status=1" : "";
  const response=await fetcher(`/api/documents/${id}/extract${suffix}`,{method,signal:AbortSignal.any([signal,AbortSignal.timeout(15000)]),cache:"no-store"});
  let body: ExtractionStatus;
  try {body=await response.json();} catch {throw new Error("Сервер не вернул статус обработки. Обновите страницу: задача может продолжаться на сервере.");}
  if(!response.ok) throw new Error(body.error || "Не удалось получить статус обработки.");
  return body;
}
export async function watchExtraction(id: string, initial: ExtractionStatus, signal: AbortSignal, onProgress: (state: ExtractionProgress)=>void, options: {fetcher?:typeof fetch;intervalMs?:number;timeoutMs?:number}={}): Promise<ExtractionResult> {
  let state=initial;
  const deadline=Date.now()+(options.timeoutMs??330000);
  while(true) {
    signal.throwIfAborted();
    if(state.result) {onProgress({...state,status:"complete"});return state.result;}
    onProgress(state);
    if(state.status==="failed" || state.status==="cancelled") throw new Error(state.error || "Обработка остановлена.");
    if(state.status!=="running") throw new Error("Обработка не запущена или сервер перезапустился. Повторите запуск; готовые результаты сохранены.");
    if(Date.now()>deadline) throw new Error("Не удалось дождаться результата. Обновите страницу для проверки статуса.");
    await new Promise<void>((resolve,reject)=>{
      const stop=()=>{clearTimeout(timer);reject(new DOMException("Aborted","AbortError"));};
      const timer=setTimeout(()=>{signal.removeEventListener("abort",stop);resolve();},options.intervalMs??1500);
      signal.addEventListener("abort",stop,{once:true});
      if(signal.aborted) stop();
    });
    state=await extractionRequest(id,"GET",signal,options.fetcher);
  }
}
