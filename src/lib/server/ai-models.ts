/** Server-side workload routing. Legacy OPENAI_MODEL remains an extraction fallback. */
export function extractionModel() {
  return process.env.OPENAI_EXTRACTION_MODEL?.trim() || process.env.OPENAI_MODEL?.trim() || "gpt-4.1-mini";
}
export function comparisonModel() {
  return process.env.OPENAI_COMPARISON_MODEL?.trim() || "gpt-6-sol";
}
export function comparisonReasoning(model: string): "low" | undefined {
  return /^gpt-6-(sol|astra|luna)(-|$)/.test(model) ? "low" : undefined;
}
