# Security Catalog: Dependencies, Supply Chain, IaC & CI/CD

> **Category Code**: `CAT-SUPPLY-INFRA`  
> **Source**: `Security Audit Spec v3.0` (Appendix I: CHK-DEP, CHK-SUPPLY, CHK-IAC, CHK-CICD, CHK-CLIENT)  

---

## 1. CHK-DEP â€” Dependency Vulnerabilities (SCA)

### What to Look For:
- Exact third-party dependency versions in lockfiles (`package-lock.json`, `poetry.lock`, `go.sum`, `Cargo.lock`) matching known CVEs or GitHub Security Advisories (GHSA).
- Reachability analysis: Determine whether the vulnerable class or function from the library is actually imported and executed in the application's code path.

### How to Prove:
- **`SUPPORTED`**: Dependency version falls within the published advisory range.
- **`CONFIRMED`**: Exact version confirmed AND the application code invokes the specific vulnerable function or vulnerable endpoint.

> [!WARNING]
> Never invent or hallucinate CVE numbers. Always cite verified advisories. If a vulnerable library is present but completely unreferenced/unreachable, report it as `INFORMATIONAL` or note reachability.

---

## 2. CHK-SUPPLY â€” Supply Chain Security

### What to Look For:
- Unpinned or mutable dependency versions (e.g. `*`, `latest`).
- Missing package integrity hashes in lockfiles.
- Packages with names similar to popular libraries (typosquatting).
- Post-install scripts (`preinstall`, `postinstall`) downloading remote binaries.
- Dependency confusion: internal private package names exposed without private repository scoping.

### How to Prove:
- **`SUPPORTED`**: Risky unpinned reference or post-install script identified.
- **`CONFIRMED`**: Deterministic proof of hash mismatch or resolution to unauthorized public registry.

---

## 3. CHK-IAC â€” Infrastructure as Code (IaC) & Cloud Configuration

### What to Look For:
- Publicly accessible cloud storage buckets (S3 `public-read`, GCS allUsers).
- Permissive security groups (`0.0.0.0/0` allowed on administrative ports 22, 3389, 5432).
- Overly permissive IAM policies (e.g. `Resource: "*"`, `Action: "*"`).
- Containers configured to run as `root`, missing read-only root filesystems, or running with privileged capabilities (`privileged: true`).

### How to Prove:
- **`SUPPORTED`**: Insecure setting observed in Terraform, CloudFormation, Kubernetes, or Dockerfile manifests.
- **`CONFIRMED`**: Deterministic check proves the setting applies without compensating overrides.

---

## 4. CHK-CICD â€” CI/CD Pipeline Security

### What to Look For:
- Unpinned third-party GitHub Actions (e.g. `uses: actions/checkout@v2` instead of full commit SHA).
- Script injection via GitHub workflow expressions: `${{ github.event.issue.title }}` inside `run:` shell blocks.
- Overly permissive workflow permissions (missing `permissions: read-all`).
- Secrets exposed to untrusted pull requests (e.g. using `pull_request_target` carelessly with checkout).

### How to Prove:
- **`SUPPORTED`**: Workflow YAML incorporates untrusted event data into a shell execution context.
- **`CONFIRMED`**: Execution path shows untrusted string executes as arbitrary shell script.

---

## 5. CHK-CLIENT â€” Client-Side, Mobile & Desktop Security

### What to Look For:
- Production secrets embedded in client bundles (React/Vue/Android/iOS binaries).
- Sensitive tokens stored in insecure browser storage (`localStorage` without encryption).
- Disabled TLS certificate validation or pin bypasses in mobile apps.
- Exported Android components or deep links without authentication or input validation.

