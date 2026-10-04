# 05. Profiles, Separation of Duties & Governance

> **Source**: `Security Audit Spec v3.0` (Sections 19, 20, 21, 22, 42, 43, 44)  
> **Status**: Normative Governance Specification  

---

## 1. Operational Profiles

v3.0 defines three operational tiers based on team scale and risk tolerance:

| Profile | Target Audience | Separation of Duties (SoD) | Authority Requirements |
| :--- | :--- | :--- | :--- |
| **Profile C (Solo)** | Individual dev / small team | Minimal: One person may perform multiple roles | Advisory mode default; explicit recorded approvals |
| **Profile B (Agile)** | Standard engineering teams | Standard: AI discovers, CI verifies, Dev fixes, Lead reviews | Human review on high findings; release owner approves |
| **Profile A (Enterprise)** | Safety-critical / regulated | Strict: Formal cryptographic sign-offs, independent review | Independent verifier; formal waiver committee |

---

## 2. AI Separation-of-Duties (SoD) Invariants (Section 19.4)

> [!CAUTION]
> **AI CANNOT APPROVE ITS OWN FINDINGS OR GATE DECISIONS.**  
> The following 5 actions **MUST NOT** be performed by an AI acting as the sole authority:

1. **Marking False Positives**: AI cannot set remediation to `FALSE_POSITIVE` or `ACCEPTED_BY_DESIGN` without human concurrence.
2. **Accepting Risk**: AI cannot set remediation or discovery debt to `ACCEPTED_RISK`.
3. **Creating or Approving Waivers**: AI cannot generate or sign an `exception_id` / waiver.
4. **Authorizing Gate Release**: AI cannot convert an unresolved `BLOCK` or `HOLD` into `PASS` or release approval.
5. **Self-Independent Verification**: AI cannot mark its own evidence as `INDEPENDENTLY_VERIFIED`.

---

## 3. Discovery Debt Contract (Section 21 & 40)

Discovery Debt tracks areas of the system that are known/suspected to exist but cannot currently be inspected, parsed, or verified.

### 3.1 Canonical Schema
```yaml
debt_id: "DD-001"
title: "Dynamic Plugin Route Uninspected"
asset_id: "plugin_engine"
context_id: "core_runtime"
severity: "HIGH"                        # CRITICAL | HIGH | MEDIUM | LOW | INFORMATIONAL
reason: "Routes dynamically evaluated via eval/importlib at runtime"
owner: "team-platform"
created_at: "2026-09-29T09:00:00Z"
sla: "P14D"                             # e.g., 14 days
blocking_effect: "HOLD"                 # NONE | HOLD | BLOCK
required_action: "Provide static plugin manifest or test harness"
evidence_refs: ["EV-DEBT-01"]
status: "OPEN"                          # OPEN | IN_PROGRESS | RESOLVED | ACCEPTED_RISK
```

### 3.2 Blocking Effect Rules
- `CRITICAL` (at essential security boundary) $\rightarrow$ **BLOCK**
- `CRITICAL` (other) / `HIGH` $\rightarrow$ **HOLD**
- `MEDIUM` / `LOW` $\rightarrow$ **NONE** (yields `PASS_WITH_CONDITIONS` with SLA)
- `INFORMATIONAL` $\rightarrow$ **NONE**

---

## 4. Exceptions and Waivers (Section 22 & 42)

### 4.1 Schema
```yaml
exception_id: "EX-001"
finding_refs: ["SEC-001"]
decision: "WAIVED"
reason: "Legacy internal tool behind VPN; migration scheduled for Q4"
scope: "internal_tool_v1"
approved_by: "sec-lead@company.com"
approved_at: "2026-09-29T09:00:00Z"
expires_at: "2026-12-31T23:59:59Z"
compensating_controls:
  - "Firewall restricts access to CIDR 10.0.0.0/24"
  - "Mutual TLS client authentication enforced"
review_trigger: "Network boundary change or major version release"
```

### 4.2 Rules of Audit Integrity
- **No Erasure**: An exception does NOT delete or hide the finding. The finding remains in the graph with its original severity and certainty.
- **Expiry**: When `expires_at` is reached, the waiver becomes invalid immediately and the finding reverts to its active blocking effect.
- **Authority**: Must be approved by an authorized Human role, never an AI.

