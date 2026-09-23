"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, LoaderCircle, CheckCircle2 } from "lucide-react";
import type { StoredDocument } from "@/lib/documents";
import { extractionRequest, watchExtraction } from "@/lib/extraction-client";
import type { ExtractionProgress } from "@/lib/extraction-progress";
import type { ExtractionResult } from "@/lib/extraction";
import { DocumentExtractionResult } from "./document-extraction-result";
import { ComparisonPanel } from "./comparison-panel";
import styles from "./document-workspace.module.css";

export function ExtractionPanel({ documents, loading }: { documents: StoredDocument[]; loading: boolean }) {
  const [chosen, setChosen] = useState<string[] | null>(null);
  const [results, setResults] = useState<Record<string, ExtractionResult>>({});
  const [comparing, setComparing] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [progress, setProgress] = useState<Record<string, ExtractionProgress>>({});
  const [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null);
  const stopRequested = useRef(false);
  const resultArea = useRef<HTMLDivElement | null>(null);
  const ids = chosen ?? (["before", "after"] as const).flatMap((side) => {
    const doc = documents.find((d) => d.side === side && d.status === "parsed");
    return doc ? [doc.id] : [];
  });
  const selected = documents.filter((d) => ids.includes(d.id));
  const hasBoth = selected.some((d) => d.side === "before") && selected.some((d) => d.side === "after");
  const ready = hasBoth && selected.every((d) => d.status === "parsed");
  const complete = ready && selected.every((d) => results[d.id]);
  const legacy = selected.some(d => results[d.id]?.units.some(u => !u.entity_type));
  const comparisonKey = selected.map(d => `${d.id}:${results[d.id]?.created_at ?? ""}`).sort().join("|");
  const running = launching || selected.some(d => progress[d.id]?.status === "running");
  useEffect(() => {
    const controller = new AbortController();
    for (const doc of documents.filter(d => d.status === "parsed")) {
      const update = (state: ExtractionProgress) => {
        if (!controller.signal.aborted) setProgress(old=>({...old,[doc.id]:state}));
      };
      void extractionRequest(doc.id,"GET",controller.signal).then(async state=>{
        update(state);
        if(state.result) return state.result;
        if(state.status==="running") return watchExtraction(doc.id,state,controller.signal,update);
      }).then(result=>{if(result && !controller.signal.aborted) setResults(old=>old[doc.id] && old[doc.id].created_at > result.created_at ? old : ({...old,[doc.id]:result}));})
        .catch((e:unknown)=>{if(!controller.signal.aborted) update({status:"failed",completed_chunks:0,total_chunks:0,error:e instanceof Error && !["TypeError","TimeoutError"].includes(e.name) ? e.message : "Не удалось получить статус. Обновите страницу перед повторным запуском."});});
    }
    return () => controller.abort();
  }, [documents]);
  useEffect(() => () => abort.current?.abort(), []);

  async function run(refresh = false) {
    if (!ready || running || comparing) return;
    stopRequested.current=false;
    setChosen([...ids]); setLaunching(true); setError("");
    const controller = new AbortController(); abort.current = controller;
    const pending=selected.filter(d=>refresh || !results[d.id]);
    let next=0;
    const failures:string[]=[];
    const worker=async()=>{
      while(next<pending.length && !controller.signal.aborted && !stopRequested.current) {
        const doc=pending[next++];
        const update=(state:ExtractionProgress)=>{if(!controller.signal.aborted)setProgress(old=>({...old,[doc.id]:state}));};
        update({status:"running",completed_chunks:0,total_chunks:0});
        try {
          const started=await extractionRequest(doc.id,"POST",controller.signal,undefined,refresh);
          if(stopRequested.current && !started.result) await extractionRequest(doc.id,"DELETE",controller.signal);
          const result=await watchExtraction(doc.id,started,controller.signal,update);
          if(!controller.signal.aborted) setResults(old=>old[doc.id] && old[doc.id].created_at > result.created_at ? old : ({...old,[doc.id]:result}));
        } catch(e) {
          if(controller.signal.aborted) return;
          const message=e instanceof Error && !["TimeoutError","TypeError"].includes(e.name) ? e.message : "Связь с сервером прервалась. Обновите страницу: обработка может продолжаться.";
          failures.push(`${doc.name}: ${message}`);
          update({status:"failed",completed_chunks:0,total_chunks:0,error:message});
        }
      }
    };
    try {
      await Promise.all(Array.from({length:Math.min(2,pending.length)},worker));
      if(!controller.signal.aborted) {
        setError(failures.join("\n"));
        if(!failures.length) resultArea.current?.scrollIntoView({behavior:"smooth",block:"start"});
      }
    } finally {if(!controller.signal.aborted) setLaunching(false);abort.current=null;}
  }
  async function stop() {
    // Explicit cancellation reaches the server; navigating away only stops polling.
    stopRequested.current=true;
    const active=selected.filter(d=>progress[d.id]?.status==="running");
    const responses=await Promise.allSettled(active.map(d=>extractionRequest(d.id,"DELETE",AbortSignal.timeout(15000))));
    if(responses.some(r=>r.status==="rejected")) setError("Не удалось подтвердить остановку. Обновите страницу для проверки статуса.");
  }
  function download() {
    const bundle = { schema_version: "extraction-bundle-v1", comparison_performed: false,
      before: selected.filter((d) => d.side === "before").map((d) => results[d.id]),
      after: selected.filter((d) => d.side === "after").map((d) => results[d.id]) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "before-after-extraction.json"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className={styles.analysis} aria-label="Подготовка к сравнению">
    <div className={styles.actionHeading} data-onboarding="process"><div><h2>{documents.length ? complete ? "Результаты готовы к просмотру" : "Документы готовы к обработке" : "Начните с документов ДО и ПОСЛЕ"}</h2><p>{complete ? "Откройте функции и проверьте их по исходным документам." : "Выберите документы ДО и ПОСЛЕ, затем извлеките функции."}</p></div><button className={styles.runButton} disabled={!ready || loading || running} onClick={() => complete ? resultArea.current?.scrollIntoView({ behavior: "smooth", block: "start" }) : void run()}>{running ? <LoaderCircle className="spin" size={17}/> : <ArrowRight size={17}/>} {running ? "Обработка…" : complete ? "Посмотреть результаты" : "Подготовить к сравнению"}</button></div>
    {documents.length > 0 && <details className={styles.selection}><summary>Выбрано файлов: {selected.length}. Изменить выбор</summary><p>По умолчанию выбрана последняя обработанная загрузка каждой стороны. Исключите повторные копии.</p>{documents.map((d) => <label key={d.id}><input type="checkbox" checked={ids.includes(d.id)} disabled={running || comparing} onChange={(e) => setChosen(e.target.checked ? [...ids, d.id] : ids.filter((id) => id !== d.id))}/><span><b>{d.side === "before" ? "ДО" : "ПОСЛЕ"}</b> · {d.name} · {new Date(d.created_at).toLocaleTimeString("ru-RU")}{d.status !== "parsed" && " — текст недоступен"}</span></label>)}</details>}
    {!ready && !loading && <p className={styles.help}>Для запуска выберите хотя бы один обработанный DOCX, PDF или XLSX в каждом комплекте. Файлы с ошибкой чтения нужно исключить из выбора.</p>}
    <p className={styles.help}>При запуске текст выбранных документов отправляется в OpenAI. Обработка может занять несколько минут. Сохранённые результаты используются повторно.</p>
    {running && <div className={styles.processing} role="status"><LoaderCircle size={18} className="spin"/><span>Обработка идёт на сервере. Страницу можно обновлять.</span><button onClick={() => void stop()}>Остановить</button></div>}
    {selected.some(d=>progress[d.id] && progress[d.id].status!=="idle" && progress[d.id].status!=="complete") && <ul className={styles.jobProgress}>{selected.filter(d=>progress[d.id] && progress[d.id].status!=="idle").map(doc=>{
      const state=progress[doc.id];
      return <li key={doc.id}><b>{doc.side==="before" ? "ДО" : "ПОСЛЕ"}</b><span>{doc.name.replace(/_/g," ")}</span><small>{state.status==="complete" ? "Готово" : state.status==="running" ? state.total_chunks ? `Обработано частей: ${state.completed_chunks} из ${state.total_chunks}` : "Запуск…" : state.error || "Не завершено"}</small>{state.status==="running" && <progress aria-label={`Обработка ${doc.name}`} max={state.total_chunks || 1} value={state.total_chunks ? state.completed_chunks : undefined}/>}</li>;
    })}</ul>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {complete && <div className={styles.resultHeader}><p className={styles.help}>{legacy ? "В старом извлечении не различаются подразделения и должности. Обновите его перед сравнением." : "Если извлечение неполное, его можно выполнить заново. Это повторно отправит выбранные документы в OpenAI."}</p><button className={styles.secondary} disabled={running || comparing} onClick={() => void run(true)}>Обновить извлечение</button></div>}
    {complete && !running && !legacy && <ComparisonPanel key={comparisonKey} beforeIds={selected.filter(d => d.side === "before").map(d => d.id)} afterIds={selected.filter(d => d.side === "after").map(d => d.id)} onBusy={busy => { if (busy) setChosen([...ids]); setComparing(busy); }}/>}
    <div ref={resultArea} data-onboarding="results">
      {selected.some((d) => results[d.id]) && <>
        <div className={styles.resultHeader}><h3><CheckCircle2 size={18}/> Результаты обработки</h3>{complete && <button className={styles.secondary} onClick={download}>Скачать результаты</button>}</div>
        <p className={styles.help}>Извлечённые факты служат входом для сравнения выше. Проверьте назначение функций, ограничения и полноту данных.</p>
        {selected.filter((d) => results[d.id]).map(doc => <DocumentExtractionResult key={doc.id} document={doc} result={results[doc.id]}/>)}
      </>}
    </div>
  </section>;
}
