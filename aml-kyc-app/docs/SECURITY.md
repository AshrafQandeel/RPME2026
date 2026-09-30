# Security Documentation

## 1. Design principles
Security -> Data integrity -> Authorisation -> Auditability -> Regulatory configurability -> Usability -> Performance.

## 2. Architecture and trust boundaries

```
Browser (untrusted) --google.script.run--> api() [Code.gs]  (trusted server, runs as the deployment owner)
                                             |-- getCurrentUser_(): Session.getActiveUser() -> Users sheet (Active)
                                             |-- route gate + handler-level requirePermission_()
                                             |-- Sheets (database) / Drive (documents)   <- not shared with end users
```

The browser is never trusted. It receives only data the server chose to return; every operation is re-authorised on the server.

## 3. Controls

| Requirement | Implementation |
|---|---|
| Authenticated Google users | Web App access = domain; `getCurrentUser_()` resolves `Session.getActiveUser().getEmail()`; unknown / inactive users get *Access Denied*; optional `ACCESS.allowedDomains` allowlist |
| No passwords | No credentials stored anywhere |
| Server-side RBAC | `hasPermission_(user, action, resource)` (`Auth.gs`); permission map is data (`ROLE_PERMISSIONS`), not scattered `if (role === ...)`. Router gate + per-handler check with the concrete record |
| URL/parameter manipulation | `doGet` ignores URL parameters. Company/document IDs sent by the client are re-resolved and access-checked (`requireCompany_`, `loadDoc_`); child records derive their company from the stored row, not from the payload. Inaccessible or missing records return the same "not found" message |
| `google.script.run` exposure | Only `doGet`, `api` and five owner-guarded admin functions are public; every other function ends in `_` (not callable from the browser). `tests/run-tests.cjs` fails if a new public function appears |
| Maker-checker | Submitter cannot start/approve/reject their own review; approval blocked until configurable requirements are met; record locking after submission/approval; new review cycle required to change approved data |
| System Administrator separation | No approval permissions by default (`APPROVAL_PERMS` guard, even if the map is edited) unless `ACCESS.sysadminCanApprove` is enabled (audited) |
| Drive IDs not exposed | `FolderID`, `DriveFileID`, `Checksum` are stripped from every response (`outRecord_`). Files are delivered as base64 through `docAccess` after authorisation and audited (Viewed/Downloaded) |
| Drive permissions | Folders set private; the app runs as the owner so users need no Drive access; do not share the repository folder |
| Sensitive data | QID/passport masked for roles without `SENSITIVE_VIEW`; not searchable by them; masked in audit `OldValue/NewValue`; emails never contain identity numbers or documents; documents stay in Drive (only metadata in Sheets) |
| Input validation | Central `validateFields_()` from the same field definitions used to build the forms: required, length, type, date validity, number ranges, enumerations, patterns, email |
| File validation | Extension allowlist (executable/active types rejected in settings), size limit (max 25 MB), server-derived MIME type (client value ignored), magic-byte check for pdf/png/jpg/office, sanitised file names, MD5 checksum stored |
| XSS | Frontend escapes every dynamic value (`App.esc`); no user data is evaluated; HtmlService IFRAME sandbox |
| CSV/formula injection | Sheets are plain-text formatted; CSV export prefixes risky leading characters; PDF reports HTML-escape all values |
| Concurrency / integrity | `LockService` script lock around all writes; IDs from a locked counter; duplicate detection on QFC/CR/name (incl. soft-deleted records) |
| Audit trail | Append-only `Audit_Log` with SHA-256 hash chain (`PrevHash`/`Hash`); no API to edit/delete; sheet protected (owner only); `Verify integrity` detects tampering; denied attempts are logged |
| Error handling | Users see safe messages; technical details go to `Error_Log` with a reference ID |
| Soft delete / retention | Deletion flags rows; Drive files are retained; nothing is physically deleted (except explicit `removeTestData()`) |
| Backups | Timestamped spreadsheet copies; never auto-deleted |

## 4. Known limitations (be honest with your auditors)

1. **IP address is not available** in Apps Script. The audit log records the client-reported user agent and states that IP is unavailable. Google Workspace audit logs (Admin console) hold IP-level data.
2. `Session.getActiveUser()` returns the email only for users in the same Workspace domain as the deployer (or when they have consented). This is why access is restricted to the domain.
3. Because the app *executes as the owner*, anyone with **editor access to the script, spreadsheet or Drive folder** can bypass the RBAC layer and the audit log (the hash chain detects sheet edits to `Audit_Log` but cannot prevent them). Restrict those rights to named administrators and review Google Workspace audit reports.
4. The hash chain proves tamper-*evidence*, not immutability. Export or back up `Audit_Log` regularly if you need external retention.
5. Documents are streamed through Apps Script as base64; practical size is limited (default 10 MB, max 25 MB).
6. Hidden UI elements are cosmetic. The same server rules are exercised by the automated tests, but you must re-test in your Workspace (see `TEST_CASES.md`).
7. Cache (5 min) can briefly show stale data if someone edits the sheets by hand.
8. Regulatory defaults (required documents, thresholds, frequencies, risk factors) are illustrative and must be validated by the MLRO. Nothing in the app asserts legal conclusions.
9. Email notifications use `MailApp` (quota-limited) and contain no identity numbers.
10. This code has been tested with mocks of the Google services and a headless browser; it has **not** been penetration-tested. Commission an independent review before storing production data.

## 5. Incident handling
- Suspected unauthorised access: set the user Inactive (takes effect immediately), review `Audit_Log` (`Permission Denied`, `Document Viewed/Downloaded`), run *Verify integrity*.
- Suspected tampering: compare against the latest backup; the hash chain reports the first broken entry.
- Lost owner account: Script Properties hold `DB_SPREADSHEET_ID` / folder IDs; redeploy from another owner after transferring the spreadsheet and Drive folder ownership.
