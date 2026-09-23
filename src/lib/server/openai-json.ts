/** Server-only OpenAI transport. No keys or provider response bodies are logged. */
export class AiError extends Error {
  constructor(message: string, public status = 502) { super(message); this.name = "AiError"; }
}
export interface JsonRequest {
  instructions: string;
  input: string;
  schema: Record<string, unknown>;
  schemaName: string;
  signal?: AbortSignal;
  model?: string;
  reasoningEffort?: "low";
}
export interface AiConfig {
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  fetcher?: typeof fetch;
}
export async function requestOpenAiJson(request: JsonRequest, config: AiConfig = {}): Promise<unknown> {
  const apiKey = config.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey?.trim()) throw new AiError("На сервере не задан OPENAI_API_KEY.", 503);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? 90000);
  const signal = request.signal ? AbortSignal.any([controller.signal, request.signal]) : controller.signal;
  try {
    const response = await (config.fetcher ?? fetch)("https://api.openai.com/v1/responses", {
      method: "POST", signal,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.model ?? request.model ?? process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
        ...(request.reasoningEffort ? { reasoning: { effort: request.reasoningEffort } } : {}),
        store: false,
        instructions: request.instructions,
        input: request.input,
        max_output_tokens: 12000,
        text: { format: { type: "json_schema", name: request.schemaName, strict: true, schema: request.schema } },
      }),
    });
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 401 || response.status === 403) throw new AiError("OpenAI отклонил доступ. Проверьте API-ключ и разрешения проекта.", 503);
      if (response.status === 429) throw new AiError("Достигнут лимит OpenAI или недоступна квота. Проверьте лимиты и повторите позже.", 429);
      if (response.status === 400 || response.status === 404) throw new AiError("OpenAI не принял настройки запроса. Проверьте OPENAI_MODEL и поддержку Structured Outputs.");
      throw new AiError("OpenAI временно недоступен. Повторите попытку позже.");
    }
    const result = await response.json() as {
      status?: string;
      output?: { type?: string; content?: { type?: string; text?: string }[] }[];
    };
    if (result.status !== "completed") throw new AiError("OpenAI не завершил извлечение. Частичный результат не используется.");
    const content = result.output?.filter((item) => item.type === "message").flatMap((item) => item.content ?? []) ?? [];
    if (content.some((item) => item.type === "refusal")) throw new AiError("Модель отказалась обрабатывать содержимое.");
    const text = content.filter((item) => item.type === "output_text").map((item) => item.text ?? "").join("");
    try { return JSON.parse(text); }
    catch { throw new AiError("OpenAI вернул некорректный JSON. Результат не сохранён."); }
  } catch (error) {
    if (error instanceof AiError) throw error;
    if (signal.aborted) throw new AiError("Ожидание AI истекло или запрос отменён. Повторите попытку.", 504);
    throw new AiError("Не удалось связаться с OpenAI. Проверьте соединение сервера.", 503);
  } finally { clearTimeout(timeout); }
}
