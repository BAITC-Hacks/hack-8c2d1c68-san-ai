"use client";
import { useState } from "react";
import { Building2, UserRound, AlertTriangle } from "lucide-react";
import type { ExtractionResult } from "@/lib/extraction";
import { buildDocumentStructure, type StructureNode } from "@/lib/document-structure";
import styles from "./document-workspace.module.css";

export function DocumentStructure({ result }: { result: ExtractionResult }) {
  const [view, setView] = useState<"scheme" | "list">("scheme");
  const nodes = buildDocumentStructure(result.units);
  const children = new Map<string | null, StructureNode[]>();
  for (const node of nodes) children.set(node.parentId, [...(children.get(node.parentId) ?? []), node]);
  const card = (node: StructureNode) => <article className={styles.structureNode}>
    <span className={styles.nodeType}>{node.entity?.entity_type === "position" ? <UserRound size={14}/> : <Building2 size={14}/>} {node.entity?.entity_type === "unit" ? "Подразделение" : node.entity?.entity_type === "position" ? "Должность" : node.entity ? "Тип требует проверки" : "Упомянутый родитель"}</span>
    <strong>{node.name}</strong>
    {view === "list" && node.entity?.parent_unit && <small>В составе: {node.entity.parent_unit}</small>}
    {node.unresolved && <p className={styles.help}><AlertTriangle size={13}/> Связь требует уточнения.</p>}
    {node.entity ? <details className={styles.nodeEvidence}><summary>Показать источник</summary>{node.entity.parent_unit && <p>В составе: {node.entity.parent_unit}</p>}{node.entity.evidence.map((s, i) => <figure key={i}><figcaption>{s.document} · {s.location.format === "docx" ? `Абзац ${s.location.paragraph}${s.location.section ? ` · пункт ${s.location.section}` : ""}` : s.location.format === "pdf" ? `Страница ${s.location.page}` : `${s.location.sheet}!${s.location.cells}`}</figcaption><blockquote>{s.quote}</blockquote></figure>)}</details> : <small>Упомянут в связях подчинения; отдельное описание не найдено.</small>}
  </article>;
  const branch = (node: StructureNode): React.ReactNode => <li key={node.id}>{card(node)}{children.has(node.id) && <ul>{children.get(node.id)!.map(branch)}</ul>}</li>;
  return <section className={styles.structureSection} aria-label={`Структура из ${result.document}`}>
    <div className={styles.viewSwitch} aria-label="Вид структуры"><button aria-pressed={view === "scheme"} onClick={() => setView("scheme")}>Схема</button><button aria-pressed={view === "list"} onClick={() => setView("list")}>Список</button></div>
    {!nodes.length ? <p className={styles.resultEmpty}>Подразделения не распознаны. Проверьте исходный документ или добавьте описание структуры.</p> : <div className={styles.structureViewport}>{view === "scheme" ? <ul className={styles.structureTree}>{(children.get(null) ?? []).map(branch)}</ul> : <div className={styles.structureList}>{nodes.map(n => <div key={n.id}>{card(n)}</div>)}</div>}</div>}
  </section>;
}
