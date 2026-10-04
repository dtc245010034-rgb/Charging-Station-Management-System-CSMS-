# 03. Evidence Ladder & Promotion Rules

> **Source**: `Security Audit Spec v3.0` (Sections 8, 28, 29, Appendix H.1)  
> **Status**: Normative Standard  

---

## 1. The Evidence Ladder

The certainty dimension ($C$) progresses strictly up the Evidence Ladder:

```text
DISCOVERED
    â”‚   (Requires: 1 reproducible technical signal tied to artifact)
    â–¼
SUPPORTED
    â”‚   (Requires: Traced source-to-sink chain + 1 independent signal)
    â–¼
CORROBORATED
    â”‚   (Requires: Dynamic reproduction OR deterministic static proof OR 2 independent complete signals)
    â–¼
CONFIRMED
```

> [!NOTE]
> Certainty represents **degree of proof**, whereas Severity represents **impact**. A `CRITICAL` severity finding can start at `DISCOVERED` until proven.

---

## 2. Deterministic Promotion Rules (Section 28)

### 2.1 DISCOVERED $\rightarrow$ SUPPORTED
Requires at least one reproducible technical signal tied to a valid artifact and scope identity.
* *Example*: Code pattern matching an unparameterized SQL query in `db/user.py#L42` with an external argument.

### 2.2 SUPPORTED $\rightarrow$ CORROBORATED
Requires a traced security relationship (e.g. source-to-sink chain) where input from an external actor is shown reaching the vulnerable sink, plus one independent corroborating signal, while an environmental or runtime condition remains unverified.

### 2.3 CORROBORATED $\rightarrow$ CONFIRMED
Permitted when ANY of the following 3 conditions hold:
1. **Deterministic Static Proof**: The finding is structurally undeniable in static code (e.g., hardcoded private key, plaintext password in audited path, hardcoded `CORS: allow *` with credentials).
2. **Dynamic Security Test Reproduction**: A non-invasive test reproduces the vulnerability against the exact audited artifact and environment.
3. **Dual Independent Signals**: Two independent signals (e.g. independent static AST engine + human attestation, or two distinct tool engines with independent heuristics) both establish reachability and exploitability for the exact location.

### 2.4 Prohibition: No Promotion by Assertion (Anti-Hallucination)
- Natural language assertions like *"This is definitely vulnerable"* or *"An attacker could easily exploit this"* **DO NOT count as evidence** and MUST NOT promote certainty.

---

## 3. Provenance Classes & Evidence Object (Section 8.3 & 29)

Every evidence record MUST declare its provenance class:
```yaml
provenance_class:
  - RUNTIME_OBSERVED     # Captured during dynamic test execution
  - DETERMINISTIC_TOOL   # Output from compilers, linters, SAST tools, regex/AST parsers
  - STATIC_ANALYSIS      # Traced code analysis (AST / control flow)
  - AI_INFERENCE         # Deduction / reasoning by LLM (MUST be labeled as such)
  - HUMAN_ATTESTATION    # Manual review sign-off by developer or security auditor
```

### Chain of Custody Requirements
Every evidence item must record:
- **`artifact_id`**: File path, commit SHA or content hash.
- **`tool_command`**: Exact command / tool invoked (e.g., `semgrep`, `pytest`, `curl`).
- **`output_snippet`**: Sanitized output or source snippet (secrets redacted per standard).
- **`timestamp`**: Execution timestamp.
- **`actor`**: `AI`, `HUMAN`, `CI`, or `TOOL`.

---

## 4. Definition of Independent Evidence Signals (Appendix H.1)

Two evidence items are independent ONLY if they do NOT share the same root cause of error:
- Two different regexes matching the same string are **NOT** independent.
- Two LLM prompts asking the same question are **NOT** independent.
- An AST dataflow engine and a dynamic HTTP test **ARE** independent.
- A static compiler warning and a human security review **ARE** independent.

