# Security Audit Report: [Target Project Name]

> **Audit Run ID**: `RUN-YYYY-MM-DD-XX`  
> **Date**: `YYYY-MM-DD`  
> **Auditor**: `AI Security Auditor (Profile C / Advisory)`  
> **Applicability Mode**: `AUDIT_ONLY` (Advisory) | `RELEASE_GATING` (Binding)  

---

## 1. Executive Summary & Quality Gate Verdict

### Quality Gate Decision: **[ BLOCK | HOLD | PASS_WITH_CONDITIONS | PASS | WAIVED ]**
*(Note: Decision is ADVISORY in Audit-Only mode)*

### Summary Metrics:
| Metric | Count / Value |
| :--- | :--- |
| **Total In-Scope Endpoints** | XX |
| **Endpoint Coverage (True Coverage)** | XX.X% |
| **Critical Findings (Open)** | X |
| **High Findings (Open)** | X |
| **Medium Findings (Open)** | X |
| **Low / Informational Findings** | X |
| **Active Discovery Debts** | X |
| **Active Authorized Waivers** | X |

---

## 2. In-Scope Inventory & Attack Surface

- **Repository / Git Hash**: `git:xxxxxxxx`
- **Tech Stack**: [Languages, Frameworks, DBs]
- **Key Entry Points**:
  - `POST /api/v1/auth/login` (Public)
  - `GET /api/v1/users/{id}` (Authenticated)
- **Discovery Debt Items**:
  - `[DD-001]` Title - Owner: `[team]` - Blocking effect: `[NONE]`

---

## 3. Findings Detailed Log

### [SEC-001] Title of Vulnerability
- **Severity**: `CRITICAL` | `HIGH` | `MEDIUM` | `LOW`
- **State Tuple**: $S = (C=\text{CONFIRMED}, R=\text{OPEN}, V=\text{DYNAMIC\_VERIFIED}, F=\text{CURRENT})$
- **CWE / OWASP**: `CWE-89` / `A03:2021-Injection`
- **Affected Location**: `src/services/user_search.py:42-45`
- **Data Flow**: `HTTP query param 'q' -> search_users() -> raw SQL -> execute()`
- **Impact**: Arbitrary database extraction.
- **Evidence Ref**: `EV-001` (Reproduced via test suite)
- **Remediation**: Parameterize SQL query using ORM or DB-API placeholders.

*(Repeat for each finding)*

---

## 4. Coverage & Honesty Statement (Principle P10)

- **Inspected & Verified**: [List components thoroughly analyzed]
- **Not Tested / Excluded**: [List areas omitted, third-party libraries, mock folders]
- **Limitations**: [Document any tool access limitations or uninspected paths]

---

## 5. Next Steps & Recommended Action Plan

1. **Immediate (P0)**: Patch confirmed CRITICAL and HIGH findings.
2. **Short-Term (P1)**: Resolve Discovery Debt items before next release cycle.
3. **Defense-in-Depth (P2)**: Implement missing rate limits and security headers.

