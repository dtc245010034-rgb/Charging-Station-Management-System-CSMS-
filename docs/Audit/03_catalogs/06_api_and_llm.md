# Security Catalog: API Resilience & AI/LLM Systems

> **Category Code**: `CAT-API-LLM`  
> **Source**: `Security Audit Spec v3.0` (Appendix I: CHK-API, CHK-LLM)  

---

## 1. CHK-API â€” API Security & Resilience

### What to Look For:
- **Excessive Data Exposure**: Endpoints serializing entire DB models directly to JSON (exposing password hashes, internal IDs, deleted records).
- **Missing Pagination & Resource Limits**: Unbounded queries allowing clients to request `limit=1000000` or no pagination, causing Denial of Service (DoS) / memory exhaustion.
- **Unauthenticated Internal / Debug Endpoints**: Hidden management routes (`/debug`, `/actuator`, `/swagger`, `/internal/metrics`) exposed publicly.
- **Mass Assignment**: Automatic binding of request body directly to internal data models without field allow-lists.

### How to Prove:
- **`SUPPORTED`**: API schema or handler code serializes private model fields or lacks limit parameters.
- **`CONFIRMED`**: API endpoint returns unauthorized fields or crashes under high page-size request in test environment.

### Severity Anchors:
- Sensitive PII or credential exposure in API response $\rightarrow$ `HIGH`.
- Missing pagination on public endpoints (DoS risk) $\rightarrow$ `MEDIUM`.

---

## 2. CHK-LLM â€” AI & Large Language Model Integrations

### What to Look For:
- **Direct & Indirect Prompt Injection**: Untrusted user input or external web data concatenated into system prompts without boundaries, capable of overriding system instructions.
- **Insecure Tool Execution (Excessive Agency)**: LLM agents granted access to sensitive tools (file deletion, database execution, email dispatch) without human confirmation or strict argument validation.
- **Unsanitized Model Output**: Passing LLM output directly into code execution sinks (`eval()`, SQL queries, OS shell) or rendering raw HTML (LLM-driven XSS).
- **System Prompt & Secret Leakage**: Prompts instructing the model with internal API keys, passwords, or intellectual property without output filtering.
- **Denial of Wallet / Resource Exhaustion**: Unbounded LLM inference calls without token limits, timeouts, or cost quotas.

### How to Prove:
- **`SUPPORTED`**: Untrusted user string placed into a prompt template that has access to high-privilege functions or database execution.
- **`CONFIRMED`**: Benign canary injection (e.g., prompt payload requesting canary string output) successfully overrides instructions or triggers unauthorized tool call in test environment.

### Not a Finding When:
- Model output is treated as untrusted text, has no tool-calling capability, and is safely escaped.

### Severity Anchors:
- Prompt injection leading to database modification, shell execution, or data exfiltration $\rightarrow$ `HIGH` / `CRITICAL`.
- Model output manipulation of plain text content only $\rightarrow$ `LOW` / `MEDIUM`.

