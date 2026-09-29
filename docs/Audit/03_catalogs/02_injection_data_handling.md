# Security Catalog: Injection & Unsafe Data Handling

> **Category Code**: `CAT-INJ-DATA`  
> **Source**: `Security Audit Spec v3.0` (Appendix I: CHK-INJ, CHK-VAL, CHK-SSRF, CHK-FILE, CHK-DESER, CHK-XSS, CHK-CSRF, CHK-CORS)  

---

## 1. CHK-INJ â€” Injection (SQL, OS Command, Template, LDAP)

### What to Look For:
- SQL / NoSQL queries built via string concatenation, string formatting, or f-strings with external input.
- OS command execution (`subprocess.Popen(..., shell=True)`, `child_process.exec`, `system()`) with unescaped input.
- Server-Side Template Injection (SSTI) via Jinja2, Twig, Freemarker rendering user-supplied strings directly.

### How to Prove:
- **`SUPPORTED`**: Untrusted variable traced into a dynamic query/shell command without parameterization.
- **`CONFIRMED`**: Canary string alters query logic or executes benign command (`echo CANARY_1337`) in test env, or deterministic static proof of dynamic execution with user input.

### Not a Finding When:
- Queries use parameterized binding (`?`, `$1`, `:param`) or ORM builders properly.
- Shell invocation has `shell=False` and arguments passed as an explicit array of fixed strings.

### Severity Anchors:
- Unauthenticated Command Injection or SQL Injection $\rightarrow$ `CRITICAL`.
- Authenticated SQL Injection with limited permissions $\rightarrow$ `HIGH`.

---

## 2. CHK-SSRF â€” Server-Side Request Forgery

### What to Look For:
- Outbound HTTP requests (`fetch`, `requests.get`, `HttpClient`) constructed with user-supplied host, IP, or URL.
- Webhook dispatchers, URL preview scrapers, or file import features.
- Failure to block private IP ranges (RFC 1918: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.1`, cloud metadata `169.254.169.254`).

### How to Prove:
- **`SUPPORTED`**: External input controls target host of an outbound HTTP call without IP validation.
- **`CONFIRMED`**: Server successfully makes HTTP request to a local test canary listener or metadata endpoint in test env.

### Severity Anchors:
- Access to cloud metadata or internal network $\rightarrow$ `CRITICAL` / `HIGH`.
- Blind SSRF without response reflection $\rightarrow$ `MEDIUM`.

---

## 3. CHK-FILE â€” File Upload, Download & Path Traversal

### What to Look For:
- User-supplied file names concatenated into filesystem paths (`../`, `..\`, absolute paths).
- Archive extraction without path validation (Zip-Slip vulnerability).
- Unrestricted file upload allowing executable extensions (`.php`, `.jsp`, `.exe`, `.html`, `.svg`).

### How to Prove:
- **`SUPPORTED`**: Path constructed from input without canonicalization (`os.path.abspath`) and prefix containment check.
- **`CONFIRMED`**: Benign canary file written outside intended directory or read from parent directory.

### Severity Anchors:
- Arbitrary file write to executable location $\rightarrow$ `CRITICAL`.
- Arbitrary file read of configuration / source $\rightarrow$ `HIGH`.

---

## 4. CHK-DESER â€” Insecure Deserialization & XXE

### What to Look For:
- Native deserialization of untrusted payloads: Python `pickle.loads`, Java `ObjectInputStream.readObject`, PHP `unserialize`, Ruby `Marshal.load`, PyYAML `yaml.load(..., Loader=Loader)`.
- XML parsers with external entity resolution enabled (`resolve_entities=True`, missing `FEATURE_SECURE_PROCESSING`).

### How to Prove:
- **`SUPPORTED`**: Untrusted data stream fed directly into an unsafe deserializer.
- **`CONFIRMED`**: Benign canary object execution demonstrated in test environment.

### Severity Anchors:
- Untrusted deserialization leading to RCE $\rightarrow$ `CRITICAL`.
- Internal / pre-authenticated queue only $\rightarrow$ `HIGH` / `MEDIUM`.

---

## 5. CHK-XSS â€” Cross-Site Scripting

### What to Look For:
- User input rendered into web pages without contextual HTML entity encoding.
- Raw HTML insertion: React `dangerouslySetInnerHTML`, Vue `v-html`, vanilla `element.innerHTML`, Angular `bypassSecurityTrustHtml`.
- Sinks in JavaScript: `eval()`, `document.write()`, `location.href = "javascript:..."`.

### How to Prove:
- **`SUPPORTED`**: Untrusted source reaches raw HTML sink without sanitizer.
- **`CONFIRMED`**: Canary script executes in test browser harness.

### Severity Anchors:
- Stored XSS impacting all users / administrators $\rightarrow$ `HIGH`.
- Reflected XSS $\rightarrow$ `MEDIUM`.
- Self-XSS without CSRF chain $\rightarrow$ `LOW`.

---

## 6. CHK-CSRF & CHK-CORS

### What to Look For:
- State-changing actions (POST, PUT, DELETE) relying on cookies without CSRF tokens or `SameSite=Strict/Lax`.
- CORS configuration dynamically reflecting the `Origin` header with `Access-Control-Allow-Credentials: true` or wildcard `*` with credentials.

### How to Prove:
- **`SUPPORTED`**: CORS header `Access-Control-Allow-Origin: *` configured alongside credentials.
- **`CONFIRMED`**: Cross-origin test script successfully reads authenticated response.

### Severity Anchors:
- Sensitive action CSRF or credentialed CORS leak $\rightarrow$ `HIGH` / `MEDIUM`.
- CORS on public non-sensitive endpoints $\rightarrow$ `INFORMATIONAL`.

