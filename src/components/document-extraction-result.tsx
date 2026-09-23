"use client";
import { useState } from "react";
import type { StoredDocument } from "@/lib/documents";
import type { ExtractionResult } from "@/lib/extraction";
import { DocumentStructure } from "./document-structure";
import styles from "./document-workspace.module.css";

export function DocumentExtractionResult({ document: doc, result, functionsOnly = false }: { document: StoredDocument; result: ExtractionResult; functionsOnly?: boolean }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [page, setPage] = useState(0);
  const labels = { duty: "Обязанность", permission: "Право", prohibition: "Запрет" };
  const search = query.trim().toLocaleLowerCase("ru");
  const filtered = result.functions.filter(f => (kind === "all" || f.modality === kind) &&
    [f.action, f.object, f.unit_name, f.scope, f.conditions].filter(Boolean).join(" ").toLocaleLowerCase("ru").includes(search));
  const lastPage = Math.max(0, Math.ceil(filtered.length / 10) - 1);
  const currentPage = Math.min(page, lastPage);
  return <details className={styles.extractionResult}>
    <summary className={styles.documentSummary}>
      <b className={styles.sideBadge}>{doc.side === "before" ? "ДО" : "ПОСЛЕ"}</b>
      <strong>{doc.name.replace(/_/g, " ")}</strong>
      <span>{result.functions.length} функций и ограничений · открыть результат</span>
    </summary>
    <div className={styles.resultBody}>
      {result.rejected_items > 0 && <p className={styles.reviewNote}>Часть данных не подтверждена источниками и не включена в результат. Подробнее — в разделе «Техническая информация».</p>}
      {!functionsOnly && <DocumentStructure result={result}/>}
      <h4 className={styles.functionHeading}>Функции и ответственность</h4>
      <div className={styles.resultFilters}>
        <label>Поиск по функции или исполнителю<input type="search" value={query} placeholder="Например, аудит или контроль" onChange={e=>{setQuery(e.target.value);setPage(0);}}/></label>
        <label>Тип записи<select value={kind} onChange={e=>{setKind(e.target.value);setPage(0);}}><option value="all">Все типы</option><option value="duty">Обязанности</option><option value="permission">Права</option><option value="prohibition">Запреты</option></select></label>
      </div>
      <p className={styles.help} role="status">Найдено: {filtered.length} из {result.functions.length}</p>
      {!filtered.length && <div className={styles.resultEmpty}>{result.functions.length ? "По вашему запросу ничего не найдено. Измените поиск или тип записи." : "Функции не найдены. Проверьте содержимое исходного документа."}</div>}
      {filtered.slice(currentPage * 10, currentPage * 10 + 10).map(f => <details key={f.function_id} className={styles.function}>
        <summary><span className={styles.modality} data-kind={f.modality}>{labels[f.modality]}</span><strong>{f.action} — {f.object}</strong><span>{f.unit_name || "Исполнитель не установлен"} · показать источник</span></summary>
        {f.scope && <p><b>Область:</b> {f.scope}</p>}{f.conditions && <p><b>Условия:</b> {f.conditions}</p>}
        {f.evidence.map((source,i)=><blockquote key={i}>{source.quote}<cite>{source.document.replace(/_/g," ")} · {source.location.format === "docx" ? `абзац ${source.location.paragraph}` : source.location.format === "pdf" ? `стр. ${source.location.page}` : `лист ${source.location.sheet}, ${source.location.cells}`}{"section" in source.location && source.location.section ? ` · пункт ${source.location.section}` : ""}</cite></blockquote>)}
      </details>)}
      {filtered.length > 10 && <nav className={styles.pagination} aria-label={`Страницы функций ${doc.name}`}><button disabled={currentPage === 0} onClick={()=>setPage(currentPage-1)}>Назад</button><span>Страница {currentPage+1} из {lastPage+1}</span><button disabled={currentPage === lastPage} onClick={()=>setPage(currentPage+1)}>Далее</button></nav>}
      <details className={styles.technical}><summary>Техническая информация</summary><p>Модель: {result.model} · обработано фрагментов: {result.processed_fragments} · не включено записей: {result.rejected_items}</p>{result.warnings.map((w,i)=><p key={i}>{w}</p>)}<div className={styles.links}><a href={`/api/documents/${doc.id}`}>Исходный документ</a><a href={`/api/documents/${doc.id}/extract?download=1`}>Данные JSON</a></div></details>
    </div>
  </details>;
}
