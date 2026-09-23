import { InputError } from "./organization";
export function apiError(error: unknown) {
  if (error instanceof InputError)
    return Response.json({ error: error.message }, { status: 400 });
  return Response.json(
    {
      error:
        "База данных недоступна или не подготовлена. Проверьте подключение и выполните npm run db:seed перед запуском.",
    },
    { status: 503 },
  );
}
