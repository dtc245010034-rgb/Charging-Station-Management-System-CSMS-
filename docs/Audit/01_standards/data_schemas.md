# 04. Data Schemas & Contracts

> **Source**: `Security Audit Spec v3.0` (Sections 9, 25, 27, Appendix F)  
> **Status**: Normative Schema Specification  

---

## 1. Security Finding Data Model

Every security finding identified during an audit MUST conform to the canonical schema below.

```yaml
finding_id: "SEC-001"                 # Unique identifier: SEC-XXX
title: "SQL Injection in User Search" # Clear, concise vulnerability description
certainty: "CONFIRMED"                # DISCOVERED | SUPPORTED | CORROBORATED | CONFIRMED
remediation: "OPEN"                   # OPEN | IN_PROGRESS | FIXED_PENDING_VERIFY | VERIFIED_FIXED | REOPENED | ACCEPTED_RISK | FALSE_POSITIVE | ACCEPTED_BY_DESIGN
verification: "DYNAMIC_VERIFIED"      # NOT_TESTED | STATIC_VERIFIED | DYNAMIC_VERIFIED | INDEPENDENTLY_VERIFIED | NOT_APPLICABLE
freshness: "CURRENT"                  # CURRENT | STALE | EXPIRED | UNKNOWN
severity: "HIGH"                      # CRITICAL | HIGH | MEDIUM | LOW | INFORMATIONAL
confidence_note: "Reproduced via canary test in local environment"

cvss:
  version: "3.1"
  vector: "CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:N"
  score: 8.1

category: "INJECTION"                 # Canonical category
check_ids: ["CHK-INJ"]                # Check catalog ID(s)
owasp_mapping: "A03:2021-Injection"
cwe: "CWE-89"

affected_contexts: ["user_service", "search_api"]
affected_locations:                   # At least 1 location required
  - location_id: "LOC-01"
    path: "services/user/search.py"
    start_line: 45
    end_line: 48
    symbol: "search_users"
    remediation: "OPEN"
    evidence_ref: "EV-001"
    artifact_identity: "sha256:abcd1234..."
    scope_identity: "scope:user_service@git_sha"

audited_artifact: "services/user/search.py"
scope_identity: "scope:user_service@git_sha"
preconditions: "Authenticated user with role 'member'"
reachability: "Directly reachable via GET /api/v1/users/search?q="
data_flow: "HTTP Query Param 'q' -> search_users(q) -> raw SQL string formatting -> cursor.execute()"
compensating_controls: []
evidence_refs: ["EV-001", "EV-002"]

description: "User search query is directly formatted into an unparameterized SQL statement."
security_impact: "Unauthorized read of complete database table; possible privilege escalation."
attack_scenario: "Attacker supplies ' OR 1=1 -- in the query parameter to dump arbitrary user records."
root_cause: "Use of Python f-string instead of parameterized DB-API cursor arguments."
recommended_remediation: "Use parameterized queries: cursor.execute('SELECT * FROM users WHERE name = %s', (query,))"

related_requirements: ["REQ-SEC-DATA-01"]
related_test_cases: ["TC-SEC-INJ-01"]
related_findings: []
exception_ref: null
created_at: "2026-09-29T09:00:00Z"
updated_at: "2026-09-29T09:15:00Z"
```

---

## 2. Parent / Child Remediation Aggregation Rule (Section 27)

When a finding encompasses multiple locations (`affected_locations`):
- The `remediation` state at the root finding is a **derived aggregate** and MUST NOT overwrite child states.
- **Rule 1**: A parent finding is `VERIFIED_FIXED` **if and only if** every child location is in a terminal state (`VERIFIED_FIXED`, `ACCEPTED_RISK`, `FALSE_POSITIVE`, `ACCEPTED_BY_DESIGN`) AND at least one child is `VERIFIED_FIXED`.
- **Rule 2**: If ANY child location is `OPEN`, `IN_PROGRESS`, `FIXED_PENDING_VERIFY`, or `REOPENED`, the parent finding MUST NOT be marked `VERIFIED_FIXED`.
- **Rule 3**: If ALL child locations are `FALSE_POSITIVE`, the parent finding is `FALSE_POSITIVE`.

---

## 3. Evidence Object Schema (Section 25.2)

```yaml
evidence_id: "EV-001"
finding_ref: "SEC-001"
provenance_class: "RUNTIME_OBSERVED"   # RUNTIME_OBSERVED | DETERMINISTIC_TOOL | STATIC_ANALYSIS | AI_INFERENCE | HUMAN_ATTESTATION
verification_method: "DYNAMIC"         # STATIC | DYNAMIC | NONE
tool_command: "pytest tests/security/test_sqli.py"
executed_at: "2026-09-29T09:10:00Z"
actor: "CI"                           # AI | HUMAN | CI | TOOL
artifact_identity: "sha256:abcd1234..."
raw_output: "FAILED tests/security/test_sqli.py::test_user_search_sqli - AssertionError: Canary string leaked"
sanitized_snippet: "cursor.execute(f'SELECT * FROM users WHERE name = {query}')"
```

---

## 4. Minimum JSON Schema Contract (Appendix F)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "SecurityFinding",
  "type": "object",
  "required": [
    "finding_id",
    "title",
    "severity",
    "certainty",
    "remediation",
    "verification",
    "freshness",
    "affected_locations",
    "evidence_refs"
  ],
  "properties": {
    "finding_id": { "type": "string" },
    "title": { "type": "string" },
    "certainty": { "enum": ["DISCOVERED", "SUPPORTED", "CORROBORATED", "CONFIRMED"] },
    "remediation": { "enum": ["OPEN", "IN_PROGRESS", "FIXED_PENDING_VERIFY", "VERIFIED_FIXED", "REOPENED", "ACCEPTED_RISK", "FALSE_POSITIVE", "ACCEPTED_BY_DESIGN"] },
    "verification": { "enum": ["NOT_TESTED", "STATIC_VERIFIED", "DYNAMIC_VERIFIED", "INDEPENDENTLY_VERIFIED", "NOT_APPLICABLE"] },
    "freshness": { "enum": ["CURRENT", "STALE", "EXPIRED", "UNKNOWN"] },
    "severity": { "enum": ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFORMATIONAL"] },
    "affected_locations": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["location_id", "path", "remediation"],
        "properties": {
          "location_id": { "type": "string" },
          "path": { "type": "string" },
          "start_line": { "type": "integer" },
          "end_line": { "type": "integer" },
          "remediation": { "type": "string" }
        }
      }
    }
  }
}
```

