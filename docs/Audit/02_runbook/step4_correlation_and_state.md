# Step 4: Correlation, Graph & State Aggregation

> **Phase**: 4 / 5 (Synthesis & Normalization)  
> **Source**: `Security Audit Specification v3.0` (Sections 4.3, 11, 13, 27, 31, 32)  
> **Objective**: Correlate isolated findings into attack graphs, deduplicate identical root causes, enforce parent-child aggregation rules, and verify evidence freshness.  

---

## 1. What the AI Must Do

In this step, the AI acts as the **Intelligence Synthesizer**. Individual signals and test outputs are consolidated into a coherent vulnerability graph.

```text
[Gather All Verified Findings and Discovery Debts]
                        │
                        ▼
[Group by Common Root Cause / Vulnerability Pattern]
                        │
                        ▼
[Construct Parent-Child Structures & Attack Chains]
                        │
                        ▼
[Verify Evidence Freshness against Target Scope Hash]
                        │
                        ▼
[Calculate Aggregate State Tuples S = (C, R, V, F, A, E, D)]
```

---

## 2. Deduplication & Root-Cause Clustering

Do not overwhelm reports with 50 duplicate findings for the same underlying issue:
- If 10 endpoints lack CSRF protection because a global CSRF middleware was disabled in `server.js`, create **ONE parent finding** (`SEC-CSRF-GLOBAL`) with 10 child entries in `affected_locations`.
- If an unescaped database wrapper method is called by 5 controllers, link them as affected locations under the single root cause finding.

---

## 3. Attack Chains (Section 6.5 & 13)

Identify compound attack paths where low-severity weaknesses combine to create high-impact exploitation:
- *Example Chain*:
  1. Information Leak (`CHK-LOG` / `LOW`): Stack trace exposes internal service IP and database table names.
  2. IDOR (`CHK-AUTHZ` / `MEDIUM`): Non-admin user can fetch other tenant's organization profile.
  3. SSRF (`CHK-SSRF` / `HIGH`): Avatar image fetcher allows connecting to internal service IP discovered in step 1.
  $\implies$ **Attack Chain Finding (`CRITICAL`)**: Unauthenticated remote access to internal database via combined chained primitives.

---

## 4. Freshness Engine Check (Section 11 & 31)

For every evidence item:
1. Compare `artifact_identity` (hash / git commit) against the current working copy.
2. If the file has been modified since evidence was collected:
   - Check if changes are **semantically equivalent** (whitespace/comment only).
   - If functional code changed, set `freshness: STALE` and schedule re-verification.
3. If older than project `max_age` (e.g. 30 days): set `freshness: EXPIRED`.

---

## 5. Formal Parent-Child Aggregation Invariant (Section 27)

When finalizing the root `finding.remediation` field:
- **`VERIFIED_FIXED`**: ALL child locations are in a terminal state (`VERIFIED_FIXED`, `ACCEPTED_RISK`, `FALSE_POSITIVE`, `ACCEPTED_BY_DESIGN`) AND at least one is `VERIFIED_FIXED`.
- **`OPEN` / `IN_PROGRESS`**: If ANY child location is still `OPEN`, `IN_PROGRESS`, or `REOPENED`, the root finding MUST remain non-fixed.
- **`FALSE_POSITIVE`**: ALL child locations are proven false positives.

### Checklist for Exiting Step 4:
- [ ] Duplicates clustered under consolidated findings.
- [ ] Multi-location findings structured with parent-child location IDs (`LOC-01`, `LOC-02`).
- [ ] Attack chains mapped and given appropriate composite severity.
- [ ] Freshness states validated against repository commit/hash.
- [ ] State tuples $(C, R, V, F)$ computed cleanly without contradictions.
