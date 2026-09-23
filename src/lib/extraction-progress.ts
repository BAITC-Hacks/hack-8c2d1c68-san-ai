export interface ExtractionProgress {
  status: "idle" | "running" | "complete" | "failed" | "cancelled";
  completed_chunks: number;
  total_chunks: number;
  started_at?: string;
  error?: string;
}
