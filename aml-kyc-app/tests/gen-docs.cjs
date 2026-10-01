'use strict';
/** Generates docs/DATABASE_SCHEMA.md and docs/ROLES_AND_PERMISSIONS.md from Config.gs so they never drift from the code. */
const fs = require('fs'), path = require('path');
const { createEnv } = require('./gas-mock.cjs');
const { ctx } = createEnv(path.join(__dirname, '..', 'src'));
const D = path.join(__dirname, '..', 'docs');
const run = code => require('vm').runInContext(code, ctx);

let s = '# Database Schema (Google Sheets)\n\n> Generated from `src/Config.gs` by `node tests/gen-docs.cjs`. Do not edit by hand.\n\n' +
  'All sheets are formatted as **plain text** (no date/number/formula coercion). Dates are `YYYY-MM-DD`; timestamps are `YYYY-MM-DDTHH:mm:ss` (Asia/Qatar). Percentages are stored as numbers. Record IDs are stable identifiers (`PREFIX-000001`); row numbers are never used as identifiers. Rows are never physically deleted by the application - deletion sets `IsDeleted = Y` (soft delete).\n\n';
const names = run('SHEET_ORDER');
const ids = { Users: 'USR-000001', Companies: 'CMP-000001', Engagements: 'ENG-000001', UBOs: 'UBO-000001', Shareholders: 'SHR-000001', Documents: 'DOC-000001', KYC_Reviews: 'REV-000001', Risk_Assessments: 'RSK-000001', Audit_Log: 'LOG-000001', Settings: '(setting key)', Error_Log: 'ERR-...' };
const purpose = { Users: 'Authorised users. Only Active users listed here can sign in.', Companies: 'Company / client master record. FolderID is the Drive folder ID (server-side only).', Engagements: 'Multiple engagements per company.', UBOs: 'Ultimate beneficial owners (multiple per company). QID/passport are sensitive.', Shareholders: 'Ownership structure. HeldThroughID links a holder to the intermediate entity it holds shares in (blank = direct holder).', Documents: 'Document register. Files live in Drive; only metadata and the file ID are stored. Versioning via VersionNo / VersionStatus / SupersededByID.', KYC_Reviews: 'Review cycles and workflow status. Checklist is JSON {itemId:{done,na,comment,by,at}}.', Risk_Assessments: 'Risk assessment history. Answers is JSON {factorId: optionValue}. FinalRating is set only by MLRO/DMLRO.', Audit_Log: 'Append-only, hash-chained audit trail (PrevHash/Hash).', Settings: 'Key/value configuration (JSON values).', Error_Log: 'Technical errors (not shown to users).' };
for (const n of names) {
  const cols = run(`tableColumns_('${n}')`), fields = run(`TABLES['${n}'].fields`);
  s += `## ${n}\n\n${purpose[n]}\n\nID format: \`${ids[n]}\`\n\n| Column | Notes |\n|---|---|\n`;
  for (const c of cols) {
    const f = fields.find(x => x.k === c); let note = '';
    if (f) { note = [f.type, f.required ? 'required' : '', f.sensitive ? 'sensitive' : '', f.perm ? 'editable only with ' + f.perm : '', f.ro ? 'system-set' : '', Array.isArray(f.options) ? 'values: ' + f.options.join(' / ') : ''].filter(Boolean).join('; '); }
    else if (c === run(`TABLES['${n}'].idCol`)) note = 'primary identifier';
    else if (c === 'CompanyID') note = 'foreign key -> Companies';
    s += `| ${c} | ${note} |\n`;
  }
  s += '\n';
}
fs.writeFileSync(path.join(D, 'DATABASE_SCHEMA.md'), s);

const perms = run('PERMISSIONS'), roles = run('DEFAULT_ROLE_PERMISSIONS'), rn = run('BUILTIN_ROLES');
let p = '# Roles and Permissions\n\n> Generated from `DEFAULT_ROLE_PERMISSIONS` in `src/Config.gs`. The live map is the `ROLE_PERMISSIONS` setting and can be changed by users holding `ROLE_MANAGE` (audited). `Y` = allowed, `own` = only on records the user created / uploaded, `-` = denied.\n\n' +
  '| Permission | ' + rn.join(' | ') + ' |\n|---|' + rn.map(() => '---').join('|') + '|\n';
for (const k of perms) p += `| \`${k}\` | ` + rn.map(r => roles[r][k] === true ? 'Y' : roles[r][k] === 'own' ? 'own' : '-').join(' | ') + ' |\n';
p += '\nAdditional rules enforced in code (not just in the matrix):\n\n- **System Administrator** never receives `KYC_REVIEW`, `DOC_STATUS` or `RISK_EDIT_FINAL` unless `ACCESS.sysadminCanApprove` is explicitly enabled.\n- **Maker-checker:** the user who submitted a review cannot start, approve or reject it (unless `APPROVAL_REQUIREMENTS.allowSelfApproval` is enabled).\n- **Record locking:** users without `KYC_REVIEW` cannot modify a company (or its engagements, UBOs, shareholders, risk assessment) while its KYC status is Submitted / Under Review / Resubmitted / Approved. An auditor must start a new review cycle (`KYC_REOPEN`) to change approved data.\n- **`own` grants** compare the record\'s `CreatedBy`/`UploadedBy` with the caller and also respect the record lock.\n- **Privileged roles** (MLRO, DMLRO, System Administrator) can only be assigned or edited by a user with `ROLE_MANAGE`. Users cannot change their own role or status, and at least one active user must retain `ROLE_MANAGE`.\n- **Sensitive data:** users without `SENSITIVE_VIEW` (Viewer by default) receive masked QID/passport numbers and cannot search by them.\n- **Restricted access mode:** with `ACCESS.restrictToAssigned`, Auditors/Viewers only see companies they created, are assigned to as auditor, or are listed in `AuthorizedUsers`.\n';
fs.writeFileSync(path.join(D, 'ROLES_AND_PERMISSIONS.md'), p);
console.log('docs generated');
