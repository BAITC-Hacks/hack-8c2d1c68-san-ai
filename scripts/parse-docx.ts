import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { parseDocx, DocxParseError, MAX_DOCX_BYTES } from "../src/lib/server/docx-parser";

async function main() {
  const [side, file, ...extra] = process.argv.slice(2);
  if ((side !== "before" && side !== "after") || !file || extra.length) {
    throw new DocxParseError('Использование: npm run documents:parse -- before|after "путь.docx"');
  }
  const info = await stat(file);
  if (!info.isFile() || info.size > MAX_DOCX_BYTES) throw new DocxParseError("Нужен файл DOCX размером до 10 МиБ.");
  const result = parseDocx(await readFile(file), path.basename(file), side);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error: unknown) => {
  console.error(error instanceof DocxParseError ? error.message : "Не удалось прочитать файл DOCX. Проверьте путь и доступ.");
  process.exitCode = 1;
});
