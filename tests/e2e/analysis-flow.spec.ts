import { test, expect, type Page } from "@playwright/test";
import { comparisonFixture, fixtureProvider } from "../helpers/comparison-fixtures";
import { compareOrganizations } from "../../src/lib/server/comparison";
import type { StoredDocument } from "../../src/lib/documents";

// Synthetic API responses isolate the frontend contract; no paid provider calls.
async function mockApi(page: Page, partial = false, failFirstBuild = false) {
  const before = comparisonFixture("before");
  const after = comparisonFixture("after");
  const result = await compareOrganizations([before.extraction], [after.extraction], undefined, fixtureProvider, "synthetic-browser-test");
  const docs: StoredDocument[] = [];
  let builds = 0;
  let comparisons = 0;
  let failed = false;
  await page.route("**/api/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname === "/api/documents") {
      if (request.method() === "GET") return json({ documents: docs });
      const side = url.searchParams.get("side") as "before" | "after";
      const doc: StoredDocument = { id: `doc-${docs.length}`, side, name: url.searchParams.get("name")!, format: "docx", size: 1500, status: "parsed", created_at: new Date().toISOString(), fragment_count: 10, warnings: [] };
      docs.push(doc); return json({ document: doc });
    }
    if (url.pathname.endsWith("/extract")) {
      const id = url.pathname.split("/")[3];
      const doc = docs.find(d => d.id === id)!;
      const result = doc.side === "before" ? before.extraction : after.extraction;
      if (request.method() === "GET") return json({ status: "idle", completed_chunks: 0, total_chunks: 0 });
      builds++;
      await new Promise(resolve => setTimeout(resolve, 300));
      if (failFirstBuild && !failed) { failed = true; return json({ error: "synthetic failure" }, 503); }
      return json({ status: "complete", completed_chunks: 1, total_chunks: 1, result });
    }
    if (url.pathname === "/api/comparisons") {
      comparisons++;
      await new Promise(resolve => setTimeout(resolve, 300));
      return json({ result: { ...result, analysis_complete: !partial, absence_assessable: !partial } });
    }
    return json({ error: "Unexpected synthetic request" }, 404);
  });
  return { before, after, counts: () => ({ builds, comparisons }) };
}
async function uploadPair(page: Page, data: Awaited<ReturnType<typeof mockApi>>) {
  await page.goto("/");
  await page.getByLabel("Добавить документы ДО", { exact: true }).setInputFiles({ name: "synthetic-редакция-8.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: Buffer.from(data.before.bytes) });
  await expect(page.getByText("synthetic-редакция-8.docx", { exact: true })).toBeVisible();
  await page.getByLabel("Добавить документы ПОСЛЕ", { exact: true }).setInputFiles({ name: "synthetic-редакция-9.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: Buffer.from(data.after.bytes) });
  await expect(page.getByText("synthetic-редакция-9.docx", { exact: true })).toBeVisible();
}
test("P0: upload, amend bundles, structures, evidence, results, recommendations, back and rebuild", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  const data = await mockApi(page);
  await uploadPair(page, data);
  await expect(page.getByLabel("Подсказки по документам")).toHaveCount(0);
  await page.screenshot({ path: ".cache/ux-documents.png", fullPage: true });
  await page.getByLabel("Добавить документы ДО", { exact: true }).setInputFiles({ name: "synthetic-приложение.docx", mimeType: "application/octet-stream", buffer: Buffer.from(data.before.bytes) });
  await expect(page.getByText("synthetic-приложение.docx", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Убрать из анализа synthetic-приложение.docx", exact: true }).click();
  await expect(page.getByLabel("Документы ДО", { exact: true }).locator("li")).toHaveCount(1);
  await page.getByRole("button", { name: "Построить структуры", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Анализируем документы", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Анализируем документы…", exact: true })).toBeDisabled();
  await expect(page.getByRole("heading", { name: "Структуры ДО и ПОСЛЕ" })).toBeVisible();
  await page.getByRole("button", { name: "Список", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "Список", exact: true }).first()).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Схема", exact: true }).first().click();
  await page.locator("summary").filter({ hasText: /^Показать источник$/ }).first().click();
  await expect(page.locator("blockquote").first()).toBeVisible();
  await page.screenshot({ path: ".cache/ux-structures.png", fullPage: true });
  await page.getByRole("button", { name: "Сравнить ДО и ПОСЛЕ", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Сравниваем документы…" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Результаты анализа", exact: true })).toBeVisible();
  await page.locator("summary").filter({ hasText: /^Почему система так решила$/ }).first().click();
  await expect(page.getByRole("heading", { name: "Вывод системы" }).first()).toBeVisible();
  await page.screenshot({ path: ".cache/ux-results.png", fullPage: true });
  await page.getByRole("button", { name: /^Рекомендации/ }).click();
  await expect(page.getByRole("heading", { name: "Обоснование", exact: true }).first()).toBeVisible();
  await expect(page.getByText("SAN.AI предлагает · На рассмотрение").first()).toBeVisible();
  await page.screenshot({ path: ".cache/ux-recommendations.png", fullPage: true });
  await page.getByRole("button", { name: "Вернуться к структурам" }).click();
  await page.getByRole("button", { name: "Изменить документы" }).click();
  await page.getByRole("button", { name: "Построить структуры", exact: true }).click();
  await page.getByRole("button", { name: "Сравнить ДО и ПОСЛЕ", exact: true }).click();
  expect(data.counts()).toEqual({ builds: 2, comparisons: 1 });
  await page.getByRole("button", { name: "Вернуться к структурам" }).click();
  await page.getByRole("button", { name: "Изменить документы" }).click();
  await page.getByRole("button", { name: "Убрать из анализа synthetic-редакция-9.docx" }).click();
  await expect(page.getByText("Документы изменились", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Обновить структуры", exact: true })).toBeDisabled();
  await expect(page.getByRole("navigation", { name: "Этапы анализа" }).getByRole("button", { name: /Результаты/ })).toBeDisabled();
  await page.getByLabel("Добавить документы ПОСЛЕ", { exact: true }).setInputFiles({ name: "synthetic-редакция-9-новая.docx", mimeType: "application/octet-stream", buffer: Buffer.from(data.after.bytes) });
  await page.getByRole("button", { name: "Обновить структуры", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Структуры ДО и ПОСЛЕ" })).toBeVisible();
  await page.getByRole("button", { name: "Сравнить ДО и ПОСЛЕ", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Результаты анализа", exact: true })).toBeVisible();
  expect(data.counts().comparisons).toBe(2);
  expect(errors).toEqual([]);
});
test("partial analysis preserves verified findings and shows unknown metrics with retry", async ({ page }) => {
  const data = await mockApi(page, true);
  await uploadPair(page, data);
  await page.getByRole("button", { name: "Построить структуры", exact: true }).click();
  await page.getByRole("button", { name: "Сравнить ДО и ПОСЛЕ", exact: true }).click();
  await expect(page.getByText("Анализ требует уточнения", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Требует проверки/ })).toHaveCount(5);
  await page.getByRole("button", { name: "Повторить анализ", exact: true }).click();
  await expect(page.getByRole("button", { name: "Повторить анализ", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Повторить анализ", exact: true })).toBeEnabled();
  expect(data.counts().comparisons).toBe(2);
});
test("failed extraction is recoverable and navigation cannot bypass prerequisites", async ({ page }) => {
  const data = await mockApi(page, false, true);
  await uploadPair(page, data);
  await page.getByRole("button", { name: "Построить структуры", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Документы требуют внимания" })).toContainText("Не удалось обработать");
  await expect(page.getByRole("navigation", { name: "Этапы анализа" }).getByRole("button", { name: /Структуры/ })).toBeDisabled();
  await page.getByRole("button", { name: "Повторить", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Структуры ДО и ПОСЛЕ" })).toBeVisible();
});
test("narrow screen and reload keep bundle, help stays opt-in", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const data = await mockApi(page);
  await uploadPair(page, data);
  await page.reload();
  await expect(page.getByText("synthetic-редакция-8.docx", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Подсказки по документам")).toHaveCount(0);
  await page.getByRole("button", { name: "Как это работает?", exact: true }).click();
  await expect(page.getByLabel("Подсказки по документам")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Как это работает?", exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: ".cache/ux-mobile.png", fullPage: true });
});
