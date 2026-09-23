"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Download, LoaderCircle } from "lucide-react";
import { findingLabels, ownerName, type ComparisonResult, type FindingType } from "@/lib/comparison";
import type { CanonicalOrganization } from "@/lib/canonical-organization";
import styles from "./comparison-panel.module.css";

const groupLabels = { preserved: "Сохранено", transformed: "Преобразовано / переименовано", created: "Возможно создано", unmatched: "Не найдено ПОСЛЕ", needs_review: "Требует проверки" };
const riskLabels = { low: "Низкий", medium: "Средний", high: "Высокий" };
const responsibilityLabels = { execution: "Исполнение", oversight: "Контроль", approval: "Согласование", consulting: "Консультирование", other: "Другая ответственность" };
const types = Object.keys(findingLabels) as FindingType[];

function Evidence({ refs, result }: { refs: string[]; result: ComparisonResult }) {
  const sources = [...result.before.sources, ...result.after.sources].filter(s => refs.includes(s.source_id));
  return <details className={styles.evidence}><summary>Источники · {sources.length}</summary>
    {sources.map(source => {
      const location = source.location;
      const address = location.format === "pdf" ? `стр. ${location.page}` : location.format === "xlsx" ? `${location.sheet}!${location.cells}` : `абзац ${location.paragraph}${location.section ? ` · пункт ${location.section}` : ""}`;
      const document = result.document_links.find(d => d.document_id === source.document_id && d.side === source.side);
      return <figure key={source.source_id}><figcaption><b>{source.side === "before" ? "ДО" : "ПОСЛЕ"}</b> · {source.document_name} · {address}</figcaption><blockquote>{source.quote}</blockquote>
        <details><summary>Полный фрагмент</summary><p className={styles.sourceText}>{source.text}</p></details>
        {document && <a href={`/api/documents/${document.storage_id}`}>Скачать исходный документ</a>}
      </figure>;
    })}
  </details>;
}
function FunctionText({ organization, id }: { organization: CanonicalOrganization; id: string }) {
  const fn = organization.functions.find(f => f.function_id === id);
  if (!fn) return null;
  return <div className={styles.functionText}><strong>{ownerName(organization, fn.owner_id)}</strong><p>{fn.canonical_text}</p><small>{responsibilityLabels[fn.responsibility_type]}</small></div>;
}

export function ComparisonPanel({ beforeIds, afterIds, onBusy }: { beforeIds: string[]; afterIds: string[]; onBusy: (busy: boolean) => void }) {
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<FindingType | "all">("all");
  const [tab, setTab] = useState<"findings" | "functions" | "units">("findings");
  const abort = useRef<AbortController | null>(null);
  const query = [...beforeIds.map(id => `before=${encodeURIComponent(id)}`), ...afterIds.map(id => `after=${encodeURIComponent(id)}`)].join("&");
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/comparisons?${query}`, { signal: controller.signal, cache: "no-store" })
      .then(async r => {
        const body = await r.json();
        if (controller.signal.aborted) return;
        if (r.ok) setResult(body.result);
        else if (r.status !== 404) setError(body.error || "Не удалось открыть сравнение.");
      }).catch(() => { if (!controller.signal.aborted) setError("Не удалось проверить сохранённое сравнение. Повторите попытку."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); abort.current?.abort(); };
  }, [query]);
  async function run() {
    if (running) return;
    setError(""); setRunning(true); onBusy(true);
    const controller = new AbortController(); abort.current = controller;
    try {
      const response = await fetch(`/api/comparisons${result ? "?refresh=1" : ""}`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ before_ids: beforeIds, after_ids: afterIds }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(610000)]) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Сравнение не удалось.");
      setResult(body.result);
    } catch (error) {
      setError(controller.signal.aborted ? "Сравнение остановлено. Частичный результат не используется." : error instanceof Error && !["TypeError", "SyntaxError", "TimeoutError"].includes(error.name) ? error.message : "Сервер недоступен или время ожидания истекло. Повторите попытку.");
    } finally { setRunning(false); onBusy(false); abort.current = null; }
  }
  const visible = result?.findings.filter(f => filter === "all" || f.type === filter).sort((a, b) => ({ high: 0, medium: 1, low: 2 })[a.risk] - ({ high: 0, medium: 1, low: 2 })[b.risk]) ?? [];
  return <section className={styles.panel} aria-label="Сравнение ДО и ПОСЛЕ">
    <div className={styles.heading}><div><span className={styles.eyebrow}>ШАГ 3 · СРАВНЕНИЕ</span><h2>{result ? "Что изменилось в организации" : "Сопоставьте структуру и функции"}</h2><p>{result ? "Изменения и потенциальные риски с обоснованием из выбранных документов." : "Найдите сохранённые и переданные функции, возможные потери, дублирование и конфликты."}</p></div>
      {!result && <button className={styles.primary} disabled={running || loading} onClick={() => void run()}>{running || loading ? <LoaderCircle size={17} className="spin"/> : <ArrowRight size={17}/>} {loading ? "Проверяем результат…" : running ? "Сравниваем…" : "Сравнить ДО и ПОСЛЕ"}</button>}
      {result && <a className={styles.download} href={`/api/comparisons?${query}&download=1`}><Download size={16}/>Скачать сравнение</a>}
      {result && !result.analysis_complete && !result.identical_sources && <button className={styles.primary} disabled={running} onClick={() => void run()}>Повторить неполный анализ</button>}
    </div>
    {!result && <p className={styles.muted}>Извлечённые факты и цитаты выбранных документов будут отправлены в OpenAI. Сравнение может занять несколько минут.</p>}
    {running && <div className={styles.processing} role="status"><LoaderCircle size={18} className="spin"/><span>Сопоставляем владельцев и функции, затем проверяем риски. Дождитесь завершения всех этапов.</span><button onClick={() => abort.current?.abort()}>Остановить</button></div>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {result && <>
      {result.identical_sources && <div className={styles.notice}><strong>ДО и ПОСЛЕ — одинаковые файлы</strong><p>{result.conclusion}</p></div>}
      {!result.analysis_complete && !result.identical_sources && <div className={styles.notice}><strong>Анализ частичный — есть строки для проверки</strong><p>Проверенные соответствия сохранены. Некорректные ссылки модели не использованы для выводов; возможные потери не оценивались.</p></div>}
      <div className={styles.notice}><strong>Требует проверки ответственным сотрудником</strong><p>ПОСЛЕ — предложенное состояние. Выводы и рекомендации не изменяют текущую организацию. Уверенность — оценка модели, не вероятность.</p></div>
      <div className={styles.stats}>{types.map(type => <button key={type} aria-pressed={filter === type && tab === "findings"} onClick={() => { setFilter(filter === type ? "all" : type); setTab("findings"); }}><span>{findingLabels[type]}</span><strong>{(type === "lost" && !result.absence_assessable || result.identical_sources && type !== "preserved") ? "—" : result.findings.filter(f => f.type === type).length}</strong>{type === "lost" && !result.absence_assessable && <small>Недостаточно данных</small>}</button>)}</div>
      <details className={styles.warnings}><summary>Ограничения и полнота данных · {result.warnings.length}</summary><ul>{result.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></details>
      <nav className={styles.tabs} aria-label="Разделы сравнения">{([["findings", "Выводы и риски"], ["functions", "Таблица функций"], ["units", "Подразделения и должности"]] as const).map(([value, label]) => <button key={value} aria-pressed={tab === value} onClick={() => setTab(value)}>{label}</button>)}</nav>
      {tab === "findings" && <>
        <div className={styles.filter}><label>Показать <select value={filter} onChange={e => setFilter(e.target.value as typeof filter)}><option value="all">Все выводы</option>{types.map(type => <option key={type} value={type}>{findingLabels[type]}</option>)}</select></label><span>{visible.length} выводов</span></div>
        {!visible.length && <p className={styles.empty}>По этому фильтру обоснованных выводов нет. Проверьте таблицу соответствий и ограничения анализа.</p>}
        {visible.map(f => <article key={f.finding_id} className={styles.finding}>
          <div className={styles.findingHead}><span className={styles.badge} data-risk={f.risk}>{findingLabels[f.type]}</span><span>Риск: {riskLabels[f.risk]} · Уверенность: {Math.round(f.confidence * 100)}%</span></div>
          <h3>{f.summary}</h3><p>{f.reason}</p>
          <div className={styles.sides}><div><h4>ДО</h4>{f.before_entity_ids.length ? f.before_entity_ids.map(id => <FunctionText key={id} organization={result.before} id={id}/>) : <p className={styles.muted}>Риск выявлен в назначениях ПОСЛЕ; новизна риска не установлена.</p>}</div><div><h4>ПОСЛЕ</h4>{f.after_entity_ids.length ? f.after_entity_ids.map(id => <FunctionText key={id} organization={result.after} id={id}/>) : <p className={styles.muted}>Надёжное соответствие в выбранном комплекте не найдено.</p>}</div></div>
          <Evidence refs={f.evidence_refs} result={result}/>
          {result.recommendations.filter(r => r.finding_ids.includes(f.finding_id)).map(r => <div className={styles.recommendation} key={r.recommendation_id}><strong>Рекомендация · предложена</strong><p>{r.summary}</p></div>)}
        </article>)}
      </>}
      {tab === "functions" && <div className={styles.tableWrap}><table><caption>Все функции ДО и их соответствия; частичное совпадение требует проверки.</caption><thead><tr><th>ДО</th><th>ПОСЛЕ</th><th>Результат и источники</th></tr></thead><tbody>{result.matches.map(m => <tr key={m.match_id}><td><FunctionText organization={result.before} id={m.before_id}/></td><td>{m.after_id ? <FunctionText organization={result.after} id={m.after_id}/> : "Соответствие не найдено"}</td><td><strong>{m.status === "matched" ? "Сопоставлено" : m.status === "not_found" ? "Возможная потеря" : "Требует проверки"}</strong><p>{m.reason}</p><small>Уверенность: {Math.round(m.confidence * 100)}%</small><Evidence refs={m.evidence_refs} result={result}/></td></tr>)}</tbody></table>
        {result.unmatched_after_ids.length > 0 && <details className={styles.warnings}><summary>ПОСЛЕ без надёжного соответствия ДО · {result.unmatched_after_ids.length}</summary><p>Это могут быть новые или изменённые функции, либо пробелы извлечения.</p>{result.unmatched_after_ids.map(id => <div key={id}><FunctionText organization={result.after} id={id}/><Evidence refs={result.after.functions.find(f => f.function_id === id)!.source_refs} result={result}/></div>)}</details>}
      </div>}
      {tab === "units" && <div className={styles.tableWrap}><table><caption>Сопоставление владельцев. Создание и преобразование требуют подтверждения документами.</caption><thead><tr><th>ДО</th><th>ПОСЛЕ</th><th>Изменение</th></tr></thead><tbody>{result.owner_groups.map(g => <tr key={g.group_id}><td>{g.before_ids.map(id => ownerName(result.before, id)).join(" / ") || "Не найдено"}</td><td>{g.after_ids.map(id => ownerName(result.after, id)).join(" / ") || "Не найдено"}</td><td><strong>{groupLabels[g.status]}</strong><p>{g.entity_type === "unit" ? "Подразделение" : "Должность"} · Уверенность: {Math.round(g.confidence * 100)}%</p><p>{g.reason}</p><Evidence refs={g.evidence_refs} result={result}/></td></tr>)}</tbody></table></div>}
      <div className={styles.conclusion}><h3>Аналитическое заключение</h3><p>{result.conclusion}</p><small>{new Date(result.created_at).toLocaleString("ru-RU")} · {result.model}</small></div>
    </>}
  </section>;
}
