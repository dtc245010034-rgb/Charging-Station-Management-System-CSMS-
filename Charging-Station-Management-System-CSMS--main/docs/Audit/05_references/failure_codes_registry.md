# Reference: Failure Codes & Normative Definitions

> **Source**: `Security Audit Spec v3.0` (Appendix G, Appendix H)  
> **Status**: Diagnostic & Conformance Registry  

---

## 1. Operational Failure Codes (Appendix G)

When an audit pipeline or AI self-check detects a protocol or specification violation, emit the corresponding stable diagnostic code:

| Failure Code | Description | Corrective Action |
| :--- | :--- | :--- |
| `P2-CONTRACT-001` | Canonical enum drift | Revert to canonical enum tokens (Appendix E) |
| `P2-CONTRACT-002` | Unauthorized enum alias | Replace alias with canonical term (e.g., `POTENTIAL` $\rightarrow$ `DISCOVERED`) |
| `P2-CONTRACT-003` | Invalid finding schema | Ensure all required fields in Appendix F are present |
| `P2-CONTRACT-004` | Missing location lifecycle state | Provide `remediation` state for every child in `affected_locations` |
| `P2-EVIDENCE-001` | Missing evidence provenance | Specify `provenance_class` and `actor` |
| `P2-EVIDENCE-002` | Artifact mismatch | Evidence artifact hash does not match target file |
| `P2-EVIDENCE-003` | Scope mismatch | Finding references out-of-scope files |
| `P2-EVIDENCE-004` | Stale evidence used as current | Re-verify evidence when scope changes |
| `P2-COVERAGE-001` | Mixed coverage denominator | Separate $D_{\text{inventory}}$, $D_{\text{testable}}$, and $D_{\text{unknown}}$ |
| `P2-COVERAGE-002` | Unknown counted as verified | Remove $D_{\text{unknown}}$ from verified set |
| `P2-COVERAGE-003` | Unverified endpoint without Debt | File Discovery Debt record for unverified in-scope endpoint |
| `P2-GATE-001` | Invalid unconditional PASS | True coverage $< 100\%$ cannot emit unconditional `PASS` |
| `P2-GATE-002` | Expired exception used | Revoke waiver if `expires_at` is past |
| `P2-GATE-003` | Gate outcome precedence violation | BLOCK > UNKNOWN > HOLD > PASS_WITH_CONDITIONS > PASS |
| `P2-SOD-001` | AI self-approval | Human actor required to approve FP, Risk Acceptance, or Gate |
| `P2-SOD-002` | Missing actor_type on approval | Explicitly specify `actor_type: HUMAN` |

---

## 2. Normative Definitions (Appendix H)

### 2.1 Independent Evidence Signals (H.1)
Two evidence items are independent ONLY if:
1. They originate from different collection methods or tool families.
2. Their lineage shares no common ancestor evidence.
3. Neither is a re-run of the same rule/tool on the same input.
*(Note: `AI_INFERENCE` is never independent of the AI action that produced the finding).*

### 2.2 Freshness Precedence (H.3)
When multiple freshness conditions apply simultaneously:
$$\text{UNKNOWN} > \text{STALE} > \text{EXPIRED}$$
All three states are unusable as current valid verification.

### 2.3 Allowed Actor Roles (H.5)
- **Discover / Correlate / Propose**: `AI`, `HUMAN`, `CI`, `TOOL`
- **Execute Automated Tests**: `CI`, `TOOL`, `HUMAN`
- **Mark Independently Verified**: `HUMAN`, `CI` (distinct from discovering actor)
- **Approve FP / Accepted Risk / Waivers**: `HUMAN` only
- **Approve Release Gate**: `HUMAN` only

