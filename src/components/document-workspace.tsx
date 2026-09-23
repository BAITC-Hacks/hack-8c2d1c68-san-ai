"use client";
import { useCallback, useEffect, useState } from "react";
import { Upload, CheckCircle2, LoaderCircle, RefreshCw } from "lucide-react";
import { MAX_UPLOAD_BYTES, type DocumentSide, type StoredDocument } from "@/lib/documents";
import styles from "./document-workspace.module.css";
import { DocumentOnboarding } from "./document-onboarding";
import { ExtractionPanel } from "./extraction-panel";

export function DocumentWorkspace() {
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<DocumentSide | null>(null);
  const [progress, setProgress] = useState("");
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/documents", { cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error("Не удалось загрузить список документов.");
      setDocuments((await response.json()).documents); setError("");
    } catch { setError("Хранилище недоступно. Проверьте соединение и повторите попытку."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    fetch("/api/documents", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Хранилище недоступно.");
        const result = await response.json();
        if (active) setDocuments(result.documents);
      })
      .catch(() => { if (active) setError("Хранилище недоступно. Повторите попытку."); })
      .finally(() => { clearTimeout(timer); if (active) setLoading(false); });
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, []);

  async function upload(files: FileList | File[], side: DocumentSide) {
    if (busy) return;
    setBusy(side); setError(""); setNotice("");
    let saved = 0;
    const failures: string[] = [];
    for (const file of Array.from(files)) {
      setProgress(`Сохраняем ${file.name}…`);
      if (!/\.(docx|pdf|xlsx)$/i.test(file.name) || !file.size || file.size > MAX_UPLOAD_BYTES) {
        failures.push(`${file.name}: нужен непустой DOCX, PDF или XLSX до 10 МиБ.`); continue;
      }
      try {
        const response = await fetch(`/api/documents?${new URLSearchParams({ side, name: file.name })}`, {
          method: "POST", body: file, headers: { "Content-Type": "application/octet-stream" }, signal: AbortSignal.timeout(45000),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Не удалось сохранить файл.");
        setDocuments((current) => [result.document, ...current]); saved++;
        if (result.document.status === "parse_error") failures.push(`${file.name}: файл сохранён, но текст не извлечён. ${result.document.warnings.join(" ")}`);
      } catch (e) {
        failures.push(`${file.name}: ${e instanceof Error && e.name !== "TimeoutError" ? e.message : "Нет ответа сервера. Обновите список перед повторной загрузкой."}`);
      }
    }
    setBusy(null); setProgress("");
    if (saved) setNotice(`Сохранено файлов: ${saved}. Они доступны после перезапуска приложения.`);
    if (failures.length) setError(failures.join("\n"));
  }
  return <main className={styles.main}>
      <div className={styles.heading}><div><div className={styles.eyebrow}>ИСТОЧНИКИ АНАЛИЗА</div><h1>Документы до и после<span>.</span></h1><p>Соберите два комплекта для сравнения структуры и функций.</p></div><div className={styles.headingActions}><DocumentOnboarding/><button className={styles.secondary} onClick={() => { setLoading(true); void refresh(); }} disabled={loading || !!busy}><RefreshCw size={16}/>Обновить</button></div></div>
      {error && <div className={styles.error} role="alert">{error}</div>}
      <div role="status" aria-live="polite">{notice && <p className={styles.success}><CheckCircle2 size={17}/>{notice}</p>}{busy && <p className={styles.success}><LoaderCircle className="spin" size={17}/>{progress}</p>}</div>
      <div className={styles.columns}>{(["before", "after"] as const).map((side, index) => {
        const items = documents.filter((d) => d.side === side);
        return <section key={side} data-onboarding={side} className={styles.card} aria-label={side === "before" ? "Документы ДО" : "Документы ПОСЛЕ"}>
          <div className={styles.cardHeading}><span className={styles.number}>0{index + 1}</span><div><h2>{side === "before" ? "До изменений" : "После изменений"}</h2><p>{side === "before" ? "Исходная структура и действующие функции" : "Новая редакция структуры и функций"}</p></div><span className={styles.count}>{items.length}</span></div>
          <div className={styles.drop} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (!busy) void upload(e.dataTransfer.files, side); }}>
            <Upload size={26}/><strong>Перетащите документы сюда</strong><span>или выберите файлы на компьютере</span>
            <label className={styles.choose}>{busy === side ? "Загрузка…" : "Прикрепить документы"}<input aria-label={side === "before" ? "Прикрепить документы ДО" : "Прикрепить документы ПОСЛЕ"} type="file" accept=".docx,.pdf,.xlsx" multiple disabled={!!busy} onChange={(e) => { if (e.target.files) void upload(e.target.files, side); e.target.value = ""; }}/></label>
            <small>DOCX, PDF, XLSX · до 10 МиБ на файл</small>
          </div>
          {loading ? <p className={styles.empty}>Загружаем список…</p> : !items.length ? <p className={styles.empty}>Здесь пока нет документов.<br/>Прикрепите первый файл этого комплекта.</p> : null}
        </section>;
      })}</div>
      <ExtractionPanel documents={documents} loading={loading || !!busy}/>
      <footer className={styles.footer}>Файлы прикреплены к общему рабочему пространству. Сохранение документов не означает завершение анализа.</footer>
  </main>;
}
