"use client";
import { useState } from "react";
import { AlertTriangle, Lightbulb, LoaderCircle } from "lucide-react";
import { ownerName, type ComparisonResult, type FindingType } from "@/lib/comparison";
import type { CanonicalOrganization } from "@/lib/canonical-organization";
import { createdUnitCount, findingCount } from "@/lib/analysis-flow";
import styles from "./comparison-panel.module.css";

const findingLabels: Record<FindingType, string> = { preserved: "Сохранено", transferred: "Передано", lost: "Возможно потеряно", duplicated: "Дублирование", conflict: "Потенциальный конфликт" };
const groupLabels = { preserved: "Сохранено", transformed: "Преобразовано / переименовано", created: "Возможно создано", unmatched: "Не найдено ПОСЛЕ", needs_review: "Требует проверки" };
const riskLabels = { low: "Низкий", medium: "Средний", high: "Высокий" };
const responsibilityLabels = { execution: "Исполнение", oversight: "Контроль", approval: "Согласование", consulting: "Консультирование", other: "Другая ответственность" };
const types = Object.keys(findingLabels) as FindingType[];

function Evidence({ refs, result, label = "Показать источник", reason, confidence }: { refs: string[]; result: ComparisonResult; label?: string; reason?: string; confidence?: number }) {
  const sources = [...result.before.sources, ...result.after.sources].filter(s => refs.includes(s.source_id));
  return <details className={styles.evidence}><summary>{label}</summary>
    {(["before", "after"] as const).map(side => <section key={side}><h4>{side === "before" ? "ДО" : "ПОСЛЕ"}</h4>{sources.filter(s => s.side === side).map(source => {
      const location = source.location;
      const address = location.format === "pdf" ? `стр. ${location.page}` : location.format === "xlsx" ? `${location.sheet}!${location.cells}` : `абзац ${location.paragraph}${location.section ? ` · пункт ${location.section}` : ""}`;
      const document = result.document_links.find(d => d.document_id === source.document_id && d.side === source.side);
      return <figure key={source.source_id}><figcaption>{source.document_name} · {address}</figcaption><blockquote>{source.quote}</blockquote><details><summary>Полный фрагмент</summary><p className={styles.sourceText}>{source.text}</p></details>{document && <a href={`/api/documents/${document.storage_id}`}>Скачать исходный документ</a>}</figure>;
    })}{!sources.some(s => s.side === side) && <p className={styles.muted}>Подтверждающий фрагмент для этой стороны не найден. Отсутствие цитаты само по себе не доказывает потерю функции.</p>}</section>)}
    {reason && <div><h4>Вывод системы</h4><p>{reason}</p></div>}{confidence !== undefined && <small className={styles.muted}>Уверенность сопоставления: {Math.round(confidence * 100)}% · оценка модели, не вероятность.</small>}
  </details>;
}
function FunctionText({ organization, id, compact = false }: { organization: CanonicalOrganization; id: string; compact?: boolean }) {
  const fn = organization.functions.find(f => f.function_id === id);
  if (!fn) return null;
  return <div className={styles.functionText}><strong>{ownerName(organization, fn.owner_id)}</strong>{!compact && <><p>{fn.canonical_text}</p><small>{responsibilityLabels[fn.responsibility_type]}</small></>}</div>;
}

export function ComparisonPanel({ result, running, onRetry }: { result: ComparisonResult; running: boolean; onRetry: () => void }) {
  const [filter, setFilter] = useState<FindingType | "all">("all");
  const [tab, setTab] = useState<"changes" | "recommendations">("changes");
  const [detail, setDetail] = useState<"findings" | "functions" | "units">("findings");
  const visible = result.findings.filter(f => filter === "all" || f.type === filter).sort((a, b) => ({ high: 0, medium: 1, low: 2 })[a.risk] - ({ high: 0, medium: 1, low: 2 })[b.risk]);
  const query = result.document_links.map(d => `${d.side}=${encodeURIComponent(d.storage_id)}`).join("&");
  const metrics = [{ label: "Новые подразделения", value: createdUnitCount(result), type: null }, ...(["transferred", "lost", "duplicated", "conflict"] as const).map(type => ({ label: { transferred: "Переданные функции", lost: "Возможно потерянные функции", duplicated: "Дублирование", conflict: "Потенциальные конфликты" }[type], value: findingCount(result, type), type }))];
  return <section className={styles.panel} data-onboarding="results" aria-label="Результаты анализа">
    <nav className={styles.mainTabs} aria-label="Разделы результатов"><button aria-pressed={tab === "changes"} onClick={() => setTab("changes")}>Изменения</button><button aria-pressed={tab === "recommendations"} onClick={() => setTab("recommendations")}>Рекомендации <span>{result.recommendations.length}</span></button></nav>
    {result.identical_sources && <div className={styles.notice}><AlertTriangle size={20}/><div><strong>ДО и ПОСЛЕ — одинаковые файлы</strong><p>{result.conclusion}</p></div></div>}
    {!result.analysis_complete && !result.identical_sources && <div className={styles.notice} role="status"><AlertTriangle size={20}/><div><strong>Анализ требует уточнения</strong><p>Некоторые источники не удалось надёжно сопоставить. Проверенные выводы сохранены, но потенциальные потери могут быть определены не полностью.</p><button className={styles.secondary} disabled={running} onClick={onRetry}>Повторить анализ</button><p className={styles.muted}>Вы можете изучить проверенные выводы ниже.</p></div></div>}
    {running && <div className={styles.processing} role="status" aria-live="polite"><LoaderCircle className="spin" size={19}/><div><strong>Сравниваем документы…</strong><p>Проверяем изменения подразделений и функций.</p></div></div>}
    <p className={styles.advisory}>ПОСЛЕ — предлагаемое состояние. Выводы и рекомендации требуют проверки и не изменяют текущую организацию.</p>
    {tab === "changes" && <>
      <div className={styles.stats}>{metrics.map(metric => <button key={metric.label} onClick={() => { setDetail(metric.type ? "findings" : "units"); setFilter(metric.type || "all"); }}><strong data-unknown={metric.value === null}>{metric.value ?? "Требует проверки"}</strong><span>{metric.label}</span>{!metric.type && metric.value !== null && <small>По предоставленным документам</small>}</button>)}</div>
      <nav className={styles.tabs} aria-label="Подробности изменений">{([["findings", "Ключевые изменения"], ["functions", "Детали сравнения"], ["units", "Подразделения"]] as const).map(([value, label]) => <button key={value} aria-pressed={detail === value} onClick={() => setDetail(value)}>{label}</button>)}</nav>
      {detail === "findings" && <>
        <div className={styles.filter}><label>Тип изменения <select value={filter} onChange={e => setFilter(e.target.value as typeof filter)}><option value="all">Все изменения</option>{types.map(type => <option key={type} value={type}>{findingLabels[type]}</option>)}</select></label></div>
        {!visible.length && <p className={styles.empty}>Подтверждённых выводов по этому фильтру нет. Откройте «Детали сравнения», чтобы проверить соответствия и строки, требующие уточнения.</p>}
        {visible.map(f => <article key={f.finding_id} className={styles.finding}><div className={styles.findingHead}><span className={styles.badge} data-risk={f.risk}>{findingLabels[f.type]}</span><span>Риск: {riskLabels[f.risk]}</span></div><h3>{f.summary}</h3><p>{f.reason}</p>
          <div className={styles.sides}><div><h4>ДО</h4>{f.before_entity_ids.length ? f.before_entity_ids.map(id => <FunctionText key={id} organization={result.before} id={id} compact/>) : <p className={styles.muted}>Новизна риска не установлена.</p>}</div><div><h4>ПОСЛЕ</h4>{f.after_entity_ids.length ? f.after_entity_ids.map(id => <FunctionText key={id} organization={result.after} id={id} compact/>) : <p className={styles.muted}>Надёжное соответствие не найдено.</p>}</div></div>
          <Evidence refs={f.evidence_refs} result={result} label="Почему система так решила" reason={f.reason} confidence={f.confidence}/>
        </article>)}
      </>}
      {detail === "functions" && <div className={styles.tableWrap}><table><caption>Все функции ДО и их соответствия; частичное совпадение требует проверки.</caption><thead><tr><th>ДО</th><th>ПОСЛЕ</th><th>Результат и источники</th></tr></thead><tbody>{result.matches.map(m => <tr key={m.match_id}><td><FunctionText organization={result.before} id={m.before_id}/></td><td>{m.after_id ? <FunctionText organization={result.after} id={m.after_id}/> : "Соответствие не найдено"}</td><td><strong>{m.status === "matched" ? "Сопоставлено" : m.status === "not_found" ? "Возможно потеряно" : "Требует проверки"}</strong><p>{m.reason}</p><Evidence refs={m.evidence_refs} result={result} confidence={m.confidence}/></td></tr>)}</tbody></table>{result.unmatched_after_ids.length > 0 && <details className={styles.warnings}><summary>ПОСЛЕ без надёжного соответствия ДО</summary><p>Это могут быть новые или изменённые функции, либо пробелы извлечения.</p>{result.unmatched_after_ids.map(id => <div key={id}><FunctionText organization={result.after} id={id}/><Evidence refs={result.after.functions.find(f => f.function_id === id)?.source_refs ?? []} result={result}/></div>)}</details>}</div>}
      {detail === "units" && <div className={styles.tableWrap}><table><caption>Создание и преобразование подразделений требуют подтверждения документами.</caption><thead><tr><th>ДО</th><th>ПОСЛЕ</th><th>Изменение</th></tr></thead><tbody>{result.owner_groups.map(g => <tr key={g.group_id}><td>{g.before_ids.map(id => ownerName(result.before, id)).join(" / ") || "Не найдено"}</td><td>{g.after_ids.map(id => ownerName(result.after, id)).join(" / ") || "Не найдено"}</td><td><strong>{groupLabels[g.status]}</strong><p>{g.entity_type === "unit" ? "Подразделение" : "Должность"}</p><p>{g.reason}</p><Evidence refs={g.evidence_refs} result={result} confidence={g.confidence}/></td></tr>)}</tbody></table></div>}
      <div className={styles.conclusion}><h3>Аналитическое заключение</h3><p>{result.analysis_complete || result.identical_sources ? result.conclusion : "Анализ требует уточнения. Проверенные соответствия доступны в деталях сравнения; отсутствие подтверждённого вывода не означает отсутствие риска. Проверьте источники и повторите анализ при необходимости."}</p></div>
    </>}
    {tab === "recommendations" && <><p className={styles.muted}>SAN.AI предлагает действия для рассмотрения. Эти рекомендации ещё не утверждены.</p>{!result.recommendations.length && <div className={styles.empty}>Обоснованных рекомендаций пока нет. Проверьте изменения и полноту анализа.</div>}{result.recommendations.map(r => <article key={r.recommendation_id} className={styles.recommendation}><div className={styles.suggestion}><Lightbulb size={17}/>SAN.AI предлагает · На рассмотрение</div><h3>Проблема</h3>{result.findings.filter(f => r.finding_ids.includes(f.finding_id)).map(f => <p key={f.finding_id}>{f.summary}</p>)}<h3>Рекомендация</h3><p>{r.summary}</p><h3>Обоснование</h3><p>{r.reason}</p><h3>Источники</h3><Evidence refs={r.evidence_refs} result={result}/></article>)}</>}
    <details className={styles.warnings}><summary>Техническая информация</summary><p>Модель: {result.model} · {new Date(result.created_at).toLocaleString("ru-RU")}</p>{!result.analysis_complete && <p>{result.conclusion}</p>}<ul>{result.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul><a href={`/api/comparisons?${query}&download=1`}>Скачать данные сравнения (JSON)</a></details>
  </section>;
}
