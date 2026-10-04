# 02. Canonical State Machine & Enums

> **Source**: `Security Audit Spec v3.0` (Sections 7, 24.1, 26, Appendix C, Appendix E, Appendix H)  
> **Status**: Normative Standard & Immutable Contract  

---

## 1. Canonical State Tuple

A security finding state is represented as a formal tuple:

$$S = (C, R, V, F, A, E, D)$$

Where:
- **`C` (Certainty)**: Level of proof supporting the vulnerability claim.
- **`R` (Remediation)**: Lifecycle / fix state of the finding.
- **`V` (Verification)**: Verification mechanism applied.
- **`F` (Freshness)**: Temporal / commit freshness of the evidence against the target scope.
- **`A` (Authorization / Exception)**: Waiver / approval state.
- **`E` (Evidence Set)**: Set of associated deterministic evidence objects.
- **`D` (Discovery Debt)**: Unresolved coverage / testability relationships.

> [!IMPORTANT]
> The tuple is **not** a single combined score. Dimensions are strictly orthogonal and MUST NOT be collapsed into a single status field.

---

## 2. Canonical Enums Manifest

```yaml
canonical_enums:
  certainty:
    - DISCOVERED           # Signal found, hypothesis formed, minimal evidence
    - SUPPORTED            # Meaningful technical signal exists (e.g. source reaches sink in code)
    - CORROBORATED          # Complete chain established; lacks runtime/env confirmation
    - CONFIRMED            # Sufficiently proven (deterministic proof, PoC, or independent signals)

  remediation:
    - OPEN                 # Unresolved, active finding
    - IN_PROGRESS          # Fix is currently being authored
    - FIXED_PENDING_VERIFY # Code change committed, awaits re-verification
    - VERIFIED_FIXED       # Retest confirms vulnerability is eradicated
    - REOPENED             # Re-test failed or regression detected
    - ACCEPTED_RISK        # Formally waived risk (requires human sign-off)
    - FALSE_POSITIVE       # Formally proven benign (requires human sign-off)
    - ACCEPTED_BY_DESIGN   # Architectural choice formally documented

  verification:
    - NOT_TESTED           # No verification performed yet
    - STATIC_VERIFIED      # Verified via static taint / AST / compiler checks
    - DYNAMIC_VERIFIED     # Verified via dynamic test execution (local/test env)
    - INDEPENDENTLY_VERIFIED # Verified by an independent tool/process
    - NOT_APPLICABLE       # Finding type cannot be verified dynamically (e.g. architectural)

  freshness:
    - CURRENT              # Evidence matches the current scope identity exactly
    - STALE                # Scoped code changed; semantic equivalence unconfirmed
    - EXPIRED              # Surpassed max_age threshold
    - UNKNOWN              # Scope or timestamp cannot be verified

  severity:
    - CRITICAL             # Immediate severe threat (RCE, Auth bypass, Mass data leak)
    - HIGH                 # Severe compromise (Privilege escalation, SQLi, SSRF)
    - MEDIUM               # Significant issue (CSRF, XSS, Weak crypto, Info leak)
    - LOW                  # Minor issue (Best-practice deviation, Verbose headers)
    - INFORMATIONAL        # Observations, defense-in-depth suggestions

  gate_decision:
    - PASS                 # Zero blocking findings, debt within threshold
    - PASS_WITH_CONDITIONS # Minor issues or low-impact discovery debt acceptable
    - HOLD                 # Awaiting verification, evidence refresh, or triage
    - BLOCK                # Critical/High open confirmed findings or safety boundary violation
    - WAIVED               # Permitted under formal human waiver
    - UNKNOWN              # Gate could not run deterministically

  profile:
    - A                    # Enterprise / Safety-Critical (Strict SoD, Human mandatory)
    - B                    # Standard / Agile Team (Automated CI + Peer review)
    - C                    # Solo / Developer (Advisory mode, Single auditor)
```

### Auxiliary Enums
```yaml
auxiliary_enums:
  provenance_class: [RUNTIME_OBSERVED, DETERMINISTIC_TOOL, STATIC_ANALYSIS, AI_INFERENCE, HUMAN_ATTESTATION]
  verification_method: [STATIC, DYNAMIC, NONE]
  actor_type: [AI, HUMAN, CI, TOOL]
  exception_status: [ACTIVE, EXPIRED, REVOKED]
  debt_status: [OPEN, IN_PROGRESS, RESOLVED, ACCEPTED_RISK]
  debt_blocking_effect: [NONE, HOLD, BLOCK]
  test_result: [PASS, FAIL, NOT_TESTED, NOT_APPLICABLE]
```

### Forbidden Aliases
The following tokens MUST NOT be used as canonical states:
- `POTENTIAL` (Use `DISCOVERED` or `SUPPORTED`)
- `NEEDS_INVESTIGATION` (Use `DISCOVERED`)
- `VERIFIED` (Use `STATIC_VERIFIED` or `DYNAMIC_VERIFIED`)
- `NEEDS_REVALIDATION` (Use Freshness = `STALE`)
- `REGRESSED` (Use `REOPENED`)

---

## 3. State Machine Transition Rules (Section 26 & Appendix C)

### Default State Rules:
1. **Initial discovery with no evidence**:
   $$\text{Evidence} = \emptyset \implies C = \text{DISCOVERED}, R = \text{OPEN}, V = \text{NOT\_TESTED}, F = \text{CURRENT}$$
2. **Deterministic tool / Static proof attached**:
   $$\text{Valid Static AST/Taint} \implies C = \text{SUPPORTED}, V = \text{STATIC\_VERIFIED}$$
3. **Reproducible Test Execution (PoC passes)**:
   $$\text{Reproduced Dynamic Execution} \implies C = \text{CONFIRMED}, V = \text{DYNAMIC\_VERIFIED}$$
4. **Code modified under finding location**:
   $$\Delta(\text{Scope}) \neq 0 \implies F = \text{STALE}$$
5. **Remediation fix committed**:
   $$\text{Fix committed} \implies R = \text{FIXED\_PENDING\_VERIFY}, V = \text{NOT\_TESTED}$$
6. **Re-verification succeeds (Vuln gone)**:
   $$\text{Re-test Pass} \implies R = \text{VERIFIED\_FIXED}, V \in \{\text{STATIC\_VERIFIED}, \text{DYNAMIC\_VERIFIED}\}$$
7. **Re-verification fails (Vuln still reproducible)**:
   $$\text{Re-test Fail} \implies R = \text{REOPENED}, C = \text{CONFIRMED}$$

### Invariant on AI Authority:
- AI may transition $R$ to `FIXED_PENDING_VERIFY` or `REOPENED`.
- AI **CANNOT** transition $R$ to `FALSE_POSITIVE`, `ACCEPTED_RISK`, or `ACCEPTED_BY_DESIGN` without human sign-off (Profile B/A) or explicit user confirmation (Profile C).

