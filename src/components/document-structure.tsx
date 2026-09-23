"use client";
import { useState } from "react";
import { Building2, UserRound, GitBranch } from "lucide-react";
import type { ExtractionResult } from "@/lib/extraction";
import { buildDocumentStructure, type StructureNode } from "@/lib/document-structure";
import styles from "./document-workspace.module.css";

export function DocumentStructure({result}: {result: ExtractionResult}) {
  const [view,setView]=useState<"scheme"|"list">("scheme");
  const nodes=buildDocumentStructure(result.units);
  const children=new Map<string|null,StructureNode[]>();
  for (const node of nodes) children.set(node.parentId,[...(children.get(node.parentId)??[]),node]);
  const card=(node:StructureNode)=><details className={styles.structureNode}>
    <summary><span className={styles.nodeType}>{node.entity?.entity_type === "position" ? <UserRound size={14}/> : <Building2 size={14}/>} {node.entity?.entity_type === "unit" ? "Подразделение" : node.entity?.entity_type === "position" ? "Должность" : node.entity ? "Тип не определён" : "Упомянутый родитель"}</span><strong>{node.name}</strong>{node.entity && <small>Функций и ограничений: {result.functions.filter(f=>f.unit_name===node.name).length} · источник</small>}</summary>
    {node.unresolved && <p className={styles.help}>Связь или тип сущности требуют уточнения.</p>}
    {node.entity?.parent_unit && <p className={styles.help}>В составе: {node.entity.parent_unit}</p>}
    {node.entity?.evidence.map((s,i)=><blockquote key={i}>{s.quote}<cite>{s.location.format === "docx" ? `Абзац ${s.location.paragraph}` : s.location.format === "pdf" ? `Страница ${s.location.page}` : `${s.location.sheet}!${s.location.cells}`}</cite></blockquote>)}
    {!node.entity && <p className={styles.help}>Название указано как родитель в извлечённых данных; отдельная сущность не найдена.</p>}
  </details>;
  const branch=(node:StructureNode):React.ReactNode=><li key={node.id}>{card(node)}{children.has(node.id) && <ul>{children.get(node.id)!.map(n=>branch(n))}</ul>}</li>;
  return <section className={styles.structureSection} aria-label="Структура из документа">
    <div className={styles.structureHeading}><h4><GitBranch size={18}/> Структура по документу <span>{result.side === "before" ? "ДО" : "ПОСЛЕ"}</span></h4><div className={styles.viewSwitch} aria-label="Вид структуры"><button aria-pressed={view==="scheme"} onClick={()=>setView("scheme")}>Схема</button><button aria-pressed={view==="list"} onClick={()=>setView("list")}>Список</button></div></div>
    <p className={styles.help}>Связи из извлечённого текста. Нажмите на узел, чтобы увидеть источник. Варианты названий пока показаны отдельно.</p>
    {!nodes.length ? <p className={styles.resultEmpty}>Структура не найдена в тексте документа.</p> : <div className={styles.structureViewport}>{view === "scheme" ? <ul className={styles.structureTree}>{(children.get(null)??[]).map(n=>branch(n))}</ul> : <div className={styles.structureList}>{nodes.map(n=><div key={n.id}>{card(n)}</div>)}</div>}</div>}
  </section>;
}
