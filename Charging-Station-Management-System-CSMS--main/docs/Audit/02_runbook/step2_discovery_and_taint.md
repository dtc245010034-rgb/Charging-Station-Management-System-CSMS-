# Step 2: Vulnerability Discovery & Taint Analysis

> **Phase**: 2 / 5 (Static Analysis & Heuristics)  
> **Source**: `Security Audit Specification v3.0` (Sections 4, 6, 11, 12, 33, 35, 37)  
> **Catalogs Reference**: Tra cứu danh mục trong `03_catalogs/`  
> **Objective**: Identify vulnerabilities through source-to-sink data flow tracing, AST analysis, and security pattern matching.  

---

## 1. What the AI Must Do

In this step, the AI acts as the **Vulnerability Hunter & Taint Analyzer**.

```text
[Select Check Category from 03_catalogs/]
                   │
                   ▼
[Trace Attacker Input (Source) to Dangerous Execution (Sink)]
                   │
                   ▼
[Inspect Sanitizers, Filters & Compensating Controls (P9)]
                   │
                   ▼
[Assign Initial Certainty: DISCOVERED or SUPPORTED]
                   │
                   ▼
[Draft Finding Objects in finding_artifact.json]
```

---

## 2. Core Methodologies

### 2.1 Source-to-Sink Analysis (Section 6.1)
For every entry point discovered in Step 1:
1. **Source**: Trace where user-controlled input enters (`req.body`, `req.query`, URL parameters, HTTP headers, file streams, webhook payloads).
2. **Transformations**: Track data transformations, decodings, concatenations, or JSON parsing.
3. **Compensating Controls (P9)**: Check if validation libraries, schema checkers (e.g. Zod, Pydantic), type coercions, or escaping occurred.
4. **Sink**: Observe where the variable terminates:
   - Database queries (`cursor.execute`, ORM raw queries) $\rightarrow$ SQL Injection (`CHK-INJ`)
   - OS process execution (`exec`, `spawn`, `popen`) $\rightarrow$ Command Injection (`CHK-INJ`)
   - HTTP clients (`requests.get`, `fetch`) $\rightarrow$ SSRF (`CHK-SSRF`)
   - File system access (`fs.readFile`, `open`) $\rightarrow$ Path Traversal (`CHK-FILE`)
   - HTML / Template rendering $\rightarrow$ XSS (`CHK-XSS`)
   - Object deserialization (`pickle`, `unserialize`, `yaml.load`) $\rightarrow$ Insecure Deserialization (`CHK-DESER`)

### 2.2 Category Reference Matrix
Use the corresponding catalog file in `03_catalogs/` for specific indicators, false-positive filters, and severity anchors:
- [01_auth_session_tenancy.md](file:///f:/Audit/03_catalogs/01_auth_session_tenancy.md): AuthN, AuthZ, IDOR, Session, Multi-tenancy.
- [02_injection_data_handling.md](file:///f:/Audit/03_catalogs/02_injection_data_handling.md): SQLi, Command Injection, SSRF, Path Traversal, Deserialization, XSS, CSRF, CORS.
- [03_crypto_and_secrets.md](file:///f:/Audit/03_catalogs/03_crypto_and_secrets.md): Weak ciphers, Hardcoded secrets, API tokens.
- [04_logic_race_logging.md](file:///f:/Audit/03_catalogs/04_logic_race_logging.md): Race conditions (TOCTOU), Business logic, Sensitive data logging.
- [05_deps_supply_cicd_iac.md](file:///f:/Audit/03_catalogs/05_deps_supply_cicd_iac.md): SCA, Vulnerable packages, Dockerfile, CI workflows.
- [06_api_and_llm.md](file:///f:/Audit/03_catalogs/06_api_and_llm.md): API rate limits, Prompt injection, Tool misuse.

### 2.3 Anti-Hallucination Constraints (Section 14 & Principle P2)
- **No Speculation**: A dangerous function name alone (e.g. `eval`) is NOT a finding if the argument is a hardcoded internal constant.
- **Reachability (P8)**: An unparameterized SQL function in an internal dead test utility that is never imported or reachable by an actor is NOT a high-severity finding.
- **Do not invent CVEs**: When flagging third-party dependencies, only cite official CVE / GHSA identifiers with verified version ranges.

---

## 3. Required Output of Step 2

A list of preliminary findings with:
- `certainty`: `DISCOVERED` or `SUPPORTED` (or `CONFIRMED` only for deterministic proof like hardcoded secrets).
- Exact `affected_locations`: File path, start line, end line, symbol.
- Step-by-step description of the `data_flow` from source to sink.
- Preliminary CVSS score and severity.

### Checklist for Exiting Step 2:
- [ ] All in-scope entry points evaluated against applicable categories.
- [ ] Source-to-sink paths documented with line numbers.
- [ ] Compensating controls inspected before classifying.
- [ ] Findings staged for Step 3 (Verification).
