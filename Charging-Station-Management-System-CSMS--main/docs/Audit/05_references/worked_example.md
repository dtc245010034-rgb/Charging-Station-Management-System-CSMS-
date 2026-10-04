# Reference: Worked Example (Illustrative)

> **Source**: `Security Audit Spec v3.0` (Appendix K)  
> **Status**: Educational & Architectural Pattern Reference  

---

## 1. Illustrative Confirmed Finding (`finding_artifact.json`)

```yaml
finding_id: "SEC-001"
title: "SQL injection in user search through string-built query"
certainty: "CONFIRMED"
remediation: "OPEN"
verification: "DYNAMIC_VERIFIED"
freshness: "CURRENT"
severity: "HIGH"
confidence_note: "Canary payload changed query behavior against the exact audited artifact in a local test environment."

cvss:
  version: "3.1"
  vector: "CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:N"
  score: "8.1"

category: "Injection"
check_ids: ["CHK-INJ"]
cwe: "CWE-89"
affected_contexts: ["user-service"]
affected_locations:
  - location_id: "LOC-01"
    path: "services/user/repo.py"
    start_line: 55
    end_line: 58
    symbol: "search_users"
    remediation: "OPEN"
    evidence_ref: "EV-001"
    artifact_identity: "repo@example-tree-id"
    scope_identity: "sha256:example-scope"
  - location_id: "LOC-02"
    path: "services/user/export.py"
    start_line: 31
    end_line: 31
    symbol: "export_users"
    remediation: "OPEN"
    evidence_ref: "EV-002"
    artifact_identity: "repo@example-tree-id"
    scope_identity: "sha256:example-scope"

reachability: "GET /users/search reachable by any authenticated user"
data_flow: "request.query.q -> search_users(q) -> f-string SQL -> cursor.execute"
compensating_controls: []
evidence_refs: ["EV-001", "EV-002"]
root_cause: "Query text is assembled with string formatting instead of bound parameters."
recommended_remediation: "Use bound parameters at both locations; add negative and positive regression tests."
related_test_cases: ["SEC-TC-001"]
exception_ref: null
```

---

## 2. Accompanying Evidence Record

```yaml
evidence:
  - evidence_id: "EV-001"
    provenance_class: "RUNTIME_OBSERVED"
    verification_method: "DYNAMIC"
    tool_command: "pytest tests/security/test_sqli.py"
    executed_at: "2026-09-29T09:12:00Z"
    actor: "CI"
    artifact_identity: "repo@example-tree-id"
    sanitized_snippet: "cursor.execute(f'SELECT * FROM users WHERE name LIKE {query}')"
    raw_output: "AssertionError: Canary 'SQLI_CANARY_TEST' observed in response"
```

