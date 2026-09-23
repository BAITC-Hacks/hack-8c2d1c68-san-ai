# Инструкции для агентов

## Source of truth

Перед нетривиальной работой прочитай:

1. `docs/TZ.md` — исходные требования кейса.
2. `docs/PRODUCT_SPEC.md` — актуальный продуктовый source of truth.
3. `docs/DATA_CONTRACT.md` — общие контракты данных.
4. `docs/PRODUCT_CHANGELOG.md` — последние продуктовые изменения.
5. Релевантные технические документы текущего блока.

`docs/spec-history/` содержит только исторические snapshots. Они не являются актуальными требованиями.

## Цель хакатонного MVP

Главный сквозной сценарий:

`BEFORE/AFTER documents -> extraction -> comparison -> findings -> evidence -> recommendations`

Не реализуй будущие интеграции или Workforce Alignment, если это ставит под риск основной end-to-end сценарий.

## Human-in-the-loop

Никогда не трактуй AI-рекомендацию как автоматически утвержденное организационное или кадровое решение.

Разделяй:
- current state;
- detected findings;
- AI recommendations;
- user decisions;
- approved target state.

`proposed` не должен автоматически заменять `current`.

## Shared data contract

Не придумывай независимо несовместимые структуры для:
- units;
- positions;
- functions;
- role requirements;
- findings;
- recommendations;
- scenarios.

Используй `docs/DATA_CONTRACT.md`. Если контракт нужно изменить, делай минимальное изменение и фиксируй его в документации.

## Команда

- Product / Captain: scope, acceptance, QA, demo, product decisions.
- Full-stack 1: Document Intelligence и canonical extraction.
- Full-stack 2: Organization Audit, findings, evidence и result experience.

Оба разработчика работают full-stack внутри своих сквозных блоков.

## Правила разработки

- Сначала осмотри текущие файлы и Git diff.
- Сохраняй чужую работу.
- Делай небольшие проверяемые изменения.
- Предпочитай работающий end-to-end сценарий дополнительным фичам.
- Храни source evidence рядом с извлеченными фактами и findings.
- Не помещай секреты в код, логи, README или клиентский bundle.
- Явно помечай mock, synthetic и future integrations.
- Не называй внешнюю интеграцию live, пока она реально не реализована и не проверена.
- Не расширяй scope самостоятельно без продуктового решения.

## Проверка завершения

Для каждого изменения сообщай:
- что изменилось;
- как проверено;
- что остается mock / не проверено;
- есть ли изменение контракта, важное для второго разработчика.
