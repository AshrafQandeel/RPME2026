# Roles and Permissions

> Generated from `DEFAULT_ROLE_PERMISSIONS` in `src/Config.gs`. The live map is the `ROLE_PERMISSIONS` setting and can be changed by users holding `ROLE_MANAGE` (audited). `Y` = allowed, `own` = only on records the user created / uploaded, `-` = denied.

| Permission | MLRO | DMLRO | System Administrator | Auditor | Viewer |
|---|---|---|---|---|---|
| `COMPANY_VIEW` | Y | Y | Y | Y | Y |
| `COMPANY_CREATE` | Y | Y | - | Y | - |
| `COMPANY_EDIT` | Y | Y | - | Y | - |
| `COMPANY_DELETE` | Y | Y | - | - | - |
| `COMPANY_RESTORE` | Y | Y | - | - | - |
| `ENGAGEMENT_MANAGE` | Y | Y | - | Y | - |
| `ENGAGEMENT_DELETE` | Y | Y | - | own | - |
| `UBO_MANAGE` | Y | Y | - | Y | - |
| `UBO_DELETE` | Y | Y | - | own | - |
| `OWNERSHIP_MANAGE` | Y | Y | - | Y | - |
| `SHAREHOLDER_DELETE` | Y | Y | - | own | - |
| `DOC_VIEW` | Y | Y | Y | Y | Y |
| `DOC_UPLOAD` | Y | Y | - | Y | - |
| `DOC_DELETE` | Y | Y | - | own | - |
| `DOC_STATUS` | Y | Y | - | - | - |
| `KYC_EDIT` | Y | Y | - | Y | - |
| `KYC_SUBMIT` | Y | Y | - | Y | - |
| `KYC_REVIEW` | Y | Y | - | - | - |
| `KYC_REOPEN` | Y | Y | - | Y | - |
| `RISK_ASSESS` | Y | Y | - | Y | - |
| `RISK_EDIT_FINAL` | Y | Y | - | - | - |
| `SENSITIVE_VIEW` | Y | Y | Y | Y | - |
| `USER_MANAGE` | Y | Y | Y | - | - |
| `ROLE_MANAGE` | Y | - | Y | - | - |
| `AUDIT_VIEW` | Y | Y | Y | - | - |
| `AUDIT_VIEW_COMPANY` | Y | Y | Y | Y | - |
| `REPORT_VIEW` | Y | Y | Y | Y | - |
| `SETTINGS_AML` | Y | Y | - | - | - |
| `SETTINGS_SYSTEM` | Y | - | Y | - | - |
| `BACKUP` | Y | - | Y | - | - |
| `DB_MANAGE` | Y | - | Y | - | - |
| `DRIVE_MANAGE` | Y | - | Y | - | - |

Additional rules enforced in code (not just in the matrix):

- **System Administrator** never receives `KYC_REVIEW`, `DOC_STATUS` or `RISK_EDIT_FINAL` unless `ACCESS.sysadminCanApprove` is explicitly enabled.
- **Maker-checker:** the user who submitted a review cannot start, approve or reject it (unless `APPROVAL_REQUIREMENTS.allowSelfApproval` is enabled).
- **Record locking:** users without `KYC_REVIEW` cannot modify a company (or its engagements, UBOs, shareholders, risk assessment) while its KYC status is Submitted / Under Review / Resubmitted / Approved. An auditor must start a new review cycle (`KYC_REOPEN`) to change approved data.
- **`own` grants** compare the record's `CreatedBy`/`UploadedBy` with the caller and also respect the record lock.
- **Privileged roles** (MLRO, DMLRO, System Administrator) can only be assigned or edited by a user with `ROLE_MANAGE`. Users cannot change their own role or status, and at least one active user must retain `ROLE_MANAGE`.
- **Sensitive data:** users without `SENSITIVE_VIEW` (Viewer by default) receive masked QID/passport numbers and cannot search by them.
- **Restricted access mode:** with `ACCESS.restrictToAssigned`, Auditors/Viewers only see companies they created, are assigned to as auditor, or are listed in `AuthorizedUsers`.
