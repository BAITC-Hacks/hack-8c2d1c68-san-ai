"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, Check, CheckCircle2, LoaderCircle, ArrowRight, ArrowLeft, AlertTriangle, FileText, Plus, X, LockKeyhole } from "lucide-react";
import { MAX_UPLOAD_BYTES, type DocumentSide, type StoredDocument } from "@/lib/documents";
import { extractionRequest, watchExtraction } from "@/lib/extraction-client";
import type { ExtractionProgress } from "@/lib/extraction-progress";
import type { ExtractionResult } from "@/lib/extraction";
import type { ComparisonResult } from "@/lib/comparison";
import { bundleKey, bundleReady, extractionKey } from "@/lib/analysis-flow";
import { DocumentOnboarding } from "./document-onboarding";
import { DocumentStructure } from "./document-structure";
import { DocumentExtractionResult } from "./document-extraction-result";
import { ComparisonPanel } from "./comparison-panel";
import styles from "./document-workspace.module.css";

const sessionKey = "san-ai-analysis-v1";
const sides = ["before", "after"] as const;
const sideLabel = { before: "До изменений", after: "После изменений" };
const sizeLabel = (size: number) => size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} КБ` : `${(size / 1024 / 1024).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} МБ`;

export function DocumentWorkspace() {
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [ids, setIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [uploading, setUploading] = useState<DocumentSide | null>(null);
  const [building, setBuilding] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [results, setResults] = useState<Record<string, ExtractionResult>>({});
  const [progress, setProgress] = useState<Record<string, ExtractionProgress>>({});
  const [builtKey, setBuiltKey] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [comparison, setComparison] = useState<{ key: string; result: ComparisonResult } | null>(null);
  const actionLock = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const replacementId = useRef<string | null>(null);
  const uploadInputs = useRef<Partial<Record<DocumentSide, HTMLInputElement | null>>>({});
  const selected = documents.filter(d => ids.includes(d.id));
  const selectionKey = bundleKey(selected);
  const ready = bundleReady(selected);
  const structuresReady = !dirty && builtKey === selectionKey && ready && selected.every(d => results[d.id]);
  const resultKey = `${selectionKey}::${extractionKey(selected, results)}`;
  const currentComparison = structuresReady && comparison?.key === resultKey ? comparison.result : null;
  const busy = !!uploading || building || comparing;
  const selectedKey = [...ids].sort().join("|");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/documents", { cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error();
      const body = await response.json();
      setDocuments(body.documents); setError("");
    } catch { setError("Не удалось загрузить документы. Проверьте соединение и нажмите «Повторить»."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(sessionKey) || "null");
      if (saved && Array.isArray(saved.ids)) {
        setIds(saved.ids.filter((id: unknown) => typeof id === "string"));
        setBuiltKey(typeof saved.builtKey === "string" ? saved.builtKey : null);
        setDirty(saved.dirty === true);
      }
    } catch { /* A new browser session starts with empty bundles. */ }
    void refresh();
    }, 0);
    return () => { clearTimeout(timer); abort.current?.abort(); };
  }, [refresh]);
  useEffect(() => {
    if (!loading) {
      try { localStorage.setItem(sessionKey, JSON.stringify({ ids, builtKey, dirty })); } catch { /* In-memory navigation remains available. */ }
    }
  }, [ids, builtKey, dirty, loading]);
  useEffect(() => {
    if (!selectedKey) return;
    const controller = new AbortController();
    for (const id of selectedKey.split("|")) {
      const update = (state: ExtractionProgress) => { if (!controller.signal.aborted) setProgress(old => ({ ...old, [id]: state })); };
      void extractionRequest(id, "GET", controller.signal).then(async state => {
        update(state);
        return state.status === "running" ? watchExtraction(id, state, controller.signal, update) : state.result;
      }).then(result => {
        if (result && !controller.signal.aborted) setResults(old => old[id]?.created_at > result.created_at ? old : ({ ...old, [id]: result }));
      }).catch(() => { /* Explicit build provides a retry and a user-facing error. */ });
    }
    return () => controller.abort();
  }, [selectedKey]);
  function navigate(next: number) {
    setStep(next); setError("");
    requestAnimationFrame(() => { heading.current?.focus({ preventScroll: true }); heading.current?.closest("main")?.scrollTo({ top: 0 }); });
  }
  function changeSelection(next: string[]) {
    if (builtKey !== null) setDirty(true);
    setIds(next); setError(""); setNotice("");
  }
  async function upload(files: FileList | File[], side: DocumentSide) {
    if (actionLock.current || busy) return;
    actionLock.current = true; setUploading(side); setError(""); setNotice("");
    const failures: string[] = [];
    for (const file of Array.from(files)) {
      if (!/\.(docx|pdf|xlsx)$/i.test(file.name) || !file.size || file.size > MAX_UPLOAD_BYTES) {
        failures.push(`${file.name}: выберите непустой DOCX, PDF или XLSX до 10 МБ.`); continue;
      }
      setNotice(`Добавляем ${file.name}…`);
      try {
        const response = await fetch(`/api/documents?${new URLSearchParams({ side, name: file.name })}`, {
          method: "POST", body: file, headers: { "Content-Type": "application/octet-stream" }, signal: AbortSignal.timeout(45000),
        });
        const body = await response.json();
        if (!response.ok) throw new Error();
        setDocuments(old => [body.document, ...old]);
        const replacedId = replacementId.current;
        setIds(old => [...old.filter(id => body.document.status === "parsed" ? id !== replacedId : true), body.document.id]);
        replacementId.current = null;
        if (builtKey !== null) setDirty(true);
        if (body.document.status !== "parsed") failures.push(`${file.name}: файл сохранён, но текст не удалось прочитать. Замените его файлом с доступным текстом.`);
      } catch { failures.push(`${file.name}: не удалось подтвердить загрузку. Проверьте соединение; сохранённый файл можно добавить из списка ниже.`); }
    }
    setNotice(""); setError(failures.join("\n")); setUploading(null); actionLock.current = false;
  }
  async function build() {
    if (!ready || actionLock.current) return;
    actionLock.current = true; setBuilding(true); setError(""); setComparison(null);
    const controller = new AbortController(); abort.current = controller;
    const snapshot = [...selected];
    const failures: string[] = [];
    let next = 0;
    const worker = async () => {
      while (next < snapshot.length && !controller.signal.aborted) {
        const doc = snapshot[next++];
        const update = (state: ExtractionProgress) => { if (!controller.signal.aborted) setProgress(old => ({ ...old, [doc.id]: state })); };
        try {
          update({ status: "running", completed_chunks: 0, total_chunks: 0 });
          const legacy = results[doc.id]?.units.some(u => !u.entity_type) ?? false;
          const started = await extractionRequest(doc.id, "POST", controller.signal, undefined, legacy);
          const result = await watchExtraction(doc.id, started, controller.signal, update);
          if (!controller.signal.aborted) setResults(old => ({ ...old, [doc.id]: result }));
        } catch {
          if (controller.signal.aborted) return;
          failures.push(doc.name);
          update({ status: "failed", completed_chunks: 0, total_chunks: 0 });
        }
      }
    };
    try {
      await Promise.all(Array.from({ length: Math.min(2, snapshot.length) }, worker));
      if (controller.signal.aborted) return;
      if (failures.length) setError(`Не удалось обработать: ${failures.join(", ")}. Файлы сохранены. Нажмите «Повторить» или замените файл. Если связь прервалась, анализ может продолжаться на сервере.`);
      else { setBuiltKey(bundleKey(snapshot)); setDirty(false); navigate(2); }
    } finally { setBuilding(false); actionLock.current = false; abort.current = null; }
  }
  async function compare(force = false) {
    if (!structuresReady || actionLock.current) return;
    if (currentComparison && !force) { navigate(3); return; }
    actionLock.current = true; setComparing(true); setError("");
    const controller = new AbortController(); abort.current = controller;
    const beforeIds = selected.filter(d => d.side === "before").map(d => d.id);
    const afterIds = selected.filter(d => d.side === "after").map(d => d.id);
    try {
      const response = await fetch(`/api/comparisons${force ? "?refresh=1" : ""}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ before_ids: beforeIds, after_ids: afterIds }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(610000)]),
      });
      const body = await response.json();
      if (!response.ok) {
        // The API sanitizes expected input errors. Never surface provider details.
        const inputError = [400, 422].includes(response.status) && typeof body.error === "string" ? body.error : "Не удалось завершить сравнение. Проверьте соединение и повторите анализ.";
        throw new Error(inputError);
      }
      if (!controller.signal.aborted) { setComparison({ key: resultKey, result: body.result }); navigate(3); }
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error && !["TypeError", "TimeoutError", "SyntaxError"].includes(e.name) ? e.message : "Не удалось дождаться результата. Повторите анализ; готовое сравнение сохранится на сервере.");
    } finally { setComparing(false); actionLock.current = false; abort.current = null; }
  }

  return <main className={styles.main}>
    <nav className={styles.stepper} aria-label="Этапы анализа">{["Документы", "Структуры", "Результаты"].map((label, index) => {
      const number = index + 1;
      const available = number === 1 || (number === 2 ? structuresReady : !!currentComparison);
      const completed = number === 1 ? structuresReady : number === 2 ? !!currentComparison : false;
      return <button key={label} aria-current={step === number ? "step" : undefined} disabled={!available || busy} data-completed={completed} onClick={() => navigate(number)}><span>{completed ? <Check size={16}/> : !available ? <LockKeyhole size={14}/> : number}</span><b>{label}</b>{completed && <small>Готово</small>}</button>;
    })}</nav>
    <div className={styles.content}>
      <div className={styles.heading}><div><div className={styles.eyebrow}>АНАЛИЗ ОРГАНИЗАЦИОННЫХ ИЗМЕНЕНИЙ</div><h1 ref={heading} tabIndex={-1}>{step === 1 ? "Сравнение организационных документов" : step === 2 ? "Структуры ДО и ПОСЛЕ" : "Результаты анализа"}</h1><p>{step === 1 ? "Загрузите документы до и после реорганизации. SAN.AI восстановит структуру, найдёт изменения функций и подготовит рекомендации." : step === 2 ? "Проверьте, правильно ли SAN.AI восстановил организацию из документов." : "Изменения, подтверждающие источники и рекомендации по выбранному комплекту."}</p></div><DocumentOnboarding/></div>
      {error && <div className={styles.error} role="alert"><AlertTriangle size={19}/><div><strong>{step === 1 ? "Документы требуют внимания" : "Не удалось завершить анализ"}</strong><p>{error}</p><button className={styles.secondary} disabled={busy} onClick={() => void (step > 1 ? compare(true) : ready ? build() : refresh())}>Повторить</button></div></div>}
      {step === 1 && <>
        {dirty && <div className={styles.warning} role="status"><AlertTriangle size={20}/><div><strong>Документы изменились</strong><p>Чтобы результаты учитывали новый комплект, заново постройте структуры.</p></div></div>}
        <p className={styles.intro}>Добавьте действующие документы и новую редакцию. В каждом комплекте может быть несколько файлов.</p>
        <div className={styles.columns}>{sides.map((side, index) => {
          const items = selected.filter(d => d.side === side);
          const stored = documents.filter(d => d.side === side && !ids.includes(d.id));
          return <section key={side} data-onboarding={side} className={styles.card} aria-label={`Документы ${side === "before" ? "ДО" : "ПОСЛЕ"}`}>
            <div className={styles.cardHeading}><span className={styles.number}>0{index + 1}</span><div><h2>{sideLabel[side]}</h2><p>{side === "before" ? "Действующие положения, оргструктура и документы, описывающие текущие функции." : "Новая редакция или предлагаемая структура после реорганизации."}</p></div></div>
            <div className={styles.drop} data-busy={busy} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (!busy) void upload(e.dataTransfer.files, side); }}>
              <Upload size={25}/><strong>Перетащите документы сюда</strong><span>или выберите их на компьютере</span>
              <label className={styles.choose}>{uploading === side ? "Добавляем документы…" : "Добавить документы"}<input ref={el => { uploadInputs.current[side] = el; }} aria-label={`Добавить документы ${side === "before" ? "ДО" : "ПОСЛЕ"}`} type="file" accept=".docx,.pdf,.xlsx" multiple disabled={busy || loading} onChange={e => { if (e.target.files) void upload(e.target.files, side); e.target.value = ""; }}/></label><small>DOCX, PDF, XLSX · до 10 МБ</small>
            </div>
            {loading ? <p className={styles.empty}>Загружаем документы…</p> : !items.length ? <p className={styles.empty}>{side === "before" ? "Добавьте действующие документы организации." : "Добавьте документы после изменений."}</p> : <ul className={styles.list}>{items.map(doc => <li key={doc.id}>
              <div className={styles.fileTop}><span className={styles.format}>{doc.format.toUpperCase()}</span><div><strong>{doc.name}</strong><small>{sizeLabel(doc.size)}</small><span className={doc.status === "parsed" ? styles.state : styles.parseError}>{doc.status === "parsed" ? <><CheckCircle2 size={13}/> Готов</> : <><AlertTriangle size={13}/> Текст не удалось прочитать</>}</span></div></div>
              <div className={styles.fileActions}><a href={`/api/documents/${doc.id}`} aria-label={`Скачать ${doc.name}`}>Исходный файл</a>{doc.status !== "parsed" && <button disabled={busy} onClick={() => { replacementId.current = doc.id; const input = uploadInputs.current[side]; input?.addEventListener("cancel", () => { replacementId.current = null; }, { once: true }); input?.click(); }}>Заменить файл</button>}<button disabled={busy} onClick={() => changeSelection(ids.filter(id => id !== doc.id))} aria-label={`Убрать из анализа ${doc.name}`}><X size={13}/>Убрать из анализа</button></div>
            </li>)}</ul>}
            {!!items.length && <button className={styles.addMore} disabled={busy} onClick={() => uploadInputs.current[side]?.click()}><Plus size={16}/>Добавить ещё документ</button>}
            {!!stored.length && <details className={styles.library}><summary>Добавить из сохранённых документов</summary>{stored.map(doc => <div key={doc.id}><FileText size={15}/><span>{doc.name}<small>{sizeLabel(doc.size)} · {new Date(doc.created_at).toLocaleString("ru-RU")}</small></span><button disabled={busy} onClick={() => changeSelection([...ids, doc.id])} aria-label={`Добавить в анализ ${doc.name}`}>Добавить</button></div>)}</details>}
          </section>;
        })}</div>
        <div role="status" aria-live="polite">{notice && <p className={styles.help}><LoaderCircle size={15} className="spin"/> {notice}</p>}</div>
        {building && <div className={styles.processing} role="status" aria-live="polite"><LoaderCircle className="spin" size={23}/><div><h3>Анализируем документы</h3><p>Определяем структуру и функции обеих версий.</p><div className={styles.sideProgress}>{sides.map(side => <span key={side}>{sideLabel[side]}<b>{selected.filter(d => d.side === side).every(d => progress[d.id]?.status === "complete") ? "Готово" : "Анализируем…"}</b></span>)}</div><small>Анализ продолжается на сервере. Результат сохранится после завершения.</small></div></div>}
        <div className={styles.actionArea} data-onboarding="process"><div><p>Определим подразделения, должности, функции и связи в обеих версиях.</p><small>Для анализа содержимое выбранных документов обрабатывается AI-сервисом.</small>{!ready && !loading && <p className={styles.help}>Нужен минимум один документ с доступным текстом в каждом комплекте.</p>}</div><button className={styles.runButton} disabled={!ready || busy || loading} onClick={() => structuresReady ? navigate(2) : void build()}>{building ? <LoaderCircle className="spin" size={18}/> : <ArrowRight size={18}/>}{building ? "Анализируем документы…" : dirty ? "Обновить структуры" : "Построить структуры"}</button></div>
      </>}
      {step === 2 && structuresReady && <>
        <div className={styles.columns}>{sides.map(side => <section key={side} className={styles.structureCard} aria-label={`Структура ${side === "before" ? "ДО" : "ПОСЛЕ"}`}><div className={styles.structureTitle}><span className={styles.sideBadge}>{side === "before" ? "ДО" : "ПОСЛЕ"}</span><h2>Структура {side === "before" ? "ДО" : "ПОСЛЕ"}</h2><small>{side === "before" ? "Текущее состояние" : "Предлагаемое состояние"}</small></div>{selected.filter(d => d.side === side).map(doc => <div key={doc.id}><p className={styles.sourceName}><FileText size={14}/>{doc.name}</p><DocumentStructure result={results[doc.id]}/></div>)}</section>)}</div>
        <details className={styles.secondaryDetails}><summary>Функции подразделений</summary>{selected.map(doc => <DocumentExtractionResult key={doc.id} document={doc} result={results[doc.id]} functionsOnly/>)}</details>
        {comparing && <div className={styles.processing} role="status" aria-live="polite"><LoaderCircle className="spin" size={23}/><div><h3>Сравниваем документы…</h3><p>Проверяем изменения подразделений и функций.</p></div></div>}
        <div className={styles.actionArea}><button className={styles.secondary} disabled={busy} onClick={() => navigate(1)}><ArrowLeft size={16}/>Изменить документы</button><button className={styles.runButton} disabled={busy} onClick={() => void compare()}>{comparing ? <LoaderCircle className="spin" size={18}/> : <ArrowRight size={18}/>}Сравнить ДО и ПОСЛЕ</button></div>
      </>}
      {step === 3 && currentComparison && <><ComparisonPanel result={currentComparison} running={comparing} onRetry={() => void compare(true)}/><div className={styles.actionArea}><button className={styles.secondary} disabled={busy} onClick={() => navigate(2)}><ArrowLeft size={16}/>Вернуться к структурам</button></div></>}
      <footer className={styles.footer}>SAN.AI · Выводы и рекомендации требуют проверки ответственным сотрудником.</footer>
    </div>
  </main>;
}
