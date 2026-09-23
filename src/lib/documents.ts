export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export type DocumentSide = "before" | "after";
export interface StoredDocument {
  id: string;
  name: string;
  side: DocumentSide;
  size: number;
  created_at: string;
  format: "docx" | "pdf" | "xlsx";
  status: "parsed" | "stored" | "parse_error";
  fragment_count: number;
  warnings: string[];
}
