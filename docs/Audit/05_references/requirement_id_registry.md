# Reference: Requirement ID Registry & Traceability Matrix

> **Source**: `Security Audit Spec v3.0` (Sections 23, Appendix L)  
> **Status**: Normative Traceability Register  

---

## 1. Requirement ID Convention

Every normative requirement in this security specification is tracked via a persistent, append-only identifier:
- Prefix `SA3-P1-xxx`: Phase 1 Core Specification (Sections 0â€“24, Appendices Aâ€“D, Hâ€“K)
- Prefix `SA3-P2-xxx`: Phase 2 Operational Specifications (Sections 25â€“46, Appendices Eâ€“G)

---

## 2. Core Traceability Matrix (Summary Highlights)

| Requirement ID | Standard File | Normative Rule Summary |
| :--- | :--- | :--- |
| `SA3-P1-001` - `003` | [principles_and_safety.md](file:///f:/Audit/01_standards/principles_and_safety.md) | Standard is project-agnostic. Check must not be marked done unless code was inspected. |
| `SA3-P1-004` - `017` | [principles_and_safety.md](file:///f:/Audit/01_standards/principles_and_safety.md) | **Principles P1 to P15**: Evidence-first, no speculation, exact locations, honest coverage. |
| `SA3-P1-018` - `028` | [principles_and_safety.md](file:///f:/Audit/01_standards/principles_and_safety.md) | **Rules of Engagement**: Non-destructive, local/test env only, prompt injection immunity. |
| `SA3-P1-029` - `047` | [step1_inventory_and_scope.md](file:///f:/Audit/02_runbook/step1_inventory_and_scope.md) | **Inventory & Denominators**: Explicit $D_{\text{inventory}}$, $D_{\text{testable}}$, $D_{\text{unknown}}$. True coverage formula. |
| `SA3-P1-056` - `059` | [state_machine_enums.md](file:///f:/Audit/01_standards/state_machine_enums.md) | **Canonical Enums**: State tuple $S = (C, R, V, F, A, E, D)$ cannot be collapsed. |
| `SA3-P1-060` - `062` | [evidence_ladder.md](file:///f:/Audit/01_standards/evidence_ladder.md) | **Evidence Model**: Provenance classes, AI inference must not pose as runtime observation. |
| `SA3-P1-063` - `064` | [data_schemas.md](file:///f:/Audit/01_standards/data_schemas.md) | **Finding Schema & Aggregation**: Parent finding cannot be `VERIFIED_FIXED` if child is open. |
| `SA3-P1-085` - `095` | [step5_quality_gate.md](file:///f:/Audit/02_runbook/step5_quality_gate.md) | **Quality Gate**: Strictest precedence: BLOCK > UNKNOWN > HOLD > CONDITIONAL > PASS. |
| `SA3-P1-096` - `101` | [profiles_and_governance.md](file:///f:/Audit/01_standards/profiles_and_governance.md) | **Separation of Duties (SoD)**: AI cannot approve FPs, accept risks, or approve release gates. |

