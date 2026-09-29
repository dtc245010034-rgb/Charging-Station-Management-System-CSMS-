# Step 1: Inventory & Scope Mapping

> **Phase**: 1 / 5 (Foundation)  
> **Source**: `Security Audit Specification v3.0` (Sections 3, 5, 10, 15, 34)  
> **Objective**: Deterministically discover and catalog all in-scope assets, entry points, actors, and data flows.  

---

## 1. What the AI Must Do

In this step, the AI acts as the **System Cartographer**. Do NOT jump directly into reporting vulnerabilities. First, establish the exact boundaries of what exists and what is being tested.

```text
[Scan Project Tree & Configs]
           │
           ▼
[Identify Assets, Actors & Entry Points]
           │
           ▼
[Map Critical Data Flows]
           │
           ▼
[Compute Initial Coverage Denominators]
           │
           ▼
[Output: inventory_artifact.json]
```

---

## 2. Procedure & Commands

### 2.1 File & Manifest Discovery
Execute deterministic file/directory scans to detect project tech stack:
- Web frameworks (e.g., Express, FastAPI, Django, Spring Boot, ASP.NET)
- API route declarations (OpenAPI, controllers, routers)
- Package manifests (`package.json`, `pom.xml`, `requirements.txt`, `go.mod`, `Cargo.toml`)
- Infrastructure & configs (`Dockerfile`, `docker-compose.yml`, Terraform, Kubernetes, `.env.example`)

### 2.2 Entry Point Mapping
Identify and extract:
- **HTTP / REST / GraphQL Endpoints**: Method, Path, Auth requirements (Public, Authenticated, Admin, Role-scoped).
- **CLI Commands & Scripts**: Input flags, arguments.
- **Message Consumers / Sockets**: WebSockets, Celery, Kafka/RabbitMQ consumer topics.
- **File Ingestion**: Upload handlers, bulk parsers.

### 2.3 Asset Classification
Catalog sensitive assets present in code:
- Credentials & Secrets (API keys, DB connection strings, signing keys)
- PII / Financial Data / Tenant Data
- Admin capabilities & Privileged endpoints

### 2.4 Actor Matrix
Map threat actors:
- Anonymous external user
- Authenticated standard tenant/user
- Cross-tenant user (attacker in multi-tenant system)
- Internal administrator / System service

---

## 3. Coverage Denominator Rules (Normative)

Define exact denominators:
- $D_{\text{inventory}}$: Total discovered/declared in-scope assets & endpoints.
- $D_{\text{testable}}$: Assets testable with current tools/access.
- $D_{\text{unknown}}$: Assets identified but unparseable (must be tracked as Discovery Debt).

$$\text{Coverage}_{\text{inventory}} = \frac{|D_{\text{verified}}|}{|D_{\text{inventory}}|} \times 100\%$$

> [!WARNING]
> If an endpoint exists in code but cannot be inspected or tested, record a **Discovery Debt** item (`DD-xxx`). Never assume an uninspected endpoint is secure!

---

## 4. Required Output Artifact

Before proceeding to Step 2, the AI MUST generate or update `inventory_artifact.json` matching the template in [inventory_artifact.json](file:///f:/Audit/04_templates/inventory_artifact.json).

### Checklist for Exiting Step 1:
- [ ] Tech stack and dependency manifest identified.
- [ ] List of all exposed endpoints and handlers locked.
- [ ] Auth boundaries per endpoint mapped (Public vs Protected).
- [ ] Unknown or inaccessible components logged to Discovery Debt list.
- [ ] `inventory_artifact.json` created.
