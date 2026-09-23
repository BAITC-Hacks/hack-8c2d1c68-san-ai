# DATA_CONTRACT

**Version:** 0.1  
**Status:** Current  
**Purpose:** stable integration contract between Document Intelligence, Organization Audit, Target Organization and future Workforce Alignment modules.

## 1. Input bundles

The system should conceptually support multiple files on each side:

```text
before/
  *.docx
  *.pdf
  *.xlsx

after/
  *.docx
  *.pdf
  *.xlsx
```

`after/` is optional in Design-from-Current-State mode.

The hackathon implementation may support DOCX first.

## 2. Source fragment

```json
{
  "source_id": "before:doc-...:paragraph-127:0:42",
  "document_id": "doc-...",
  "document_name": "Положение_редакция_8.docx",
  "side": "before",
  "fragment_id": "paragraph-127",
  "location": {
    "format": "docx",
    "section": "3.2",
    "paragraph": 127,
    "page": null
  },
  "text": "Исходный фрагмент документа"
}
```

## 3. Canonical organization

```json
{
  "organization_id": "org-current",
  "version_label": "revision-8",
  "state": "current",
  "units": [],
  "positions": [],
  "functions": [],
  "reporting_lines": [],
  "sources": []
}
```

Allowed `state` values:

```text
current
proposed
reviewed
approved
```

## 4. Organizational unit

```json
{
  "unit_id": "unit-001",
  "name": "Департамент ИТ-аудита и анализа данных",
  "short_name": "ДИТААД",
  "parent_unit_id": "unit-bva",
  "status": "active",
  "source_refs": ["src-001"]
}
```

## 5. Position

```json
{
  "position_id": "pos-001",
  "title": "Директор ДИТААД",
  "unit_id": "unit-001",
  "reports_to_position_id": "pos-chief-auditor",
  "requirement_ids": ["req-001", "req-002"],
  "source_refs": ["src-002"]
}
```

## 6. Function

```json
{
  "function_id": "func-001",
  "owner_type": "unit",
  "owner_id": "unit-001",
  "action": "проведение",
  "object": "аудита информационных систем",
  "canonical_text": "Проводить аудит информационных систем",
  "original_text": "аудит ИТ систем ...",
  "responsibility_type": "execution",
  "modality": "duty",
  "conditions": null,
  "scope": null,
  "source_refs": ["src-003"]
}
```

## 7. Role requirement

```json
{
  "requirement_id": "req-001",
  "position_id": "pos-001",
  "type": "experience",
  "name": "Опыт в ИТ-аудите",
  "level": "required",
  "value": "5+ years",
  "source_refs": ["src-004"]
}
```

Recommended requirement types:

```text
education
experience
skill
certification
language
domain_experience
responsibility
other
```

## 8. Match

```json
{
  "match_id": "match-func-001",
  "entity_type": "function",
  "before_id": "func-before-001",
  "after_id": "func-after-014",
  "similarity": 0.88,
  "status": "matched",
  "reason": "Функция сохранена с измененной формулировкой",
  "evidence_refs": ["src-before-1", "src-after-2"]
}
```

## 9. Finding

```json
{
  "finding_id": "finding-001",
  "type": "transferred",
  "risk": "medium",
  "confidence": 0.91,
  "before_entity_ids": ["func-before-001"],
  "after_entity_ids": ["func-after-014"],
  "summary": "Функция перенесена в новое подразделение",
  "reason": "Смысл функции сохранен, владелец изменен",
  "evidence_refs": ["src-before-1", "src-after-2"],
  "status": "detected"
}
```

Finding types:

```text
preserved
transferred
lost
duplicated
conflict
```

## 10. Recommendation

```json
{
  "recommendation_id": "rec-001",
  "finding_ids": ["finding-001"],
  "type": "reassign_function",
  "status": "proposed",
  "summary": "Закрепить primary ownership за ДИТААД",
  "reason": "Подразделение уже владеет связанными ИТ-аудит функциями",
  "target_changes": [],
  "evidence_refs": ["src-before-1", "src-after-2"]
}
```

Recommendation status:

```text
proposed
accepted
rejected
modified
```

## 11. Proposed scenario

```json
{
  "scenario_id": "scenario-001",
  "name": "Recommended Target Organization",
  "based_on_organization_id": "org-current",
  "status": "proposed",
  "recommendation_ids": ["rec-001"],
  "target_organization_id": "org-proposed-001"
}
```

Scenario status:

```text
proposed
reviewed
approved
rejected
```

## 12. Recommendation decision

```json
{
  "decision_id": "decision-001",
  "recommendation_id": "rec-001",
  "decision": "modified",
  "comment": "Перенести функцию в другое подразделение",
  "replacement_change": {},
  "decided_at": "2026-09-23T16:00:00+05:00"
}
```

## 13. Employee profile

Future Workforce Alignment contract:

```json
{
  "employee_id": "emp-001",
  "full_name": "Demo Employee",
  "current_position_id": "pos-old-001",
  "current_unit_id": "unit-old-001",
  "experience": [],
  "skills": [],
  "certifications": [],
  "education": [],
  "source": {
    "provider": "manual"
  }
}
```

Provider values may include:

```text
manual
file
1c
sap
workday
oracle_hcm
internal_hris
external_profile
other
```

Do not assume that an adapter is live merely because the provider type exists.

## 14. Role alignment

```json
{
  "alignment_id": "align-001",
  "employee_id": "emp-001",
  "position_id": "pos-target-001",
  "status": "for_consideration",
  "matched_requirements": [],
  "partial_requirements": [],
  "missing_requirements": [],
  "development_gaps": [],
  "reason": "Объяснимое резюме соответствия",
  "evidence_refs": []
}
```

The system should prefer explainable requirement-level analysis over a single opaque score.

## 15. Transition plan

```json
{
  "transition_plan_id": "transition-001",
  "approved_organization_id": "org-approved-001",
  "organizational_actions": [],
  "workforce_actions": [],
  "open_roles": [],
  "development_actions": []
}
```

## 16. Integration rule

Critical handoff:

`Documents -> Canonical Organization -> Matching / Findings -> Recommendations`

Workforce modules are downstream:

`Approved Target Organization + Employee Profiles -> Role Alignment -> Transition Plan`

No downstream module may silently mutate the canonical current organization.

## 17. Extraction clarification — 2026-09-23

Agreed with Full-stack 1 in this session:

- `source_refs` resolves to `sources[].source_id`. IDs must distinguish document,
  side, fragment and quoted span. Sources retain full `text`, exact `quote`,
  `start`/`end` (UTF-16 offsets), and parser-owned location. Unknown page/section
  may be omitted or null; never fabricate DOCX page numbers.
- Function `modality`: `duty`, `permission`, `prohibition`. Preserve `conditions`
  and `scope` as string or null; a prohibition must not become an executable duty.
- Unknown/ambiguous function ownership: `owner_id: null`, `owner_type: null`.
  Known `owner_type`: `unit` or `position`. Unresolved ownership is not evidence
  of a lost function. Unresolved parent/unit/reporting links may be null.
- Raw unclassified mentions must not automatically become organizational units.
- Canonical extraction may be wrapped with `contract_version`,
  `review_required: true` and `warnings`; the model lives in `organization`.
  Consumers must check warnings and completeness before interpreting absence.
- Import of BEFORE maps to `current`, AFTER to `proposed`; import does not
  approve a proposal or overwrite another organization. Extraction still
  requires review, including BEFORE.

Implementation: `src/lib/canonical-organization.ts`. Empty `positions`,
`reporting_lines` or requirements do not prove absence in the original document.

## 18. Comparison envelope — 2026-09-23

Additive integration in `src/lib/comparison.ts`, schema `comparison-v1`:

- `before`, `after`: unchanged canonical organizations, `current` and `proposed`.
- `owner_groups`: unit/position identity correspondence, with `before_ids`,
  `after_ids`, `confidence`, `reason`, `evidence_refs` and status
  `preserved | transformed | created | unmatched | needs_review`.
  Aliases refer to one owner, not a merger of different owners.
  `created` is presented as potential, scoped to supplied data.
- `matches`: shared Match shape. `after_id` can be null; one BEFORE can have
  multiple rows. Status: `matched | not_found | needs_review`. Added `confidence`
  measures certainty in the relation. `similarity` is nullable: the MVP uses
  model confidence as an equivalence proxy only for equivalent matches, otherwise
  null. It is not an embedding/cosine score.
- `findings`, `recommendations`: existing shapes and five finding types.
  Recommendations remain `proposed`, `target_changes: []`; no decisions are made.
- `unmatched_after_ids`, `warnings`, `absence_assessable`, `review_required: true`,
  `conclusion`, `comparison_id`, `model`, `created_at`: coverage/provenance.
- `document_links`: `{ document_id, side, storage_id }` because parser content
  IDs and upload UUIDs differ. Sources resolve through canonical `sources`.
  The model cannot choose download URLs or source coordinates.

Full-stack 1 does not need to change extraction-v1. Old untyped extraction must
be explicitly refreshed via `POST extract?refresh=1`. Updating extraction
invalidates comparison lookup; input/current organizations are never mutated.
Details: [COMPARISON.md](COMPARISON.md).

### Comparison completion flags — 23.09.2026

Additive fields: `analysis_complete: boolean` and `identical_sources: boolean`.
Partial model responses retain only verified references and explicit review rows;
absence findings are suppressed. Identical content bundles skip AI and do not
perform a baseline risk audit; the conclusion explains this and completeness is
false. Canonical entities and extraction-v1 are unchanged.
