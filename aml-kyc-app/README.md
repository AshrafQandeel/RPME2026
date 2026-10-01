# AML/KYC Compliance Management - Google Apps Script Web App

Internal AML/KYC register for an audit / consulting firm operating in the Qatar Financial Centre (QFC).
Backend: Google Apps Script. Database: Google Sheets. Document repository: Google Drive. Frontend: HTML/CSS/JS served by `HtmlService`.

> This application **supports** compliance with applicable QFC AML/CFT requirements and internal AML policy. It does not, by itself, guarantee regulatory compliance. All thresholds, required documents, review frequencies and risk methodology are configurable defaults that the MLRO must review.

```
Browser (Index.html + JS)  ->  api(action, payload)  ->  Auth + RBAC (server)  ->  Business services  ->  Google Sheets  /  Google Drive
```

## Repository layout

```
aml-kyc-app/
  src/                 <- the Apps Script project (push this folder with clasp)
    appsscript.json    manifest (Web App: execute as owner, access: domain)
    Config.gs          schemas, permissions, defaults        Code.gs            doGet + api() gateway + route table
    Auth.gs            authentication, hasPermission_()      Database.gs        Sheets access, cache, locks, IDs
    AuditService.gs    hash-chained audit log                DriveManager.gs    folders, backup
    CompanyService.gs  companies, engagements, child CRUD    UBOService.gs      UBOs, shareholders, ownership analysis
    DocumentService.gs uploads, versions, status, access     KYCService.gs      review workflow (maker-checker)
    RiskService.gs     configurable risk methodology         NotificationService.gs  email + daily maintenance
    ReportService.gs   dashboard, search, reports/PDF        UserService.gs     user administration
    SettingsService.gs validated configuration              Setup.gs           setupAMLSystem(), test data, triggers
    Utils.gs           validation + helpers
    Index.html Styles.html JavaScript.html Dashboard.html Companies.html CompanyProfile.html
    Documents.html KYCReview.html Reports.html Users.html Settings.html
  docs/                setup, security, schema, roles, test cases, manuals
  tests/               Node test-suite with in-memory mocks of Sheets/Drive/etc.
```

## Quick start

1. Read [docs/SETUP_AND_DEPLOYMENT.md](docs/SETUP_AND_DEPLOYMENT.md) (about 10 minutes).
2. In short: create a standalone Apps Script project, copy `src/` in (or `clasp push`), run `setupAMLSystem()`, deploy as a Web App (**Execute as: Me**, **Access: your Google Workspace domain**), then add users in *User Management*.

## Verify the code

```bash
node tests/run-tests.cjs   # 250+ assertions against the real .gs code (RBAC, workflow, versioning, audit chain...)
node tests/e2e.cjs         # Chromium smoke test of the real UI against the mock backend (needs Playwright)
node tests/gen-docs.cjs    # regenerates docs/DATABASE_SCHEMA.md and docs/ROLES_AND_PERMISSIONS.md
```

The tests run the actual `.gs` sources in a Node `vm` with mocked Apps Script services. They do not replace a UAT in the real Google environment - use [docs/TEST_CASES.md](docs/TEST_CASES.md) for that.

## Documentation

| Document | Purpose |
|---|---|
| [SETUP_AND_DEPLOYMENT.md](docs/SETUP_AND_DEPLOYMENT.md) | Installation, first-run setup, deployment, triggers, updating |
| [ROLES_AND_PERMISSIONS.md](docs/ROLES_AND_PERMISSIONS.md) | Permission matrix and user-role configuration |
| [DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md) | Every sheet and column |
| [SECURITY.md](docs/SECURITY.md) | Threat model, controls, limitations, hardening checklist |
| [TEST_CASES.md](docs/TEST_CASES.md) | Production-readiness test cases |
| [ADMIN_MANUAL.md](docs/ADMIN_MANUAL.md) | Administrator / MLRO manual |
| [AUDITOR_MANUAL.md](docs/AUDITOR_MANUAL.md) | Auditor user manual |
