# Administrator / MLRO Manual

## Who does what
- **System Administrator** - technical: users & roles, system settings, backups, Drive/database structure, audit log. Cannot approve KYC, verify documents or set final risk ratings (by design).
- **MLRO** - full access, owner of AML methodology (required documents, risk model, review frequencies).
- **DMLRO** - same operational permissions as MLRO except role management, backups and system-level settings (defaults; adjustable in `ROLE_PERMISSIONS`).

## Users (User Management)
- Add a user: name, Google email, role, department. Access is immediate; sign-in requires the Google account to exist in the domain.
- Deactivate instead of delete (keeps history). You cannot change your own role/status; at least one active user must keep role-management rights.
- Only users with `ROLE_MANAGE` can grant/change MLRO, DMLRO or System Administrator.
- Changing roles' permissions: *System Settings -> ROLE_PERMISSIONS* (JSON: `role -> {PERMISSION: true|"own"}`). Built-in roles cannot be removed; MLRO must keep `ROLE_MANAGE`, `SETTINGS_AML`, `USER_MANAGE`. Custom roles can be added by adding a new key. See `ROLES_AND_PERMISSIONS.md`.

## Settings (all changes are validated and audited)
| Key | Meaning |
|---|---|
| `REQUIRED_DOCS` | Mandatory documents. `when`: `always`, `parentCR` (if company has a parent CR), `perUBO` (each UBO needs e.g. QID or Passport). Feeds "missing documents", dashboard and approval blocking |
| `DOC_TYPES` | Types, categories, Drive sub-folder, `multi` (many current files) and `expires` (expiry expected) |
| `REVIEW_FREQUENCY_MONTHS` | Months to next review by final rating |
| `EXPIRY_WARNING_DAYS`, `KYC_DUE_WINDOW_DAYS` | Alert windows |
| `APPROVAL_REQUIREMENTS` | Conditions to approve: checklist complete, final rating set, mandatory documents, UBO recorded, block on confirmed sanctions match, allow self-approval (default off) |
| `RISK_CONFIG` | Factors, options, scores, weights, `esc:true` escalation flags, thresholds (Medium/High). Increment `version` when you change methodology |
| `CHECKLIST_ITEMS` | KYC checklist |
| `HIGH_RISK_JURISDICTIONS` | Your firm's list; used only to *suggest* risk answers |
| `ACCESS` | `restrictToAssigned`, `allowedDomains`, `sysadminCanApprove`, `uboThresholdPercent` |
| `FILE_RULES` | Max size (<= 25 MB) and allowed extensions |
| `NOTIFICATIONS` | Master switch, per-event switches, extra recipients |
| `ENGAGEMENT_TYPES`, `LEGAL_FORMS` | Pick lists |

Changing a rule does not rewrite history: existing reviews keep their recorded decisions; requirements apply to future approvals.

## Reviewing a submission (MLRO / DMLRO)
1. *Pending Reviews* or *KYC Reviews* -> open the company -> **KYC Review** tab -> **Start review** (you cannot review your own submission).
2. Verify documents (Documents tab -> Status), UBO data and the risk assessment. Set the **final risk rating** in *Risk Assessment* (a reason is mandatory if it differs from the calculated rating).
3. Complete/confirm the checklist (comment per item), then **Approve** or **Reject** (comment required). Rejections go back to the auditor.
4. Approval sets last/next review dates from the risk-based frequency and unlocks nothing: any later change requires a new review cycle.

## Audit log
*Audit Log* (MLRO, DMLRO, System Administrator): filter by user/action/date/text; **Verify integrity** re-computes the hash chain. Do not edit the sheet manually.

## Backup, maintenance
- *System Settings -> Backup database now* (before major changes and on a schedule you define).
- `installTriggers()` (editor) installs the daily job. `dailyMaintenance()` can be run manually (throttled to once per 6 h).
- Errors: `Error_Log` sheet (reference ID shown to the user).

## Editor-only functions (run by the script owner)
`setupAMLSystem()`, `installTriggers()`, `dailyMaintenance()`, `seedTestData()`, `removeTestData()`.

## Data corrections
Direct edits to the spreadsheet bypass validation and the audit trail - avoid them. If unavoidable: two-person rule, document the reason, and note it in an audit-relevant channel. Cache can take up to 5 minutes to reflect manual edits.
