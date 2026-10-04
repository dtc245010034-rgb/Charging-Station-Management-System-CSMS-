# Security Check Catalog: Overview & Usage

> **Source**: `Security Audit Spec v3.0` (Appendix A, Appendix I)  
> **Status**: Reference Catalog  

---

## 1. Structure of the Catalog

The Check Catalog provides precise guidance on what to look for, how to prove findings, common false positives, and baseline severity anchors for 21 security check domains.

Each check domain is identified by a stable prefix: `CHK-<DOMAIN>`.

### The 6 Catalog Modules:
1. [01_auth_session_tenancy.md](file:///f:/Audit/03_catalogs/01_auth_session_tenancy.md)
   - `CHK-AUTH`: Authentication & Credential Storage
   - `CHK-AUTHZ`: Authorization, Access Control & IDOR
   - `CHK-SESS`: Session & JWT Token Handling
   - `CHK-OAUTH`: OAuth2, OIDC & SAML Integrations
   - `CHK-TENANT`: Multi-Tenant Isolation
2. [02_injection_data_handling.md](file:///f:/Audit/03_catalogs/02_injection_data_handling.md)
   - `CHK-INJ`: Injection (SQL, OS Command, Template, LDAP)
   - `CHK-VAL`: Input Validation & ReDoS
   - `CHK-SSRF`: Server-Side Request Forgery
   - `CHK-FILE`: File Upload, Download & Path Traversal
   - `CHK-DESER`: Insecure Object Deserialization & XXE
   - `CHK-XSS`: Cross-Site Scripting (Reflected, Stored, DOM)
   - `CHK-CSRF`: Cross-Site Request Forgery
   - `CHK-CORS`: Cross-Origin Resource Sharing
3. [03_crypto_and_secrets.md](file:///f:/Audit/03_catalogs/03_crypto_and_secrets.md)
   - `CHK-CRYPTO`: Cryptography & Key Management
   - `CHK-SECRET`: Hardcoded Secrets, Credentials & Tokens
4. [04_logic_race_logging.md](file:///f:/Audit/03_catalogs/04_logic_race_logging.md)
   - `CHK-LOGIC`: Business Logic & Workflow State Bypasses
   - `CHK-RACE`: Race Conditions & TOCTOU
   - `CHK-LOG`: Logging, Sensitive PII & Error Stack Traces
5. [05_deps_supply_cicd_iac.md](file:///f:/Audit/03_catalogs/05_deps_supply_cicd_iac.md)
   - `CHK-DEP`: Dependency Vulnerabilities (SCA)
   - `CHK-SUPPLY`: Supply Chain, Typosquatting & Unpinned Packages
   - `CHK-IAC`: Infrastructure as Code & Cloud Configurations
   - `CHK-CICD`: CI/CD Pipelines & GitHub Actions
   - `CHK-CLIENT`: Client-side, Mobile & Desktop Secrets/Storage
6. [06_api_and_llm.md](file:///f:/Audit/03_catalogs/06_api_and_llm.md)
   - `CHK-API`: API Excessive Data Exposure & Rate Limiting
   - `CHK-LLM`: AI / LLM Integrations, Prompt Injection & Tool Calling

---

## 2. Universal Analysis Rule

For **every** category:
1. **Trace Source to Sink**: Follow untrusted external input to the security-critical execution sink.
2. **Evaluate Compensating Controls (P9)**: Check whether framework auto-escaping, ORMs, schema validation (e.g. Zod, Pydantic), WAFs, or middleware neutralize the risk.
3. **Common False Positives (Do NOT report as finding)**:
   - Test files, mock data, unit tests, and documentation examples.
   - Dead or unreachable code not imported into runtime.
   - Placeholder strings (e.g., `api_key = "YOUR_API_KEY_HERE"`).
   - Functions with hardcoded internal constants instead of external user input.

