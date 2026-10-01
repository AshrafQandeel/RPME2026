/**
 * Config.gs - static configuration: table schemas, permissions, defaults.
 *
 * SECURITY CONVENTION (important):
 * Every top-level function in an Apps Script project whose name does NOT end in "_" can be
 * invoked from the browser via google.script.run by any authenticated user. Therefore ONLY
 * doGet(), api() and a few owner-guarded admin entry points are public. All other functions
 * MUST end with "_". tests/run-tests.js enforces this.
 *
 * This file must not call functions defined in other files at load time.
 */

var APP = {
  NAME: 'AML/KYC Compliance Management',
  VERSION: '1.0.0',
  ROOT_FOLDER_NAME: 'AML_KYC_SYSTEM',
  DB_NAME: 'AML_KYC_DB',
  TZ: 'Asia/Qatar'
};

var PROP = {
  DB_ID: 'DB_SPREADSHEET_ID',
  ROOT_ID: 'ROOT_FOLDER_ID',
  COMPANIES_ID: 'COMPANIES_FOLDER_ID',
  SYSDOCS_ID: 'SYSTEM_DOCS_FOLDER_ID',
  AUDIT_HASH: 'AUDIT_LAST_HASH',
  COUNTER: 'CNT_',
  MAINT_LAST: 'MAINTENANCE_LAST_RUN'
};

var KYC = {
  DRAFT: 'Draft', SUBMITTED: 'Submitted for Review', UNDER: 'Under Review', APPROVED: 'Approved',
  REJECTED: 'Rejected', RETURNED: 'Returned to Auditor', RESUBMITTED: 'Resubmitted'
};
/** Statuses in which an auditor (maker) may not modify the company record. */
var KYC_LOCKED = [KYC.SUBMITTED, KYC.UNDER, KYC.RESUBMITTED, KYC.APPROVED];
var KYC_PENDING = [KYC.SUBMITTED, KYC.UNDER, KYC.RESUBMITTED];

var DOC_STATUSES = ['Pending', 'Uploaded', 'Under Review', 'Verified', 'Rejected', 'Expired', 'Replacement Required'];
var RISK_LEVELS = ['Low', 'Medium', 'High'];
var NUMERIC_COLS = { OwnershipPercentage: 1, VotingPercentage: 1, HoldingPercentage: 1, VersionNo: 1, SizeBytes: 1, Score: 1, CycleNo: 1 };

// ---------------------------------------------------------------- field helper
function F_(k, label, type, o) {
  var f = { k: k, label: label, type: type || 'text' };
  for (var x in (o || {})) f[x] = o[x];
  return f;
}

var COMMON_SYS = ['IsDeleted', 'DeletedBy', 'DeletedAt', 'CreatedBy', 'CreatedAt', 'UpdatedBy', 'UpdatedAt'];

var TABLES = {};
function T_(name, entity, idCol, prefix, fields, sys) {
  TABLES[name] = { name: name, entity: entity, idCol: idCol, prefix: prefix, fields: fields, sys: sys || [] };
}

var YES_NO = ['', 'Y'];

T_('Users', 'User', 'UserID', 'USR', [
  F_('Name', 'Name', 'text', { required: true }),
  F_('Email', 'Email', 'email', { required: true }),
  F_('Role', 'Role', 'select', { required: true, options: 'roles' }),
  F_('Department', 'Department', 'text'),
  F_('Status', 'Status', 'select', { required: true, options: ['Active', 'Inactive'], def: 'Active' }),
  F_('Notes', 'Notes', 'textarea')
], ['DateAdded', 'LastLogin', 'AddedBy', 'UpdatedBy', 'UpdatedAt']);

T_('Companies', 'Company', 'CompanyID', 'CMP', [
  F_('LegalName', 'Legal Company Name', 'text', { required: true }),
  F_('TradingName', 'Trading Name', 'text'),
  F_('QFCNumber', 'QFC Number', 'text', { max: 40 }),
  F_('CRNumber', 'Commercial Registration (CR) Number', 'text', { max: 40 }),
  F_('TradeLicenseNumber', 'Trade License Number', 'text', { max: 40 }),
  F_('TaxCardNumber', 'Tax Card Number', 'text', { max: 40 }),
  F_('ComputerCardNumber', 'Computer Card Number', 'text', { max: 40 }),
  F_('ParentCompanyCR', 'Parent Company CR', 'text', { max: 40 }),
  F_('CountryOfIncorporation', 'Country of Incorporation', 'text', { required: true, max: 80 }),
  F_('LegalForm', 'Legal Form', 'text', { suggest: 'LEGAL_FORMS', max: 80 }),
  F_('RegisteredAddress', 'Registered Address', 'textarea'),
  F_('BusinessActivity', 'Business Activity', 'textarea'),
  F_('DateOfIncorporation', 'Date of Incorporation', 'date'),
  F_('CompanyStatus', 'Company Status', 'select', { options: ['Active', 'Inactive', 'Dormant', 'In Liquidation', 'Struck Off'], def: 'Active', required: true }),
  F_('ContactPerson', 'Contact Person', 'text'),
  F_('ContactEmail', 'Contact Email', 'email'),
  F_('ContactTelephone', 'Contact Telephone', 'text', { max: 40 })
], ['RiskRating', 'KycStatus', 'LastKycReviewDate', 'NextKycReviewDate', 'FolderID', 'AuthorizedUsers', 'IsTestData'].concat(COMMON_SYS));

T_('Engagements', 'Engagement', 'EngagementID', 'ENG', [
  F_('EngagementType', 'Engagement Type', 'select', { required: true, options: 'setting:ENGAGEMENT_TYPES' }),
  F_('StartDate', 'Engagement Start Date', 'date', { required: true }),
  F_('EndDate', 'Engagement End Date', 'date'),
  F_('PartnerManager', 'Engagement Partner/Manager', 'text'),
  F_('AssignedAuditor', 'Assigned Auditor', 'user'),
  F_('EngagementStatus', 'Engagement Status', 'select', { options: ['Proposed', 'Active', 'Completed', 'Cancelled'], def: 'Active', required: true }),
  F_('RiskLevel', 'Risk Level', 'select', { options: ['Not Rated'].concat(RISK_LEVELS), def: 'Not Rated', perm: 'RISK_EDIT_FINAL' }),
  F_('LastKycReviewDate', 'Last KYC Review Date', 'date', { ro: true }),
  F_('NextKycReviewDate', 'Next KYC Review Date', 'date', { ro: true })
], COMMON_SYS);
TABLES.Engagements.parent = 'CompanyID';

T_('UBOs', 'UBO', 'UBOID', 'UBO', [
  F_('FullName', 'Full Legal Name', 'text', { required: true }),
  F_('Nationality', 'Nationality', 'text', { required: true, max: 80 }),
  F_('DateOfBirth', 'Date of Birth', 'date'),
  F_('CountryOfResidence', 'Country of Residence', 'text', { max: 80 }),
  F_('QIDNumber', 'QID Number', 'text', { max: 20, sensitive: true, pattern: '^\\d{11}$', patternMsg: 'QID must be 11 digits.' }),
  F_('PassportNumber', 'Passport Number', 'text', { max: 30, sensitive: true }),
  F_('QFCNumber', 'QFC Number (if applicable)', 'text', { max: 40 }),
  F_('OwnershipPercentage', 'Ownership Percentage', 'number', { required: true, min: 0, max: 100 }),
  F_('VotingPercentage', 'Voting Percentage', 'number', { min: 0, max: 100 }),
  F_('OwnershipType', 'Ownership Type', 'select', { options: ['Shareholding', 'Voting rights', 'Control by other means', 'Senior managing official', 'Trust / arrangement role'] }),
  F_('DirectIndirect', 'Direct / Indirect Ownership', 'select', { options: ['Direct', 'Indirect', 'Both'] }),
  F_('PEPStatus', 'PEP Status', 'select', { options: ['Not screened', 'Not a PEP', 'PEP', 'Family member of PEP', 'Close associate of PEP'], def: 'Not screened' }),
  F_('SanctionsStatus', 'Sanctions Screening Status', 'select', { options: ['Not screened', 'Clear', 'Potential match', 'Confirmed match'], def: 'Not screened' }),
  F_('AdverseMediaStatus', 'Adverse Media Status', 'select', { options: ['Not screened', 'None identified', 'Negative media identified', 'Further review required'], def: 'Not screened' }),
  F_('SourceOfWealth', 'Source of Wealth', 'textarea'),
  F_('SourceOfFunds', 'Source of Funds', 'textarea'),
  F_('RiskRating', 'Risk Rating', 'select', { options: ['Not Rated'].concat(RISK_LEVELS), def: 'Not Rated', perm: 'RISK_EDIT_FINAL' }),
  F_('VerificationStatus', 'Verification Status', 'select', { options: ['Pending', 'In progress', 'Verified', 'Rejected'], def: 'Pending' }),
  F_('VerificationDate', 'Verification Date', 'date'),
  F_('Notes', 'Notes', 'textarea')
], COMMON_SYS);
TABLES.UBOs.parent = 'CompanyID';

T_('Shareholders', 'Shareholder', 'ShareholderID', 'SHR', [
  F_('ShareholderName', 'Shareholder Name', 'text', { required: true }),
  F_('EntityType', 'Entity / Individual', 'select', { required: true, options: ['Individual', 'Entity'] }),
  F_('Country', 'Country', 'text', { max: 80 }),
  F_('HoldingPercentage', 'Shareholding %', 'number', { required: true, min: 0.0001, max: 100 }),
  F_('HeldThroughID', 'Holds shares in (intermediate entity; blank = direct holder of the company)', 'ref', { refKind: 'Shareholder' }),
  F_('IsUltimateParent', 'Ultimate Parent', 'flag'),
  F_('IsNominee', 'Nominee Shareholder', 'flag'),
  F_('UBOID', 'Linked UBO record', 'ref', { refKind: 'UBO' }),
  F_('Notes', 'Notes', 'textarea')
], COMMON_SYS);
TABLES.Shareholders.parent = 'CompanyID';

T_('Documents', 'Document', 'DocumentID', 'DOC', [], [
  'DocType', 'Category', 'FileName', 'DriveFileID', 'FolderID', 'UploadedBy', 'UploadDate', 'ExpiryDate', 'Status',
  'VersionNo', 'VersionStatus', 'SupersededByID', 'Subject', 'Remarks', 'MimeType', 'SizeBytes', 'Checksum',
  'StatusChangedBy', 'StatusChangedAt'].concat(COMMON_SYS));
TABLES.Documents.parent = 'CompanyID';

T_('KYC_Reviews', 'Review', 'ReviewID', 'REV', [], [
  'EngagementID', 'CycleNo', 'Status', 'Checklist', 'RiskRatingAtReview', 'SubmittedBy', 'SubmittedAt', 'ReviewerEmail',
  'ReviewedAt', 'Decision', 'DecisionComments', 'ReviewDate', 'NextReviewDate', 'CreatedBy', 'CreatedAt', 'UpdatedBy', 'UpdatedAt']);
TABLES.KYC_Reviews.parent = 'CompanyID';

T_('Risk_Assessments', 'Risk', 'RiskID', 'RSK', [], [
  'EngagementID', 'Answers', 'Score', 'CalculatedRating', 'Escalations', 'FinalRating', 'FinalRatingBy', 'FinalRatingAt',
  'OverrideReason', 'ConfigVersion', 'Notes', 'IsCurrent', 'CreatedBy', 'CreatedAt', 'UpdatedBy', 'UpdatedAt']);
TABLES.Risk_Assessments.parent = 'CompanyID';

T_('Audit_Log', 'Audit', 'LogID', 'LOG', [], [
  'Timestamp', 'UserEmail', 'UserRole', 'Action', 'CompanyID', 'RecordType', 'RecordID', 'OldValue', 'NewValue',
  'ClientInfo', 'Comments', 'PrevHash', 'Hash']);

T_('Settings', 'Setting', 'Key', 'SET', [], ['Value', 'Description', 'UpdatedBy', 'UpdatedAt']);
T_('Error_Log', 'Error', 'ErrorID', 'ERR', [], ['Timestamp', 'UserEmail', 'Action', 'Message', 'Stack']);

var SHEET_ORDER = ['Users', 'Companies', 'Engagements', 'UBOs', 'Shareholders', 'Documents', 'KYC_Reviews',
  'Risk_Assessments', 'Audit_Log', 'Settings', 'Error_Log'];

function tableColumns_(name) {
  var t = TABLES[name], cols = [t.idCol];
  if (t.parent) cols.push(t.parent);
  t.fields.forEach(function (f) { cols.push(f.k); });
  t.sys.forEach(function (c) { if (cols.indexOf(c) < 0) cols.push(c); });
  return cols;
}

// ---------------------------------------------------------------- permissions
var PERMISSIONS = [
  'COMPANY_VIEW', 'COMPANY_CREATE', 'COMPANY_EDIT', 'COMPANY_DELETE', 'COMPANY_RESTORE',
  'ENGAGEMENT_MANAGE', 'ENGAGEMENT_DELETE', 'UBO_MANAGE', 'UBO_DELETE', 'OWNERSHIP_MANAGE', 'SHAREHOLDER_DELETE',
  'DOC_VIEW', 'DOC_UPLOAD', 'DOC_DELETE', 'DOC_STATUS',
  'KYC_EDIT', 'KYC_SUBMIT', 'KYC_REVIEW', 'KYC_REOPEN',
  'RISK_ASSESS', 'RISK_EDIT_FINAL', 'SENSITIVE_VIEW',
  'USER_MANAGE', 'ROLE_MANAGE', 'AUDIT_VIEW', 'AUDIT_VIEW_COMPANY', 'REPORT_VIEW',
  'SETTINGS_AML', 'SETTINGS_SYSTEM', 'BACKUP', 'DB_MANAGE', 'DRIVE_MANAGE'
];
/** Decisions that a System Administrator may not take unless ACCESS.sysadminCanApprove is enabled. */
var APPROVAL_PERMS = ['KYC_REVIEW', 'DOC_STATUS', 'RISK_EDIT_FINAL'];

function allPerms_(except) {
  var o = {};
  PERMISSIONS.forEach(function (p) { if (!except || except.indexOf(p) < 0) o[p] = true; });
  return o;
}
function pick_(list, extra) {
  var o = {};
  list.forEach(function (p) { o[p] = true; });
  for (var k in (extra || {})) o[k] = extra[k];
  return o;
}

var DEFAULT_ROLE_PERMISSIONS = {
  'MLRO': allPerms_(),
  'DMLRO': allPerms_(['ROLE_MANAGE', 'BACKUP', 'DB_MANAGE', 'DRIVE_MANAGE', 'SETTINGS_SYSTEM']),
  'System Administrator': pick_(['COMPANY_VIEW', 'DOC_VIEW', 'SENSITIVE_VIEW', 'USER_MANAGE', 'ROLE_MANAGE', 'AUDIT_VIEW',
    'AUDIT_VIEW_COMPANY', 'REPORT_VIEW', 'SETTINGS_SYSTEM', 'BACKUP', 'DB_MANAGE', 'DRIVE_MANAGE']),
  'Auditor': pick_(['COMPANY_VIEW', 'COMPANY_CREATE', 'COMPANY_EDIT', 'ENGAGEMENT_MANAGE', 'UBO_MANAGE', 'OWNERSHIP_MANAGE',
    'DOC_VIEW', 'DOC_UPLOAD', 'KYC_EDIT', 'KYC_SUBMIT', 'KYC_REOPEN', 'RISK_ASSESS', 'SENSITIVE_VIEW', 'AUDIT_VIEW_COMPANY', 'REPORT_VIEW'],
    { ENGAGEMENT_DELETE: 'own', UBO_DELETE: 'own', SHAREHOLDER_DELETE: 'own', DOC_DELETE: 'own' }),
  'Viewer': pick_(['COMPANY_VIEW', 'DOC_VIEW'])
};
var BUILTIN_ROLES = ['MLRO', 'DMLRO', 'System Administrator', 'Auditor', 'Viewer'];
/** Roles that only a user holding ROLE_MANAGE may assign. */
var PRIVILEGED_ROLES = ['MLRO', 'DMLRO', 'System Administrator'];

// ---------------------------------------------------------------- documents
var DOC_FOLDERS = ['Corporate Documents', 'Ownership & UBO', 'Identification Documents', 'Financial Documents',
  'Tax Documents', 'Engagement Documents', 'Other Documents', 'Review & Approval'];

function dt_(type, category, folder, multi, expires) { return { type: type, category: category, folder: folder, multi: !!multi, expires: !!expires }; }
var DEFAULT_DOC_TYPES = [
  dt_('Commercial Registration (CR)', 'Corporate', 'Corporate Documents', false, true),
  dt_('Trade License', 'Corporate', 'Corporate Documents', false, true),
  dt_('Articles of Association (AOA)', 'Corporate', 'Corporate Documents', false, false),
  dt_('Parent Company CR', 'Corporate', 'Corporate Documents', false, true),
  dt_('Computer Card', 'Corporate', 'Corporate Documents', false, true),
  dt_('Tax Card', 'Corporate', 'Tax Documents', false, true),
  dt_('Financial Statements', 'Financial', 'Financial Documents', true, false),
  dt_('Bank Statements', 'Financial', 'Financial Documents', true, false),
  dt_('QID', 'Identification', 'Identification Documents', true, true),
  dt_('Passport', 'Identification', 'Identification Documents', true, true),
  dt_('Ownership Chart', 'Ownership', 'Ownership & UBO', false, false),
  dt_('Shareholder Documents', 'Ownership', 'Ownership & UBO', true, false),
  dt_('UBO Documents', 'Ownership', 'Ownership & UBO', true, false),
  dt_('Engagement Letter', 'Other', 'Engagement Documents', true, false),
  dt_('Other Documents', 'Other', 'Other Documents', true, false),
  dt_('Review & Approval Evidence', 'Other', 'Review & Approval', true, false)
];

/** Illustrative defaults only - the MLRO must confirm against current QFC requirements. */
var DEFAULT_REQUIRED_DOCS = [
  { id: 'cr', label: 'Commercial Registration (CR)', types: ['Commercial Registration (CR)'], when: 'always' },
  { id: 'tl', label: 'Trade License', types: ['Trade License'], when: 'always' },
  { id: 'aoa', label: 'Articles of Association (AOA)', types: ['Articles of Association (AOA)'], when: 'always' },
  { id: 'cc', label: 'Computer Card', types: ['Computer Card'], when: 'always' },
  { id: 'tax', label: 'Tax Card', types: ['Tax Card'], when: 'always' },
  { id: 'pcr', label: 'Parent Company CR', types: ['Parent Company CR'], when: 'parentCR' },
  { id: 'chart', label: 'Ownership Chart', types: ['Ownership Chart'], when: 'always' },
  { id: 'ubo_id', label: 'UBO identification (QID or Passport) per UBO', types: ['QID', 'Passport'], when: 'perUBO' },
  { id: 'el', label: 'Engagement Letter', types: ['Engagement Letter'], when: 'always' }
];

var DEFAULT_CHECKLIST = [
  ['cr', 'CR verified'], ['tl', 'Trade License verified'], ['aoa', 'AOA reviewed'], ['cc', 'Computer Card verified'],
  ['tax', 'Tax Card verified'], ['pcr', 'Parent CR verified'], ['own', 'Ownership structure verified'],
  ['ubo', 'UBO identified'], ['ubo_id', 'UBO ID verified'], ['qid_pp', 'QID/Passport verified'],
  ['fin', 'Financial information reviewed'], ['bank', 'Bank statement reviewed where applicable'],
  ['pep', 'PEP screening completed'], ['sanc', 'Sanctions screening completed'], ['adv', 'Adverse media screening completed'],
  ['sow', 'Source of Wealth assessed'], ['sof', 'Source of Funds assessed'], ['risk', 'Risk rating completed']
].map(function (a) { return { id: a[0], label: a[1] }; });

function ro_(v, s, esc) { return { v: v, s: s, esc: !!esc }; }
function rf_(id, cat, label, w, opts) { return { id: id, category: cat, label: label, weight: w, options: opts }; }

/** Illustrative default risk methodology. Fully replaceable by the MLRO in Settings. */
var DEFAULT_RISK_CONFIG = {
  version: 1,
  note: 'Illustrative default methodology. The MLRO must review and replace factors, weights and thresholds in line with the firm\'s AML policy and current QFC requirements.',
  thresholds: { mediumFrom: 35, highFrom: 65 },
  factors: [
    rf_('customer_type', 'Customer Risk', 'Customer type', 1, [ro_('Regulated / listed entity', 0), ro_('Private company - simple', 1), ro_('Private company - complex', 2), ro_('Trust / foundation / NPO', 3)]),
    rf_('legal_structure', 'Customer Risk', 'Legal structure', 1, [ro_('Standard corporate structure', 0), ro_('Branch / subsidiary of foreign group', 1), ro_('Multi-layered / holding structure', 2), ro_('Bearer shares or similar', 3)]),
    rf_('industry', 'Customer Risk', 'Industry / business activity', 1, [ro_('Low-risk sector', 0), ro_('Standard sector', 1), ro_('Elevated-risk sector', 2), ro_('High-risk sector (e.g. cash-intensive)', 3)]),
    rf_('ownership_complexity', 'Customer Risk', 'Ownership complexity', 1, [ro_('Simple (direct individuals)', 0), ro_('Moderate (one intermediate layer)', 1), ro_('Complex (multiple layers / jurisdictions)', 3)]),
    rf_('geo_incorporation', 'Geographic Risk', 'Country of incorporation', 1, [ro_('Low-risk jurisdiction', 0), ro_('Standard jurisdiction', 1), ro_('Elevated-risk jurisdiction', 2), ro_('High-risk jurisdiction (per firm list)', 3, true)]),
    rf_('geo_residence', 'Geographic Risk', 'Country of residence (UBOs / management)', 1, [ro_('Low-risk jurisdiction', 0), ro_('Standard jurisdiction', 1), ro_('Elevated-risk jurisdiction', 2), ro_('High-risk jurisdiction (per firm list)', 3, true)]),
    rf_('geo_operations', 'Geographic Risk', 'Countries of operation', 1, [ro_('Domestic / low-risk only', 0), ro_('Some standard jurisdictions', 1), ro_('Elevated-risk jurisdictions', 2), ro_('High-risk jurisdictions (per firm list)', 3)]),
    rf_('nominee', 'Ownership Risk', 'Nominee shareholders', 1, [ro_('None', 0), ro_('Nominees - disclosed principals', 2), ro_('Nominees - undisclosed', 3, true)]),
    rf_('trust', 'Ownership Risk', 'Trust structures', 1, [ro_('None', 0), ro_('Trust in structure - transparent', 2), ro_('Trust in structure - opaque', 3)]),
    rf_('ubo_clarity', 'Ownership Risk', 'UBO identification', 2, [ro_('UBOs identified and verified', 0), ro_('Identified - verification pending', 1), ro_('Unclear / cannot identify UBO', 3, true)]),
    rf_('ubo_risk', 'Ownership Risk', 'High-risk UBO', 1, [ro_('No UBO rated high', 0), ro_('UBO rated medium', 1), ro_('UBO rated high', 3)]),
    rf_('pep', 'PEP', 'PEP status', 2, [ro_('No PEP identified', 0), ro_('PEP associate / family member', 2), ro_('PEP identified', 3, true)]),
    rf_('sanctions', 'Sanctions', 'Sanctions screening result', 2, [ro_('Clear', 0), ro_('Not screened', 2), ro_('Potential match', 3, true), ro_('Confirmed match', 3, true)]),
    rf_('adverse_media', 'Adverse Media', 'Adverse media', 1, [ro_('No adverse media identified', 0), ro_('Further review required', 2), ro_('Negative media identified', 3)]),
    rf_('engagement_type', 'Engagement Risk', 'Engagement type', 1, [ro_('Statutory audit / assurance', 0), ro_('Tax / advisory / consulting', 1), ro_('Accounting / bookkeeping / outsourcing', 2)]),
    rf_('services_nature', 'Engagement Risk', 'Nature of services', 1, [ro_('Routine', 0), ro_('Involves client transactions handling', 2), ro_('Complex / structuring services', 3)]),
    rf_('transaction_exposure', 'Engagement Risk', 'Transaction exposure', 1, [ro_('Low', 0), ro_('Medium', 1), ro_('High', 3)]),
    rf_('cash_exposure', 'Engagement Risk', 'Cash exposure', 1, [ro_('None', 0), ro_('Limited', 1), ro_('Significant', 3)])
  ]
};

var DEFAULT_SETTINGS = {
  ENGAGEMENT_TYPES: {
    v: ['Audit', 'Tax', 'ICV', 'Advisory', 'Internal Audit', 'IT Audit', 'AML/KYC', 'Accounting', 'Consulting', 'Other'],
    d: 'Engagement types available when adding an engagement (JSON array of strings).'
  },
  LEGAL_FORMS: {
    v: ['Limited Liability Company (LLC)', 'Limited Liability Partnership (LLP)', 'Branch', 'Private Company Limited by Shares', 'Public Company', 'Protected Cell Company', 'Partnership', 'Other'],
    d: 'Suggested legal forms (JSON array of strings).'
  },
  DOC_TYPES: { v: DEFAULT_DOC_TYPES, d: 'Document types: {type, category, folder, multi, expires}. "folder" must be one of the company subfolders. multi=false means a new upload automatically supersedes the current one.' },
  REQUIRED_DOCS: { v: DEFAULT_REQUIRED_DOCS, d: 'Mandatory documents: {id,label,types[],when: always|parentCR|perUBO}. A requirement is met by a Current, non-rejected, non-expired document of any listed type.' },
  CHECKLIST_ITEMS: { v: DEFAULT_CHECKLIST, d: 'KYC review checklist items: {id,label}.' },
  REVIEW_FREQUENCY_MONTHS: { v: { Low: 36, Medium: 24, High: 12 }, d: 'Months until next KYC review, by final risk rating.' },
  KYC_DUE_WINDOW_DAYS: { v: 30, d: 'A KYC review is "due" when the next review date falls within this many days.' },
  EXPIRY_WARNING_DAYS: { v: [7, 30, 60, 90], d: 'Document expiry alert windows (days).' },
  APPROVAL_REQUIREMENTS: {
    v: { requireChecklistComplete: true, requireFinalRiskRating: true, requireMandatoryDocuments: true, requireUbo: true, blockOnConfirmedSanctions: true, allowSelfApproval: false },
    d: 'Conditions that must be met before a KYC review can be approved.'
  },
  RISK_CONFIG: { v: DEFAULT_RISK_CONFIG, d: 'Risk methodology: factors, option scores, weights, escalation flags and thresholds.' },
  HIGH_RISK_JURISDICTIONS: { v: [], d: 'Firm-maintained list of high-risk jurisdictions (JSON array of country names). Used only to suggest risk answers.' },
  FILE_RULES: {
    v: { maxMB: 10, allowedExt: ['pdf', 'png', 'jpg', 'jpeg', 'doc', 'docx', 'xls', 'xlsx'] },
    d: 'Upload restrictions. maxMB is capped at 25 by the platform design.'
  },
  ACCESS: {
    v: { restrictToAssigned: false, allowedDomains: [], sysadminCanApprove: false, uboThresholdPercent: 25 },
    d: 'restrictToAssigned: Auditors/Viewers only see companies they created, are assigned to or are listed on. allowedDomains: optional email-domain allowlist. uboThresholdPercent: effective ownership at/above which an individual is flagged if not recorded as UBO (confirm against current rules).'
  },
  NOTIFICATIONS: {
    v: { enabled: false, events: { KYC_SUBMITTED: true, KYC_REJECTED: true, KYC_APPROVED: true, HIGH_RISK: true, DOC_EXPIRY: true, KYC_DUE: true }, extraRecipients: [] },
    d: 'Email notifications. Emails never contain identity numbers or document content.'
  },
  ROLE_PERMISSIONS: { v: DEFAULT_ROLE_PERMISSIONS, d: 'Role -> permission map. true = allowed, "own" = allowed only on records the user created.' },
  BACKUP_RETENTION_DAYS: { v: 0, d: 'Informational retention policy for backups. 0 = keep forever. Backups are never deleted automatically.' }
};

/** Which permission edits which setting key. */
var SETTING_PERMS = {
  ENGAGEMENT_TYPES: 'SETTINGS_AML', LEGAL_FORMS: 'SETTINGS_AML', DOC_TYPES: 'SETTINGS_AML', REQUIRED_DOCS: 'SETTINGS_AML',
  CHECKLIST_ITEMS: 'SETTINGS_AML', REVIEW_FREQUENCY_MONTHS: 'SETTINGS_AML', KYC_DUE_WINDOW_DAYS: 'SETTINGS_AML',
  EXPIRY_WARNING_DAYS: 'SETTINGS_AML', APPROVAL_REQUIREMENTS: 'SETTINGS_AML', RISK_CONFIG: 'SETTINGS_AML',
  HIGH_RISK_JURISDICTIONS: 'SETTINGS_AML', FILE_RULES: 'SETTINGS_SYSTEM', ACCESS: 'SETTINGS_SYSTEM',
  NOTIFICATIONS: 'SETTINGS_SYSTEM', ROLE_PERMISSIONS: 'ROLE_MANAGE', BACKUP_RETENTION_DAYS: 'SETTINGS_SYSTEM'
};
