# Step 5: Quality Gate & Audit Reporting

> **Phase**: 5 / 5 (Verdict & Final Report)  
> **Source**: `Security Audit Specification v3.0` (Sections 4.4, 14, 16, 18, 21, 40, 41, 45, 46)  
> **Objective**: Evaluate the strict Quality Gate rules, compute coverage statistics, formulate the gate verdict, and render the final Audit Report.  

---

## 1. What the AI Must Do

In this final step, the AI acts as the **Security Auditor & Gate Evaluator**.

```text
[Aggregate Inputs: Findings, Coverage, Debts, Waivers]
                          │
                          ▼
[Execute Gate Decision Precedence Hierarchy]
                          │
                          ▼
[Apply Invariant Safety Rules: UNKNOWN != PASS]
                          │
                          ▼
[Render Final Report: audit_report.md]
```

---

## 2. Gate Decision Precedence (Section 16.3 & 41)

When evaluating gate inputs, the strictest triggered decision always wins:

$$\text{BLOCK} > \text{UNKNOWN} > \text{HOLD} > \text{PASS\_WITH\_CONDITIONS} > \text{WAIVED} > \text{PASS}$$

### Decision Rules:
| Condition | Decision | Explanation |
| :--- | :--- | :--- |
| **Confirmed CRITICAL or HIGH unresolved** (and no valid waiver) | **BLOCK** | Immediate stop-ship. Vulnerabilities must be patched before release. |
| **Confirmed exposed secret requiring rotation** | **BLOCK** | Secret leak requires immediate invalidation & rotation. |
| **Critical Discovery Debt affecting security boundary** | **BLOCK / HOLD** | Cannot guarantee safety of an uninspected authentication/trust boundary. |
| **High unresolved unknown with missing evidence** | **HOLD** | Requires additional test environment / credentials to determine outcome. |
| **Medium / Low unresolved findings** (with assigned SLA) | **PASS_WITH_CONDITIONS** | Permitted with documented remediation ticket and target fix date. |
| **Open findings covered by active, unexpired waiver** | **WAIVED** | Permitted by formal authorized exception with compensating controls. |
| **100% testable verified & zero blocking findings/debts** | **PASS** | Full clean assurance achieved. |

---

## 3. Normative Safety Rules (Section 16.4)

> [!CAUTION]
> The AI MUST remember the core safety equivalences:
> - `UNKNOWN != PASS` (Absence of findings is NOT proof of safety).
> - `NOT_TESTED != SAFE`
> - `STALE != CURRENT`
> - `WAIVED != PASS` (A waiver is an accepted operational risk, not a clean pass).

### Coverage Invariant (Section 5.5)
- If Endpoint Coverage is less than 100%, **`PASS` MUST NOT be emitted**.
- Any unverified in-scope endpoint requires an explicit Discovery Debt record (`DD-xxx`). If all unverified endpoints have documented debt records with non-blocking effects, the maximum permissible decision is `PASS_WITH_CONDITIONS`.

---

## 4. Applicability Mode Tagging (Section 0.4)

- In **Audit-Only Mode** (Default):
  - Mark the Gate Decision prominently as:  
    `GATE DECISION (ADVISORY): BLOCK` or `HOLD` or `PASS_WITH_CONDITIONS`.
- In **Release-Gating Mode**:
  - Mark as:  
    `GATE DECISION (BINDING): BLOCK` or `HOLD` or `PASS`.

---

## 5. Self-Check Before Finalization (Section 18 & 45)

Before outputting `audit_report.md`, the AI must self-verify:
1. Every `CONFIRMED` finding has an exact file path and line number.
2. No secret, private key, or password is exposed in the report text (all redacted as `[REDACTED]`).
3. No hallucinated CVE numbers are cited.
4. No finding is claimed as `DYNAMIC_VERIFIED` unless actual test execution was run.
5. All 15 Core Principles (P1–P15) are respected.

### Final Output:
Generate `audit_report.md` following [audit_report_template.md](file:///f:/Audit/04_templates/audit_report_template.md).
