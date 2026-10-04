# Step 3: Verification & Safe Dynamic PoC

> **Phase**: 3 / 5 (Verification & Proportional Testing)  
> **Source**: `Security Audit Specification v3.0` (Sections 12, 13, 17, 18, 36, 38, 39)  
> **Objective**: Validate whether preliminary findings can be reproduced safely or proven deterministically, promoting certainty to `CONFIRMED`.  

---

## 1. What the AI Must Do

In this step, the AI acts as the **Verification Engineer**.

```text
[Select Staged Findings (SUPPORTED / CORROBORATED)]
                          │
                          ▼
[Determine Verification Method: STATIC vs DYNAMIC vs INDEPENDENT]
                          │
                          ▼
[Design Safe, Benign Non-Destructive Test Case (Canary)]
                          │
                          ▼
[Execute Verification in Local/Test Environment]
                          │
                          ▼
[Promote Certainty to CONFIRMED on Success, or Record Obstacle as Debt]
```

---

## 2. Safety Rules & Boundaries (Section 2.1 & 36)

> [!CAUTION]
> **STRICT SAFETY ENFORCEMENT**:
> - Never execute dynamic tests against production, live customer databases, or external URLs.
> - Never use destructive payloads (`DROP TABLE`, `DELETE`, `rm -rf`, `format`).
> - Use only **benign canaries**:
>   - SQL: `UNION SELECT 'CANARY_TEST_1337', NULL...`
>   - Command: `echo CANARY_OK` or `whoami` (read-only)
>   - SSRF: Local loopback canary port or controlled mock listener
>   - File Traversal: Read non-sensitive fixed test file (e.g. `tests/fixtures/canary.txt`)

---

## 3. The 3 Paths to `CONFIRMED` Status (Section 28.3)

A finding may only be promoted to `CONFIRMED` if one of the three conditions is met:

### Path A: Deterministic Static Proof
- Applicable when the defect is structurally undeniable without runtime execution.
- *Examples*:
  - A plaintext private key or AWS secret token committed in source code (`CHK-SECRET`).
  - An exact vulnerable package version in lockfile with confirmed vulnerable function invocation (`CHK-DEP`).
  - A route explicitly annotated with `@PermitAll` or missing `@Authorize` on administrative functions.

### Path B: Dynamic Security Test Execution
- Author a dedicated security regression test case (e.g. in `tests/security/` or pytest / jest).
- Execute test against the local test harness / staging server.
- The test asserts that a benign exploit input bypasses control and yields the canary response.

### Path C: Dual Independent Signals
- When runtime testing is not possible (e.g. headless environment, missing DB fixtures), certainty can be promoted to `CONFIRMED` only if two independent analysis engines (e.g., AST taint analysis + human attestation, or two distinct tool engines) confirm reachability and exploitability.

---

## 4. Negative Testing Requirement (Section 6.2 & 35.3)

Every positive finding verified dynamically MUST be paired with a **Negative Test**:
- **Baseline / Negative Test**: Normal authorized request with valid data $\rightarrow$ Expected behavior (`HTTP 200 / valid data`).
- **Attack / Positive Test**: Tampered / unauthorized request $\rightarrow$ Successfully triggers vulnerable sink or bypasses security boundary.
- **Why**: Proves that the failure is genuine and not simply a broken environment, network failure, or generic `HTTP 500` error.

---

## 5. Security Regression Test Contract (Section 18 & 38)

For any confirmed finding, the AI should propose or create a reproducible regression test file:
```python
# tests/security/test_sec_001_sqli.py
def test_search_sqli_canary(client, auth_member_token):
    """Regression test for SEC-001: SQL injection in search parameter."""
    payload = "' UNION SELECT 'CANARY_PAYLOAD_XYZ', '2', '3' --"
    res = client.get(f"/api/v1/users/search?q={payload}", headers={"Authorization": auth_member_token})
    
    # Secure expectation: The payload is escaped/parameterized, canary is NOT returned in body
    assert "CANARY_PAYLOAD_XYZ" not in res.text, "Vulnerability SEC-001 reproduced: canary leaked into response!"
```

### Checklist for Exiting Step 3:
- [ ] Staged findings tested using safe canary payloads.
- [ ] Confirmed findings updated with `verification: DYNAMIC_VERIFIED` or `STATIC_VERIFIED`.
- [ ] Test outputs recorded with timestamps, commands, and sanitized snippets in `evidence_refs`.
- [ ] Negative test baseline verified.
- [ ] Non-reproducible or environment-blocked items recorded under Discovery Debt.
