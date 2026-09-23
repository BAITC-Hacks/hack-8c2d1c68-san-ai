import type { StoredDocument } from "./documents";
import type { ExtractionResult } from "./extraction";
import type { ComparisonResult, FindingType } from "./comparison";

/** UI identity only; changing a bundle or replacing extraction invalidates dependent views. */
export function bundleKey(documents: StoredDocument[]) {
  return documents.map(d => `${d.side}:${d.id}`).sort().join("|");
}
export function extractionKey(documents: StoredDocument[], results: Record<string, ExtractionResult>) {
  return documents.map(d => `${d.id}:${results[d.id]?.created_at ?? ""}`).sort().join("|");
}
export function bundleReady(documents: StoredDocument[]) {
  return documents.some(d => d.side === "before") && documents.some(d => d.side === "after") && documents.every(d => d.status === "parsed");
}
export function findingCount(result: ComparisonResult, type: FindingType): number | null {
  if (!result.analysis_complete || result.identical_sources || (type === "lost" && !result.absence_assessable)) return null;
  return result.findings.filter(f => f.type === type).length;
}
export function createdUnitCount(result: ComparisonResult): number | null {
  if (!result.analysis_complete || !result.absence_assessable || result.identical_sources || result.owner_groups.some(g => g.entity_type === "unit" && g.status === "needs_review")) return null;
  return result.owner_groups.filter(g => g.entity_type === "unit" && g.status === "created").length;
}
