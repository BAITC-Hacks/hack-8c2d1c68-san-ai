# PRODUCT_SPEC

**Version:** 0.1  
**Status:** Current  
**Updated:** 2026-09-23  
**Owner:** Product / Captain  

This file is the current product source of truth. Historical snapshots in `docs/spec-history/` are for reference only and are not current implementation requirements.

## 1. Product vision

SAN.AI is an AI Organization Design Copilot that helps a company:

1. understand the current organizational structure and functions;
2. compare organizational states before and after reorganization;
3. detect structural and functional risks;
4. propose a target organization;
5. let a human review, edit, accept or reject recommendations;
6. after target organization approval, analyze people-to-role alignment;
7. form a transition plan from the current state to the approved target state.

The system does not automatically approve organizational or personnel decisions. AI outputs are recommendations that require human review.

## 2. Hackathon MVP boundary

The hackathon case requires the system to compare organizational and functional documents, identify reorganized, preserved and created units, detect potential loss and duplication of functions, highlight potential conflicts, show evidence from source documents and form an analytical conclusion.

Priority flow for the hackathon:

`BEFORE documents -> AFTER documents -> extraction -> comparison -> findings -> evidence -> recommendations`

Everything after target-organization approval is product vision unless the core MVP is already stable.

## 3. Two main product modes

### 3.1. Compare & Reorganize

The user provides two organizational states:

- BEFORE organization documents;
- AFTER organization documents.

The system:
- reconstructs both organizational models;
- compares units, positions, functions and responsibilities;
- classifies changes;
- highlights risks;
- gives evidence for each conclusion;
- proposes corrective recommendations.

Questions answered:
- What changed?
- What was preserved?
- What was transferred?
- What may have been lost?
- What is duplicated?
- Where may responsibilities conflict?
- What should be reviewed or corrected?

### 3.2. Design from Current State

The user provides only the current organization.

The system:
- reconstructs the current model;
- identifies gaps, duplication, missing ownership and potential conflicts;
- proposes one or more target-organization scenarios;
- explains the reasoning and evidence behind each proposal.

This mode is product vision and is not required for the core hackathon flow.

## 4. Product state model

A proposed structure must never automatically overwrite the current organization.

States:

`CURRENT -> PROPOSED -> REVIEWED -> APPROVED`

### CURRENT

The currently valid organizational state and source of truth.

### PROPOSED

An AI-generated target organization or change set. It does not modify CURRENT.

### REVIEWED

The user has reviewed recommendations and can:
- accept;
- reject;
- modify;
- comment.

Recommendations can be reviewed individually.

### APPROVED

Only an explicit user action creates an approved target state.

Example:

`Organization v8 -> AI Proposal -> User edits -> Approved -> Organization v9`

The system should preserve the decision trail:
- AI proposal;
- user decision;
- user modification if any;
- final approved state.

## 5. Guided user flows

### Flow A. Compare current and proposed states

1. Upload BEFORE documents.
2. Upload AFTER documents.
3. Analyze both sets.
4. Show structural and functional differences.
5. Show findings and evidence.
6. Generate recommendations.
7. Build Proposed Target Organization.
8. User reviews, edits, accepts or rejects recommendations.
9. User explicitly approves the target organization.
10. System offers the next step: Workforce Alignment.

### Flow B. Improve current organization

1. Upload CURRENT organization documents.
2. Analyze current organization.
3. Detect risks and organizational gaps.
4. Generate one or more proposed target scenarios.
5. User reviews and edits proposals.
6. User approves one target scenario.
7. System offers Workforce Alignment.

### Flow C. Full upload

The user may upload organization and people data at the beginning.

The system may ingest all data early, but the logical decision sequence remains:

`Organization analysis -> Target organization -> Human approval -> People analysis`

Personnel recommendations must not be treated as final before the target structure is approved.

## 6. Organization Intelligence layer

Supported source categories:
- organizational structure;
- regulations and department charters;
- job descriptions;
- administrative orders and appendices;
- internal normative documents;
- Word, PDF and Excel files where supported.

The extracted canonical model should support:
- units;
- parent-child hierarchy;
- positions;
- functions;
- responsibilities;
- role requirements;
- reporting lines;
- source references.

Each extracted fact must preserve traceability to its source.

## 7. Change classification

Minimum finding types:

### Preserved
The function remains materially unchanged.

### Transferred
The function is preserved but ownership moves to another organizational unit or role.

### Lost
A function existed before but no reliable equivalent is found after reorganization.

### Duplicated
A materially equivalent function is assigned to multiple owners.

### Conflict
Potentially incompatible responsibilities may exist in the same unit or role.

Lost, Duplicated and Conflict must be presented as potential findings for human review, not as definitive legal or management conclusions.

## 8. Evidence model

Every material conclusion should contain:
- finding type;
- risk level;
- related unit or units;
- related function or functions;
- confidence;
- short explanation;
- BEFORE evidence;
- AFTER evidence when applicable;
- source document;
- section, paragraph or fragment;
- original source text.

The user must be able to open the evidence behind a finding.

## 9. Recommendation layer

After findings, the system may propose:
- assigning an owner to an uncovered function;
- transferring ownership;
- removing functional duplication;
- separating potentially conflicting responsibilities;
- changing the placement of a function;
- creating, merging or changing a unit where supported by available evidence.

Recommendations remain PROPOSED until explicit user approval.

The product should distinguish:
- detected fact;
- AI inference;
- recommendation;
- approved decision.

## 10. Target Organization

The target organization is a proposed or approved organizational model containing:
- units;
- positions;
- functions;
- role ownership;
- reporting lines;
- role requirements.

The system should support future scenario comparison, for example:
- Scenario A: minimal changes;
- Scenario B: consolidation;
- Scenario C: functional specialization.

For the hackathon MVP, one proposed scenario is sufficient.

## 11. Workforce Alignment

Workforce Alignment starts after a target organization exists.

Goal: evaluate how existing employees align with target roles and identify skill or experience gaps.

The AI does not make final hiring, dismissal, transfer or promotion decisions. It supports HR and management review.

### 11.1. Employee input methods

#### Manual input
- name;
- current position;
- unit;
- experience;
- skills;
- certificates;
- other relevant professional information.

#### File import
- CSV;
- XLSX;
- PDF;
- DOCX;
- CVs;
- HR exports;
- staff schedules;
- employee profiles.

#### Enterprise integrations

Future adapters may include:
- 1C;
- SAP or SAP SuccessFactors;
- Workday;
- Oracle HCM;
- internal HRIS;
- internal corporate databases.

#### External professional-profile sources

Only where legally, technically and contractually available.

No external profile integration should be treated as guaranteed unless access is confirmed.

## 12. Role requirements

Role requirements may come from:
- approved target organization;
- job description;
- position profile;
- internal regulations;
- qualification requirements;
- professional standards where supplied.

The extraction model should therefore support:
- position;
- qualification;
- experience;
- skill;
- responsibility;
- certification;
- language or other role-specific requirements.

## 13. People-to-Role analysis

The preferred output is not a single opaque fit score.

The system should produce an explainable Role Gap Analysis:
- matched requirements;
- partially matched requirements;
- missing requirements;
- relevant experience;
- development gaps;
- confidence and evidence;
- recommendation for consideration.

Example:

`Suitable for consideration. Development gap: advanced data analytics.`

Final personnel decisions remain with authorized people.

## 14. Transition Plan

After target organization and workforce analysis, the product may form a transition plan.

### Organizational actions
- create, change or merge units;
- transfer functions;
- remove duplication;
- assign missing ownership.

### Workforce actions
- potential internal candidates;
- roles without a strong internal match;
- development needs;
- roles that may require external hiring.

Change path:

`CURRENT -> TARGET -> PEOPLE ALIGNMENT -> TRANSITION PLAN`

## 15. Data input strategy

Organization input and people input are logically separate.

The product must support:
- organization-only analysis;
- people data added after target organization approval;
- full upload in advance.

People data may be ingested before approval, but the system must not persist personnel recommendations as final decisions until the target organization is approved.

## 16. Persistence rules

The data model should separate:
- `current_organization`;
- `organization_analysis`;
- `proposed_scenario`;
- `recommendation`;
- `recommendation_decision`;
- `approved_target_organization`;
- `employee_profile`;
- `role_requirement`;
- `role_alignment`;
- `transition_plan`.

A proposal is never equal to the current or approved state until explicit approval.

## 17. Hackathon demo scenario

Recommended demo:

1. Upload regulation revision 8 as BEFORE.
2. Upload regulation revision 9 as AFTER.
3. Detect new units and preserved units.
4. Show redistribution of functions between organizational owners.
5. Show evidence from exact source fragments.
6. Show recommendations.
7. Optionally preview the next product layer: Target Organization and Workforce Alignment.

## 18. Out of scope for the current MVP unless core is complete

- live 1C integration;
- live SAP, Workday or Oracle HCM integration;
- external professional-profile integration;
- automatic updates to corporate HR systems;
- automatic personnel reassignment;
- automatic approval of recommendations;
- full production authorization;
- enterprise workflow engine;
- complete regulatory compliance engine;
- multi-scenario UI.

## 19. Acceptance criteria for the core

The core is ready when:
- BEFORE and AFTER documents can be ingested;
- organizational units and functions are extracted;
- each extracted function keeps source evidence;
- units are matched across versions;
- functions are matched across versions;
- the system identifies meaningful changes;
- Lost, Duplicated and Transferred are demonstrable;
- potential Conflict is explainable;
- findings are visible in UI;
- evidence can be opened;
- recommendations are separate from facts;
- recommendations do not modify CURRENT automatically;
- the end-to-end scenario runs reproducibly from README.

## 20. Product principle

The product is not an autonomous organization decision-maker.

It is a human-in-the-loop decision-support system:

`Understand -> Compare -> Diagnose -> Design -> Review -> Approve -> Align People -> Transition`
