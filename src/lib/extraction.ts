import type { VerifiedSource } from "./server/document-sources";
import type { DocumentSide } from "./documents";

/** Extraction output v1. Matching must not treat it as an exhaustive factual inventory. */
export interface ExtractedUnit {
  unit_id: string;
  unit_name: string;
  entity_type?: "unit" | "position" | "unknown";
  parent_unit: string | null;
  evidence: VerifiedSource[];
}
export interface ExtractedFunction {
  function_id: string;
  unit_name: string | null;
  action: string;
  object: string;
  scope: string | null;
  responsibility_type: "execution" | "oversight" | "approval" | "consulting" | "other";
  modality: "duty" | "permission" | "prohibition";
  conditions: string | null;
  evidence: VerifiedSource[];
}
export interface ExtractionResult {
  schema_version: "extraction-v1";
  document_id: string;
  document: string;
  side: DocumentSide;
  model: string;
  created_at: string;
  review_required: true;
  processed_fragments: number;
  rejected_items: number;
  warnings: string[];
  units: ExtractedUnit[];
  functions: ExtractedFunction[];
}
