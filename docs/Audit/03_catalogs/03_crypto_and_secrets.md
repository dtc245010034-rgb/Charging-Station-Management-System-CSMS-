# Security Catalog: Cryptography & Secrets Protection

> **Category Code**: `CAT-CRYPTO-SEC`  
> **Source**: `Security Audit Spec v3.0` (Appendix I: CHK-CRYPTO, CHK-SECRET, Appendix B)  

---

## 1. CHK-SECRET â€” Hardcoded Secrets & Credentials

### What to Look For:
- API keys, access tokens, SSH private keys, TLS certificates, database passwords, webhook signing secrets hardcoded in:
  - Source code files (`.py`, `.js`, `.ts`, `.go`, `.java`, etc.)
  - Configuration files (`config.json`, `appsettings.json`, committed `.env` files)
  - Git commit history, Dockerfiles, CI workflow YAML files.

### How to Prove:
- **`SUPPORTED`**: High-entropy string matching known token formats (e.g. AWS `AKIA...`, GitHub `ghp_...`, Slack `xoxb-...`).
- **`CONFIRMED`**: Deterministic proof that it is a live credential belonging to an in-scope system (format checksum, key structure, or owner attestation).

> [!CAUTION]
> **SAFETY INVARIANT (Section 2.1)**:
> NEVER test a discovered secret against a live third-party service (e.g., do NOT test an AWS key against AWS APIs, or a Stripe key against Stripe).

### Not a Finding When:
- Clearly marked placeholder or mock values in test suites (e.g., `"dummy_key_for_test"`, `"1234567890abcdef"`).
- Public non-sensitive keys (e.g., Stripe Publishable Key `pk_test_...`, Google Analytics ID).

### Severity Anchors:
- Confirmed production credential / private key $\rightarrow$ `CRITICAL` (Immediate **BLOCK** on Quality Gate).
- Development / test environment secret $\rightarrow$ `MEDIUM`.

---

## 2. CHK-CRYPTO â€” Cryptography & Key Management

### What to Look For:
- Broken or deprecated cryptographic primitives:
  - Encryption: DES, 3DES, RC4, Blowfish, AES in ECB mode (`AES/ECB/PKCS5Padding`).
  - Hashing for security: MD5, SHA-1 (when used for signatures or password storage).
- Hardcoded static Initialization Vectors (IV) or nonces.
- Using non-cryptographic pseudo-random number generators (`math/rand`, `random.random()`, `Math.random()`) for security tokens, passwords, or salts.
- TLS verification disabled (`verify=False`, `InsecureSkipVerify: true`, `rejectUnauthorized: false`).
- Custom or home-brewed encryption algorithms.

### How to Prove:
- **`SUPPORTED`**: Weak primitive or static IV referenced in security context in source code.
- **`CONFIRMED`**: Deterministic proof of primitive invocation in the audited execution path.

### Not a Finding When:
- Primitive is used strictly for non-security purposes (e.g. MD5 used as a cache key or table partition checksum).

### Severity Anchors:
- Broken protection of sensitive user data $\rightarrow$ `HIGH`.
- Disabled TLS certificate verification $\rightarrow$ `HIGH`.
- Weak PRNG for session token generation $\rightarrow$ `HIGH`.
- Sub-optimal key derivation parameters with strong compensating controls $\rightarrow$ `MEDIUM` / `LOW`.

