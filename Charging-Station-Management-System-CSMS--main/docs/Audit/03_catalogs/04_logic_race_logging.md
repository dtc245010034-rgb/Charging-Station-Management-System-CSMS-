# Security Catalog: Business Logic, Race Conditions & Logging

> **Category Code**: `CAT-LOGIC-LOG`  
> **Source**: `Security Audit Spec v3.0` (Appendix I: CHK-LOGIC, CHK-RACE, CHK-LOG)  

---

## 1. CHK-LOGIC â€” Business Logic & State Machines

### What to Look For:
- Price, quantity, currency, or negative-value tampering in e-commerce/financial paths.
- Workflow step skipping (e.g. proceeding to `order_completed` without executing `payment_processed`).
- Discount coupon or rate-limit re-use abuse.
- Missing idempotency checks on financial transactions, credits, or state mutations.

### How to Prove:
- **`SUPPORTED`**: Code path allows documented business requirement to be bypassed.
- **`CONFIRMED`**: Reproducible execution shows transaction completing in an invalid state or with negative cost.

### Not a Finding When:
- Behavior matches documented specifications. If no specification exists, record as **Discovery Debt** (`DD-xxx`), not a security finding.

### Severity Anchors:
- Direct financial loss, free asset acquisition, or role grant $\rightarrow$ `HIGH` / `CRITICAL`.
- Limited business impact $\rightarrow$ `MEDIUM` / `LOW`.

---

## 2. CHK-RACE â€” Race Conditions & TOCTOU (Time-of-Check to Time-of-Use)

### What to Look For:
- Check-then-act operations without database transactions or distributed locking:
  - Checking account balance $\rightarrow$ then debiting balance.
  - Checking promo code usage count $\rightarrow$ then incrementing count.
  - Checking file existence $\rightarrow$ then creating/opening file.
- Single-use tokens consumed across parallel requests.

### How to Prove:
- **`SUPPORTED`**: Check and use are separated by asynchronous operations or non-isolated DB reads.
- **`CONFIRMED`**: Concurrent test script (e.g. 10 simultaneous requests) successfully doubles expenditure or uses a single-use token twice.

### Not a Finding When:
- Database uses `SELECT FOR UPDATE`, atomic operations (`UPDATE account SET balance = balance - 10 WHERE balance >= 10`), or distributed mutex lock (Redis Redlock).

### Severity Anchors:
- Double-spending or balance manipulation $\rightarrow$ `HIGH`.
- Cosmetic race condition $\rightarrow$ `LOW`.

---

## 3. CHK-LOG â€” Logging, Sensitive Data & Error Handling

### What to Look For:
- Sensitive data written to application logs: passwords, session tokens, JWTs, credit card numbers, PII.
- Detailed technical stack traces or database schema errors returned to end clients in production responses.
- Missing audit logs for critical security events: failed login spikes, privilege changes, admin access.
- Log injection / CRLF injection allowing attackers to forge log lines.

### How to Prove:
- **`SUPPORTED`**: Log function invocation directly interpolates sensitive user or token variables.
- **`CONFIRMED`**: Sensitive values observed in captured test log output.

### Not a Finding When:
- Variable is masked (`***`), hashed with salt, or explicitly stripped of sensitive properties.
- A standard debug log statement alone without sensitive variables is **NOT** a vulnerability.

### Severity Anchors:
- Credentials or tokens in logs $\rightarrow$ `HIGH` / `MEDIUM`.
- Stack trace disclosure to public users $\rightarrow$ `LOW`.

