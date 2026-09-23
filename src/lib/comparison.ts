import type { CanonicalOrganization } from "./canonical-organization";

export type FindingType = "preserved" | "transferred" | "lost" | "duplicated" | "conflict";
export const findingLabels: Record<FindingType, string> = {
  preserved: "Сохранено", transferred: "Передано", lost: "Возможная потеря",
  duplicated: "Возможное дублирование", conflict: "Возможный конфликт",
};
export interface OwnerGroup {
  group_id: string;
  entity_type: "unit" | "position";
  before_ids: string[];
  after_ids: string[];
  confidence: number;
  reason: string;
  evidence_refs: string[];
  status: "preserved" | "transformed" | "created" | "unmatched" | "needs_review";
}
export interface FunctionMatch {
  match_id: string;
  entity_type: "function";
  before_id: string;
  after_id: string | null;
  similarity: number;
  status: "matched" | "not_found" | "needs_review";
  reason: string;
  evidence_refs: string[];
}
export interface Finding {
  finding_id: string;
  type: FindingType;
  risk: "low" | "medium" | "high";
  confidence: number;
  before_entity_ids: string[];
  after_entity_ids: string[];
  summary: string;
  reason: string;
  evidence_refs: string[];
  status: "detected";
}
export interface Recommendation {
  recommendation_id: string;
  finding_ids: string[];
  type: "assign_owner" | "clarify_ownership" | "separate_responsibilities";
  status: "proposed";
  summary: string;
  reason: string;
  target_changes: never[];
  evidence_refs: string[];
}
export interface ComparisonResult {
  schema_version: "comparison-v1";
  comparison_id: string;
  created_at: string;
  model: string;
  review_required: true;
  before: CanonicalOrganization;
  after: CanonicalOrganization;
  owner_groups: OwnerGroup[];
  matches: FunctionMatch[];
  findings: Finding[];
  recommendations: Recommendation[];
  unmatched_after_ids: string[];
  warnings: string[];
  absence_assessable: boolean;
  conclusion: string;
}

/** Formatting only: no stemming or guessed acronym expansion. */
export function normalizeOwnerName(name: string) {
  return name.normalize("NFKC").toLocaleLowerCase("ru").replace(/ё/g, "е")
    .replace(/[«»„“”"']/g, "").replace(/\s+/g, " ").trim();
}
export function ownerName(organization: CanonicalOrganization, id: string | null) {
  return organization.units.find(u => u.unit_id === id)?.name
    ?? organization.positions.find(p => p.position_id === id)?.title
    ?? "Владелец не установлен";
}
