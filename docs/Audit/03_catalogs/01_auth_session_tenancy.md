# Security Catalog: Authentication, Authorization & Multi-Tenancy

> **Category Code**: `CAT-AUTH`  
> **Source**: `Security Audit Spec v3.0` (Appendix I: CHK-AUTH, CHK-AUTHZ, CHK-SESS, CHK-OAUTH, CHK-TENANT)  

---

## 1. CHK-AUTH â€” Authentication

### What to Look For:
- Login, token issuance, password reset, and MFA workflows.
- Hardcoded, default, or easily guessable administrative credentials.
- Weak password hashing algorithms (MD5, SHA-1, plain SHA-256 without salt/bcrypt/argon2).
- Missing rate limiting or lockout on authentication endpoints (brute-force exposure).
- Username enumeration via distinct error messages or response timing.
- Unauthenticated endpoints that should be protected.

### How to Prove:
- **`SUPPORTED`**: Endpoint handler lacks the authentication middleware used by peer routes, or weak hash algorithm observed in code.
- **`CONFIRMED`**: Dynamic unauthenticated request reaches protected business logic, or deterministic proof of plaintext password storage.

### Not a Finding When:
- Route is intentionally public by design (e.g. landing page, public catalog).
- Authentication is enforced at the API gateway or reverse proxy layer (evidenced in config).

### Severity Anchors:
- Auth bypass on sensitive functionality $\rightarrow$ `CRITICAL` / `HIGH`.
- Missing brute-force rate limit $\rightarrow$ `MEDIUM` / `LOW`.
- Username enumeration $\rightarrow$ `LOW`.

---

## 2. CHK-AUTHZ â€” Authorization & Access Control (including IDOR)

### What to Look For:
- Object lookups by client-supplied ID (e.g. `/api/orders/{id}`) without verifying ownership or tenant boundary.
- Missing role/permission checks on administrative actions (e.g. `@RequireRole('admin')` missing).
- Client-side-only authorization (hiding buttons in frontend while backend endpoint is unprotected).
- Mass assignment allowing standard users to set `role: "admin"` or `is_verified: true`.

### How to Prove:
- **`SUPPORTED`**: Client-supplied ID flows directly to database query without tenant/user ownership filter.
- **`CONFIRMED`**: Test identity A successfully reads or modifies test identity B's private object.

### Not a Finding When:
- Authorization check is enforced in lower repository layer, ORM filter, or Row-Level Security (RLS).

### Severity Anchors:
- Cross-user data write or unauthorized admin access $\rightarrow$ `CRITICAL` / `HIGH`.
- Read of low-sensitivity public data $\rightarrow$ `MEDIUM` / `LOW`.

---

## 3. CHK-SESS â€” Session & Token Handling

### What to Look For:
- Predictable session IDs or long token lifetimes without expiration.
- JWT tokens with `alg: "none"` accepted, missing signature verification, or weak secret keys.
- Sensitive tokens transmitted in URL query parameters or printed to logs.
- Session cookies missing `HttpOnly`, `Secure`, or `SameSite` flags.
- Failure to invalidate session tokens upon logout or password reset.

### How to Prove:
- **`SUPPORTED`**: Code verifies JWT without enforcing signature or uses weak hardcoded secret.
- **`CONFIRMED`**: Forged or expired token successfully accepted by the server in test environment.

### Severity Anchors:
- Forged token accepted (complete auth bypass) $\rightarrow$ `CRITICAL`.
- Missing security flags on cookies $\rightarrow$ `MEDIUM` / `LOW`.

---

## 4. CHK-OAUTH â€” OAuth2, OIDC & SAML Integrations

### What to Look For:
- Missing `state` parameter or PKCE (exposing to CSRF/Authorization code interception).
- Permissive redirect URI matching (wildcard `*` or regex flaws allowing token leakage).
- Missing validation of `iss` (issuer), `aud` (audience), or `nonce` in ID tokens.
- Account takeover via unverified email linking.

### How to Prove:
- **`SUPPORTED`**: OAuth callback handler omits `state` verification or uses permissive regex on redirect.
- **`CONFIRMED`**: Crafted callback or token from untrusted IdP accepted in test environment.

### Severity Anchors:
- Account takeover $\rightarrow$ `CRITICAL` / `HIGH`.
- Weak redirect validation without direct token leakage $\rightarrow$ `MEDIUM`.

---

## 5. CHK-TENANT â€” Multi-Tenancy Isolation

### What to Look For:
- Database queries, cache keys (Redis), message queues, or storage paths lacking `tenant_id` scope.
- Trusting client-supplied `tenant_id` in request payloads rather than verified session context.
- Shared global memory or static caches across different customer tenants.

### How to Prove:
- **`SUPPORTED`**: Database query on tenant-scoped entity lacks `WHERE tenant_id = ?` clause.
- **`CONFIRMED`**: User from Tenant 1 retrieves records belonging to Tenant 2 in test environment.

### Severity Anchors:
- Cross-tenant data breach $\rightarrow$ `CRITICAL` / `HIGH`.

