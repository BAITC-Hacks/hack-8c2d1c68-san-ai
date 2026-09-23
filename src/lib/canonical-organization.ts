import type { ExtractionResult, ExtractedFunction } from "./extraction";
import type { VerifiedSource } from "./server/document-sources";

export interface CanonicalOrganization {
  organization_id: string;
  version_label: string;
  state: "current" | "proposed";
  units: { unit_id: string; name: string; short_name: null; parent_unit_id: string | null; status: "active"; source_refs: string[] }[];
  positions: { position_id: string; title: string; unit_id: string | null; reports_to_position_id: null; requirement_ids: string[]; source_refs: string[] }[];
  functions: { function_id: string; owner_type: "unit" | "position" | null; owner_id: string | null; action: string; object: string; canonical_text: string; original_text: string; responsibility_type: ExtractedFunction["responsibility_type"]; modality: ExtractedFunction["modality"]; conditions: string | null; scope: string | null; source_refs: string[] }[];
  reporting_lines: never[];
  sources: { source_id: string; document_id: string; document_name: string; side: "before" | "after"; fragment_id: string; location: VerifiedSource["location"]; text: string; quote: string; start: number; end: number }[];
}

/** Conservative projection: unresolved mentions never become invented owners. */
export function toCanonicalOrganization(results: ExtractionResult[], side: "before" | "after") {
  if (!results.length || results.some(r => r.side !== side)) throw new Error("Нужен непустой комплект одной стороны.");
  const documents = [...new Map(results.map(r => [r.document_id, r])).values()].sort((a,b) => a.document_id.localeCompare(b.document_id));
  const warnings = documents.flatMap(r => r.warnings);
  const organization: CanonicalOrganization = {
    organization_id: `org-${side}-${documents.map(r=>encodeURIComponent(r.document_id)).join("+")}`,
    version_label: documents.map(r=>r.document).join("; "), state: side === "before" ? "current" : "proposed",
    units: [], positions: [], functions: [], reporting_lines: [], sources: [],
  };
  const sources = new Map<string, CanonicalOrganization["sources"][number]>();
  function refs(evidence: VerifiedSource[]) {
    return [...new Set(evidence.map(s => {
      const source_id = [s.side,s.document_id,s.fragment_id,s.start,s.end].map(x=>encodeURIComponent(String(x))).join(":");
      sources.set(source_id, { source_id, document_id:s.document_id, document_name:s.document, side:s.side, fragment_id:s.fragment_id, location:s.location, text:s.text, quote:s.quote, start:s.start, end:s.end });
      return source_id;
    }))];
  }
  for (const doc of documents) {
    const resolve = (name: string | null, onlyUnit = false) => {
      const candidates = doc.units.filter(u=>u.unit_name === name && (u.entity_type === "unit" || (!onlyUnit && u.entity_type === "position")));
      return candidates.length === 1 ? candidates[0] : null;
    };
    for (const u of doc.units) {
      const source_refs = refs(u.evidence);
      const parent = resolve(u.parent_unit, true);
      if (u.entity_type === "unit") organization.units.push({ unit_id:u.unit_id, name:u.unit_name, short_name:null, parent_unit_id:parent && parent.unit_id !== u.unit_id ? parent.unit_id : null, status:"active", source_refs });
      else if (u.entity_type === "position") organization.positions.push({ position_id:u.unit_id, title:u.unit_name, unit_id:parent?.unit_id ?? null, reports_to_position_id:null, requirement_ids:[], source_refs });
      else warnings.push(`Не классифицировано упоминание: ${u.unit_name} (${doc.document}).`);
    }
    for (const f of doc.functions) {
      const owner = resolve(f.unit_name);
      if (!owner) warnings.push(`Не установлен владелец функции ${f.function_id}: ${f.unit_name ?? "не указан"}.`);
      organization.functions.push({ function_id:f.function_id, owner_type:owner?.entity_type === "unit" ? "unit" : owner?.entity_type === "position" ? "position" : null, owner_id:owner?.unit_id ?? null,
        action:f.action, object:f.object, canonical_text:`${f.modality === "prohibition" ? "Запрещено: " : f.modality === "permission" ? "Вправе: " : "Обязанность: "}${f.action} ${f.object}${f.scope ? `; область: ${f.scope}` : ""}${f.conditions ? `; условия: ${f.conditions}` : ""}`,
        original_text:f.evidence.map(s=>s.quote).join("\n"), responsibility_type:f.responsibility_type, modality:f.modality, conditions:f.conditions, scope:f.scope, source_refs:refs(f.evidence) });
    }
  }
  organization.sources = [...sources.values()];
  return { contract_version: "0.1", review_required: true as const, warnings:[...new Set(warnings)], organization };
}
