# Setup and Deployment

## 0. Prerequisites

- A Google Workspace account for the person who will **own** the deployment (recommended: a dedicated, MFA-protected service/admin account, not a personal Gmail).
- All users sign in with Google accounts on the same Workspace domain.
- Optional: Node.js + [`clasp`](https://github.com/google/clasp) for command-line deployment.

## 1. Create the project

**Option A - clasp**

```bash
npm i -g @google/clasp && clasp login
cd aml-kyc-app/src
clasp create --type standalone --title "AML KYC System"   # creates .clasp.json (git-ignored)
clasp push
clasp open
```

**Option B - manual**: script.google.com -> New project -> for every file in `src/` create a file of the same name/type (`.gs` = Script, `.html` = HTML) and paste the content. Replace the manifest via *Project Settings -> Show "appsscript.json"*.

> The project must be **standalone** (not bound to a spreadsheet); the setup function creates and owns the database spreadsheet.

## 2. First-run setup

1. Open the editor, choose `setupAMLSystem` and click **Run**. Approve the OAuth scopes (Sheets, Drive, Gmail send, triggers, email).
2. Check the execution log / returned summary. It is safe to run again: nothing is duplicated (existing spreadsheet, folders, headers and settings are detected and reused; missing columns are appended).

Setup performs: create `AML_KYC_DB` spreadsheet -> create all worksheets and headers -> create `AML_KYC_SYSTEM/Companies`, `System Documents` (+`Backups`) in Drive -> store IDs in Script Properties -> insert missing default settings -> create the first **System Administrator** (the account running setup) -> protect the `Audit_Log` sheet -> verify service access -> write a `System Setup` audit entry.

3. Optionally run `installTriggers()` once to install the daily maintenance job (marks expired documents, sends expiry / KYC-due digests if notifications are enabled).
4. Optionally run `seedTestData()` to create **TEST COMPANY - DO NOT USE** with a fictitious UBO/ownership chain for UAT. Remove it with `removeTestData()` before go-live (physically deletes test rows and trashes the test Drive folder; audit entries are kept).

> `setupAMLSystem`, `seedTestData`, `removeTestData`, `installTriggers` and `dailyMaintenance` refuse to run for anyone except the script owner, even though Apps Script exposes public functions to `google.script.run`.

## 3. Deploy as a Web App

*Deploy -> New deployment -> Web app*

| Setting | Value | Why |
|---|---|---|
| Execute as | **Me** (the owner) | Files stay private to the owner/system; users never need Drive access to the repository |
| Who has access | **Anyone within `<your domain>`** | Requires a signed-in Workspace user; the email is available via `Session.getActiveUser()` |

Copy the Web App URL and share it internally. Users who are not in the `Users` sheet (or are Inactive) see **Access Denied**.

Updating later: *Deploy -> Manage deployments -> Edit -> New version* (the URL stays the same). Do not create a new deployment for every change.

## 4. Add users and roles

1. Sign in as the initial System Administrator -> **User Management** -> add the MLRO and DMLRO (only a user with `ROLE_MANAGE` may assign privileged roles), then Auditors and Viewers.
2. Recommended: the System Administrator adds an MLRO first, then reviews `System Settings`.

## 5. Configure (MLRO)

Open **System Settings** and review, in this order: `REQUIRED_DOCS`, `REVIEW_FREQUENCY_MONTHS`, `EXPIRY_WARNING_DAYS`, `APPROVAL_REQUIREMENTS`, `RISK_CONFIG`, `CHECKLIST_ITEMS`, `HIGH_RISK_JURISDICTIONS`, `ENGAGEMENT_TYPES`. The shipped values are illustrative. `ACCESS.restrictToAssigned` limits Auditors/Viewers to their own companies. Turn on `NOTIFICATIONS.enabled` when ready (Apps Script mail quotas apply).

## 6. Production hardening checklist

- [ ] Deploy under a dedicated owner account with MFA; do not share the account.
- [ ] Access = domain only; confirm `ACCESS.allowedDomains` if guest domains exist.
- [ ] Do **not** share the Drive folder `AML_KYC_SYSTEM` or the `AML_KYC_DB` spreadsheet with users; access is through the app only. Limit Drive/Sheet editors to 1-2 named administrators (the spreadsheet is the source of truth; direct edits bypass the RBAC layer).
- [ ] Remove test data (`removeTestData()`); confirm no `IsTestData = Y` rows.
- [ ] Take a first `Backup Database` and verify the copy opens.
- [ ] Run the checklist in `TEST_CASES.md` in the real environment.
- [ ] Record the deployment owner and a break-glass recovery contact.

## 7. Operations notes

- **Cache:** table reads are cached for 5 minutes and invalidated by every write made through the app. Manual edits directly in the sheet may take up to 5 minutes to appear.
- **Quotas:** consumer/Workspace quotas apply (execution time, Drive writes, mail). Uploads are limited to 25 MB by design (default 10 MB, configurable in `FILE_RULES`).
- **Scale:** reads are table-level (cached); it is comfortable for thousands of companies and tens of thousands of documents. For much larger volumes migrate `Documents`/`Audit_Log` to a database.
- **Backups:** *Settings -> Backup database now* copies the spreadsheet to `System Documents/Backups` as `AML_KYC_DB_Backup_YYYY-MM-DD_HHmm`. Backups are never auto-deleted (`BACKUP_RETENTION_DAYS` is informational). Drive files are covered by Drive's own retention/versioning - consider periodic Drive exports for the document repository.
- **Restore:** open the backup, copy the sheet data back into `AML_KYC_DB` (or point Script Property `DB_SPREADSHEET_ID` at the backup), then run `setupAMLSystem()` to re-verify structure.
