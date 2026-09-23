"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, LoaderCircle, CheckCircle2 } from "lucide-react";
import type { StoredDocument } from "@/lib/documents";
import type { ExtractionResult } from "@/lib/extraction";
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
    <div className={styles.steps}><span>1. Прикрепите документы</span><ArrowRight size={14}/><strong>2. Извлеките функции</strong><ArrowRight size={14}/><span>3. Проверьте результат</span></div>
    <div className={styles.actionHeading}><div><h2>{documents.length ? "Документы загружены. Что дальше?" : "Начните с документов ДО и ПОСЛЕ"}</h2><p>Выберите нужные файлы и запустите извлечение подразделений и функций.</p></div><button className={styles.runButton} disabled={!ready || loading || running} onClick={() => void run()}>{running ? <LoaderCircle className="spin" size={17}/> : <ArrowRight size={17}/>} {running ? "Обработка…" : complete ? "Открыть сохранённое извлечение" : "Подготовить к сравнению"}</button></div>
    {documents.length > 0 && <details className={styles.selection}><summary>Выбрано файлов: {selected.length}. Изменить выбор</summary><p>По умолчанию выбрана последняя обработанная загрузка каждой стороны. Исключите повторные копии.</p>{documents.map((d) => <label key={d.id}><input type="checkbox" checked={ids.includes(d.id)} disabled={running} onChange={(e) => setChosen(e.target.checked ? [...ids, d.id] : ids.filter((id) => id !== d.id))}/><span><b>{d.side === "before" ? "ДО" : "ПОСЛЕ"}</b> · {d.name} · {new Date(d.created_at).toLocaleTimeString("ru-RU")}{d.status !== "parsed" && " — текст недоступен"}</span></label>)}</details>}
    {!ready && !loading && <p className={styles.help}>Для запуска выберите хотя бы один обработанный DOCX в каждом комплекте. PDF/XLSX и файлы с ошибкой чтения нужно исключить из выбора.</p>}
    <p className={styles.help}>При запуске текст выбранных документов отправляется в OpenAI. Обработка может занять несколько минут. Сохранённые результаты используются повторно.</p>
    {running && <div className={styles.processing} role="status"><LoaderCircle size={18} className="spin"/><span>{stage}</span><button onClick={() => abort.current?.abort()}>Остановить</button></div>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    <div ref={resultArea}>
      {selected.some((d) => results[d.id]) && <>
        <div className={styles.resultHeader}><h3><CheckCircle2 size={18}/> Извлечённые данные</h3>{complete && <button className={styles.secondary} onClick={download}>Скачать ДО/ПОСЛЕ для сравнения</button>}</div>
        <p className={styles.help}>Это результат извлечения, ещё не заключение об изменениях. Модуль сравнения не подключён. Проверьте назначение функций, ограничения и полноту данных.</p>
        {selected.filter((d) => results[d.id]).map((doc) => {
          const result = results[doc.id];
          return <details key={doc.id} className={styles.extractionResult}>
            <summary><b>{doc.side === "before" ? "ДО" : "ПОСЛЕ"}</b> · {doc.name}<span>Упоминаний подразделений и ролей: {result.units.length} · Функций и ограничений: {result.functions.length}{result.rejected_items > 0 ? ` · Отклонено записей: ${result.rejected_items}` : ""}</span></summary>
            <p>{result.model} · обработано абзацев: {result.processed_fragments} · отклонено записей: {result.rejected_items}</p>
            {result.warnings.map((w) => <p className={styles.help} key={w}>{w}</p>)}
            <h4>Упоминания подразделений и ролей</h4><p className={styles.help}>Названия и сокращения ещё не объединены. Должности могут быть представлены отдельно от подразделений.</p>
            {!result.units.length && <p>Подразделения не извлечены. Это не означает, что их нет в документе.</p>}
            <ul>{result.units.map((u) => <li key={u.unit_id}>{u.unit_name}{u.parent_unit && ` → ${u.parent_unit}`}</li>)}</ul>
            <h4>Функции и ограничения</h4>
            {!result.functions.length && <p>Функции не извлечены. Проверьте исходный документ.</p>}
            {result.functions.map((f) => <details className={styles.function} key={f.function_id}><summary>{f.modality === "prohibition" ? "Запрет: " : f.modality === "permission" ? "Право: " : ""}{f.action} — {f.object}<span>{f.unit_name || "Исполнитель не установлен"}</span></summary>
              {f.scope && <p>Область: {f.scope}</p>}{f.conditions && <p>Условия: {f.conditions}</p>}
              {f.evidence.map((source, i) => <blockquote key={i}>{source.quote}<cite>{source.document} · {source.fragment_id}{"section" in source.location && source.location.section ? ` · пункт ${source.location.section}` : ""}</cite></blockquote>)}
            </details>)}
            <a href={`/api/documents/${doc.id}/extract?download=1`}>Скачать извлечение JSON</a>
          </details>;
        })}
      </>}
    </div>
  </section>;
}
