"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, LoaderCircle, CheckCircle2 } from "lucide-react";
import type { StoredDocument } from "@/lib/documents";
import type { ExtractionResult } from "@/lib/extraction";
import { DocumentExtractionResult } from "./document-extraction-result";
import styles from "./document-workspace.module.css";

export function ExtractionPanel({ documents, loading }: { documents: StoredDocument[]; loading: boolean }) {
  const [chosen, setChosen] = useState<string[] | null>(null);
  const [results, setResults] = useState<Record<string, ExtractionResult>>({});
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null);
  const resultArea = useRef<HTMLDivElement | null>(null);
  const ids = chosen ?? (["before", "after"] as const).flatMap((side) => {
    const doc = documents.find((d) => d.side === side && d.status === "parsed");
    return doc ? [doc.id] : [];
  });
  const selected = documents.filter((d) => ids.includes(d.id));
  const hasBoth = selected.some((d) => d.side === "before") && selected.some((d) => d.side === "after");
  const ready = hasBoth && selected.every((d) => d.status === "parsed");
  const complete = ready && selected.every((d) => results[d.id]);
  useEffect(() => {
    const controller = new AbortController();
    for (const doc of documents.filter((d) => d.status === "parsed")) {
      fetch(`/api/documents/${doc.id}/extract`, { signal: controller.signal })
        .then(async (r) => r.ok ? r.json() : null)
        .then((body) => { if (body && !controller.signal.aborted) setResults((old) => ({ ...old, [doc.id]: body.result })); })
        .catch(() => {});
    }
    return () => controller.abort();
  }, [documents]);
  useEffect(() => () => abort.current?.abort(), []);

  async function run() {
    if (!ready || running) return;
    setChosen([...ids]); setRunning(true); setError("");
    const controller = new AbortController(); abort.current = controller;
    try {
      for (let i = 0; i < selected.length; i++) {
        const doc = selected[i];
        setStage(`Извлекаем подразделения и функции: ${i + 1} из ${selected.length} — ${doc.name}`);
        const response = await fetch(`/api/documents/${doc.id}/extract`, {
          method: "POST", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(310000)]),
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Извлечение не удалось.");
        setResults((old) => ({ ...old, [doc.id]: body.result }));
      }
      setStage("Готово. Проверьте извлечённые функции и источники ниже.");
      resultArea.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
      setError(controller.signal.aborted ? "Обработка остановлена. Готовые результаты сохранены." : e instanceof Error && !["TimeoutError", "TypeError", "SyntaxError"].includes(e.name) ? e.message : "Сервер недоступен или не ответил вовремя. Обновите страницу перед повторным запуском.");
      setStage("");
    } finally { setRunning(false); abort.current = null; }
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
    {documents.length > 0 && <details className={styles.selection}><summary>Выбрано файлов: {selected.length}. Изменить выбор</summary><p>По умолчанию выбрана последняя обработанная загрузка каждой стороны. Исключите повторные копии.</p>{documents.map((d) => <label key={d.id}><input type="checkbox" checked={ids.includes(d.id)} disabled={running} onChange={(e) => setChosen(e.target.checked ? [...ids, d.id] : ids.filter((id) => id !== d.id))}/><span><b>{d.side === "before" ? "ДО" : "ПОСЛЕ"}</b> · {d.name} · {new Date(d.created_at).toLocaleTimeString("ru-RU")}{d.status !== "parsed" && " — текст недоступен"}</span></label>)}</details>}
    {!ready && !loading && <p className={styles.help}>Для запуска выберите хотя бы один обработанный DOCX, PDF или XLSX в каждом комплекте. Файлы с ошибкой чтения нужно исключить из выбора.</p>}
    <p className={styles.help}>При запуске текст выбранных документов отправляется в OpenAI. Обработка может занять несколько минут. Сохранённые результаты используются повторно.</p>
    {running && <div className={styles.processing} role="status"><LoaderCircle size={18} className="spin"/><span>{stage}</span><button onClick={() => abort.current?.abort()}>Остановить</button></div>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    <div ref={resultArea} data-onboarding="results">
      {selected.some((d) => results[d.id]) && <>
        <div className={styles.resultHeader}><h3><CheckCircle2 size={18}/> Результаты обработки</h3>{complete && <button className={styles.secondary} onClick={download}>Скачать результаты</button>}</div>
        <p className={styles.help}>Функции извлечены из документов и требуют проверки. Сравнение ДО/ПОСЛЕ ещё не выполнено.</p>
        {selected.filter((d) => results[d.id]).map(doc => <DocumentExtractionResult key={doc.id} document={doc} result={results[doc.id]}/>)}
      </>}
    </div>
  </section>;
}
