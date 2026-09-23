import { requestOpenAiJson, AiError } from "../src/lib/server/openai-json";
async function main() {
 const result = await requestOpenAiJson({
  instructions: "Extract the department name from the synthetic sentence. Return the exact name.",
  input: "Синтетический пример: Департамент аудита проверяет процессы.",
  schemaName: "connection_check",
  schema: { type: "object", properties: { unit: { type: "string" } }, required: ["unit"], additionalProperties: false },
 });
 if (!result || typeof result !== "object" || !("unit" in result) || result.unit !== "Департамент аудита") throw new AiError("API ответил, но контрольное извлечение не прошло.");
 console.log("OpenAI: соединение и Structured Outputs проверены на синтетическом тексте. Документы не отправлялись.");
}
main().catch((error: unknown) => {
 console.error(error instanceof AiError ? error.message : "Проверка AI не выполнена.");
 process.exitCode = 1;
});
