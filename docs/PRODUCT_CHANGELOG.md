# PRODUCT_CHANGELOG

This file records product-level changes to `PRODUCT_SPEC.md`.

## Frontend P0 redesign — 2026-09-23

- Актуальное frontend-ТЗ: `UX_REDESIGN_SPEC.md`; основной flow теперь
  «Документы → Структуры → Результаты», рекомендации — вкладка результата.
- Текущий комплект файлов виден сразу; добавление/исключение инвалидирует
  зависимые представления. Возврат сохраняет состояние.
- Синяя корпоративная тема, схемы ДО/ПОСЛЕ рядом, evidence по запросу,
  отдельное оформление предложений AI, partial states без ложных нулей.
- Tutorial открывается только вручную. Синтетический employee graph убран
  из основной навигации и сохранён по прежнему адресу `/structure`.
- Backend, comparison engine, DATA_CONTRACT и правила human-in-the-loop неизменны.
- Проверки и оставшиеся ограничения: [UX_REDESIGN_HANDOFF.md](UX_REDESIGN_HANDOFF.md).

## v0.1 — 2026-09-23

### Added
- Two main modes:
  - Compare & Reorganize
  - Design from Current State
- Explicit organization state model:
  - CURRENT
  - PROPOSED
  - REVIEWED
  - APPROVED
- Human approval before a target organization becomes authoritative.
- Recommendation-level accept / reject / modify decisions.
- Target Organization concept.
- Workforce Alignment after target organization approval.
- People-to-Role / Role Gap Analysis.
- Employee-data input adapters:
  - manual;
  - file import;
  - enterprise HR systems;
  - external professional profiles where access is permitted.
- Transition Plan concept.
- Future multi-scenario organization design.
- Separation between detected facts, AI inferences, recommendations and approved decisions.

### Clarified
- The hackathon MVP remains centered on BEFORE / AFTER document comparison.
- Personnel analysis is an extension and must not block the mandatory case flow.
- Organization and employee data may be uploaded together, but people recommendations are logically downstream of target-organization approval.
- Recommendations must not automatically overwrite the current organization.
- Employee recommendations must remain decision support, not automatic staffing decisions.

### Deferred from MVP
- Live 1C integration.
- Live SAP / Workday / Oracle HCM integration.
- External professional-profile integration.
- Automatic personnel transfers or appointments.
- Full scenario-management UI.
- Production workflow / access-control implementation.

## Implementation handoff — comparison, 2026-09-23

- Implemented owner/function matching, five finding types, evidence, proposed
  recommendations and analytical conclusion from canonical inputs.
- Added comparison-v1 envelope to DATA_CONTRACT; extraction-v1 is compatible.
- Missing/ambiguous data does not automatically imply loss.
- Product scope and approval rules unchanged. Real-document semantic acceptance
  remains pending; synthetic live verification is documented in COMPARISON.md.
