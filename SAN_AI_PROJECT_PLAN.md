# SAN.AI — AI-агент анализа организационной структуры и функционала

**Статус:** Product & Architecture v0.1  
**Назначение:** промежуточный артефакт HackAlem AI для фиксации выбранного решения, архитектуры и распределения работ.

## 1. Цель проекта

Разработать AI-агента, который сравнивает организационные и функциональные документы **до** и **после** реорганизации, выявляет возможную потерю или дублирование функций, потенциальные конфликты ответственности и формирует объяснимое заключение со ссылками на исходные документы.

Главный принцип: **каждый существенный вывод должен быть подтверждаемым и прослеживаемым до конкретного документа и фрагмента текста.**

## 2. Основной пользовательский сценарий

1. Пользователь загружает комплект документов **ДО реорганизации**.
2. Пользователь загружает комплект документов **ПОСЛЕ реорганизации**.
3. Система извлекает подразделения, иерархию, функции, зоны ответственности и ссылки на источники.
4. Система сопоставляет структуру и функции ДО / ПОСЛЕ.
5. Система классифицирует изменения:
   - `Preserved`
   - `Transferred`
   - `Lost`
   - `Duplicated`
   - `Conflict`
6. Пользователь получает сводку рисков.
7. По каждому выводу можно открыть подтверждающие источники.
8. Система формирует итоговое аналитическое заключение для проверки ответственным сотрудником.

## 3. MVP

### Обязательно реализовать

- Загрузка документов ДО / ПОСЛЕ.
- Поддержка PDF / DOCX / XLSX.
- Извлечение подразделений и функций.
- Сохранение source reference для каждой функции.
- Сопоставление подразделений ДО / ПОСЛЕ.
- Сопоставление функций ДО / ПОСЛЕ.
- Выявление `Preserved`, `Transferred`, `Lost`, `Duplicated`, `Conflict`.
- Results Dashboard.
- Evidence View: документ, раздел/пункт, исходный фрагмент.
- Итоговое аналитическое заключение.

### Не делаем в первой версии

- полноценную интеграцию с СЭД;
- HR-интеграции;
- benchmarking других операторов;
- автоматическую проверку законодательства;
- сложную авторизацию и роли;
- production-ready БД;
- промышленный workflow согласования.

## 4. Архитектура

```text
DOCUMENTS
  BEFORE / AFTER
       |
       v
Document Parser
PDF / DOCX / XLSX
       |
       v
Structured Extraction
Units / Functions / Relations / Sources
       |
       v
Canonical Organization Model
       |
       +-------------------+
       |                   |
       v                   v
Unit Matching       Function Matching
       |                   |
       +---------+---------+
                 |
                 v
             Diff Engine
                 |
      +----------+----------+
      |          |          |
      v          v          v
    LOST     DUPLICATED   CONFLICT
      |          |          |
      +----------+----------+
                 |
                 v
           Evidence Engine
                 |
                 v
      Analytical Conclusion
                 |
                 v
          Results Dashboard
```

## 5. Canonical data model

Оба full-stack разработчика работают через общий контракт данных.

### Organizational Unit

```json
{
  "unit_id": "unit_01",
  "unit_name": "Департамент цифрового бизнеса",
  "parent_unit": "Блок X",
  "functions": [
    {
      "function_id": "func_001",
      "action": "сопровождение",
      "object": "информационные системы",
      "original_text": "Обеспечивает сопровождение информационных систем...",
      "source": {
        "document": "Положение_ДЦБ.docx",
        "section": "4.2",
        "page": 6
      }
    }
  ]
}
```

### Finding

```json
{
  "type": "LOST",
  "risk": "HIGH",
  "function_before": "Контроль инвестиционной программы",
  "unit_before": "Департамент A",
  "unit_after": null,
  "confidence": 0.91,
  "reason": "Эквивалентная функция после реорганизации не обнаружена",
  "evidence_before": {},
  "evidence_after": []
}
```

## 6. Логика анализа

### Document Intelligence

Из каждого документа извлекаются:
- подразделение;
- родительское подразделение;
- функция;
- действие;
- объект функции;
- тип ответственности;
- source reference;
- исходная формулировка.

### Function Matching

Базовый подход:

```text
semantic similarity
+ action/object comparison
+ LLM verification
```

### Explainability

Каждый вывод должен содержать:
- тип риска;
- подразделение ДО;
- подразделение ПОСЛЕ;
- функцию;
- confidence;
- краткое объяснение;
- источник ДО;
- источник ПОСЛЕ;
- исходные фрагменты текста.

## 7. Распределение команды

### Product / Captain

Отвечает за:
- соответствие требованиям кейса;
- scope;
- user flow;
- acceptance criteria;
- приоритизацию;
- интеграционную синхронизацию;
- QA основного сценария;
- README / demo / submission.

### Full-stack 1 — Document Intelligence Owner

Зона ответственности:

```text
Files
→ Parsing
→ Extraction
→ Organization Model
→ Sources
```

Реализует:
- upload ДО / ПОСЛЕ;
- parsing PDF / DOCX / XLSX;
- structured extraction;
- подразделения;
- функции;
- hierarchy;
- source references;
- canonical JSON.

**Definition of Done:** на контрольном комплекте документов система формирует корректный структурированный список подразделений и функций с источниками.

### Full-stack 2 — Audit Intelligence Owner

Зона ответственности:

```text
Organization Model
→ Matching
→ Findings
→ Evidence
→ Results UI
```

Реализует:
- unit matching;
- function matching;
- finding classification;
- confidence;
- evidence;
- dashboard;
- findings table;
- evidence drawer;
- итоговое заключение.

**Definition of Done:** на canonical JSON система выявляет минимум `Lost`, `Duplicated`, `Transferred` и показывает понятное обоснование со ссылками на источники.

## 8. Интеграция двух full-stack разработчиков

Единственная жесткая точка интеграции:

```text
Full-stack 1
Documents
    |
    v
Canonical Organization JSON
    |
    v
Full-stack 2
Matching / Findings / Results UI
```

Full-stack 2 не ждет готовности Full-stack 1. На старте он работает с mock-файлами:

```text
/mock
  before_structure.json
  after_structure.json
```

После готовности extraction mock JSON заменяется реальными данными без изменения контракта.

## 9. Основной интерфейс

### Экран 1 — Upload
- Документы ДО
- Документы ПОСЛЕ
- Список файлов
- `Запустить анализ`

### Экран 2 — Summary

```text
27 подразделений
143 функции

42 Preserved
8 Transferred
3 Lost
5 Duplicated
1 Conflict
```

### Экран 3 — Findings

| Risk | Function | Before | After | Finding |
|---|---|---|---|---|
| High | Контроль X | Dept A | — | Lost |
| Medium | Управление Y | Dept B | Dept C + D | Duplicated |
| Low | Поддержка Z | Dept A | Dept C | Transferred |

### Экран 4 — Evidence

```text
Почему система сделала такой вывод?

ДО
Документ: ...
Пункт: ...
Фрагмент: ...

ПОСЛЕ
Документ: ...
Пункт: ...
Фрагмент: ...

Вывод:
...
```

## 10. Главный demo-flow

> Пользователь загружает документы ДО и ПОСЛЕ реорганизации. AI восстанавливает структуру и функции подразделений. Система сопоставляет старую и новую модель. Пользователь получает список сохраненных, перенесенных, потенциально потерянных и дублирующихся функций. Для любого риска можно открыть конкретные пункты исходных документов. В конце формируется аналитическое заключение для дальнейшей проверки ответственным сотрудником.

## 11. Optional после готового MVP

1. Function Lineage.
2. Confidence score.
3. Executive Summary.
4. Export отчета.
5. Compliance с нормативными документами.
6. Benchmarking других операторов.
7. Корпоративные интеграции.

## 12. Definition of Done

- [ ] документы ДО / ПОСЛЕ загружаются;
- [ ] парсинг работает;
- [ ] подразделения извлекаются;
- [ ] функции извлекаются;
- [ ] у функций есть source references;
- [ ] ДО / ПОСЛЕ сопоставляются;
- [ ] Lost определяется;
- [ ] Duplicated определяется;
- [ ] Transferred определяется;
- [ ] Conflict реализован хотя бы на объяснимых правилах;
- [ ] findings отображаются в UI;
- [ ] можно открыть evidence;
- [ ] формируется итоговое заключение;
- [ ] основной сценарий проходит end-to-end;
- [ ] приложение запускается по README;
- [ ] финальная версия находится в официальном GitHub-репозитории команды.

## 13. Progress checkpoints

Для подтверждаемой истории разработки в GitHub фиксируем реальные промежуточные результаты.

Пример логики коммитов:

```text
product: define MVP, architecture and team responsibilities
feat: add document upload and parsing
feat: extract organizational units and functions
feat: add function matching and findings engine
feat: add findings dashboard and evidence view
docs: finalize README and demo scenario
```

Коммиты должны отражать реальный прогресс проекта, а не создаваться формально ради количества.

## 14. Product principle

> Не строим универсальную корпоративную платформу за 5 часов.  
> Строим один полностью работающий сценарий:  
> **ДО → ПОСЛЕ → изменения → риски → доказательства.**

Любая новая функция добавляется только после того, как этот сценарий работает end-to-end.
