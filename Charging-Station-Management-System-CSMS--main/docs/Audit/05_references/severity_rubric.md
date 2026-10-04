# Reference: Severity Rubric & Scoring Rules

> **Source**: `Security Audit Spec v3.0` (Appendix J)  
> **Status**: Normative Scoring Standard  

---

## 1. Severity Definition

Severity measures the **intrinsic impact if the vulnerability claim is true**, adjusted by reachability and compensating controls.
Severity is strictly independent of certainty (Principle P6). A finding at certainty `DISCOVERED` can carry a provisional severity if marked with a `confidence_note`.

---

## 2. Severity Classification Matrix

| Severity | Impact Characteristics & Scope |
| :--- | :--- |
| **`CRITICAL`** | Remote Code Execution (RCE), complete authentication bypass, administrative takeover, mass tenant data compromise, or valid production high-privilege credentials. Minimal or no attacker privilege required. |
| **`HIGH`** | High-impact compromise (SQLi, SSRF to internal networks, cross-user write/IDOR, privilege escalation) requiring authenticated access or specific non-default configuration. |
| **`MEDIUM`** | Bounded impact: Reflected XSS, CSRF on standard actions, weak cryptographic algorithms with compensating controls, or sensitive information disclosure without administrative compromise. |
| **`LOW`** | Minor information leaks (verbose error headers, stack traces without credentials), hardening/defense-in-depth gaps, or vulnerabilities requiring complex multi-step preconditions. |
| **`INFORMATIONAL`** | Security observations, architectural suggestions, or code hygiene improvements with no demonstrated attack path. |

---

## 3. Strict Scoring Rules

1. **CVSS Baseline**: Use CVSS 3.1 Base Score when vector can be justified. The rubric serves as a consistent fallback.
2. **Compensating Controls**: A proven compensating control (e.g. strict WAF rule, gateway authentication) may downgrade severity by **at most one level**, and ONLY with cited evidence.
3. **Dead / Unshipped Code**: Unreachable code or test fixtures are capped at `LOW` unless proven to be imported into production runtime.
4. **Attack Chains**: When low-severity issues combine into a critical exploit, do NOT artificially raise the severity of the individual findings; report the chain as a separate compound finding.
5. **No Effort Bias**: Severity MUST NOT be downgraded simply because verification was difficult or runtime testing was unavailable.

