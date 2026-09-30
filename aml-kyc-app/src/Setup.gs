/**
 * Setup.gs - first-run setup and admin entry points.
 * These functions are public (callable from the editor / triggers) so each is guarded by assertOwner_():
 * only the script owner (or a trigger) may run them, never a web-app user via google.script.run.
 */

function assertOwner_() {
  var active = normEmail_(Session.getActiveUser().getEmail()), owner = normEmail_(Session.getEffectiveUser().getEmail());
  if (active && active !== owner) fail_('This function can only be run by the script owner.', 'FORBIDDEN');
}

/** Creates DB spreadsheet, sheets, headers, Drive folders, first System Administrator and default settings. Idempotent. */
function setupAMLSystem() {
  assertOwner_();
  resetMemo_();
  var summary = { steps: [], warnings: [] }, props = PropertiesService.getScriptProperties();

  // 1. spreadsheet
  var ss = null, id = props.getProperty(PROP.DB_ID);
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { summary.warnings.push('Stored database could not be opened: ' + e.message); } }
  if (!ss) { ss = SpreadsheetApp.create(APP.DB_NAME); props.setProperty(PROP.DB_ID, ss.getId()); summary.steps.push('Created database spreadsheet'); }
  else summary.steps.push('Database spreadsheet already exists - reused');

  // 2/5. worksheets + headers (adds missing columns, never removes data)
  SHEET_ORDER.forEach(function (name) {
    var sh = ss.getSheetByName(name), cols = tableColumns_(name), created = false;
    if (!sh) { sh = ss.insertSheet(name); created = true; }
    var have = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String).filter(String) : [];
    var missing = cols.filter(function (c) { return have.indexOf(c) < 0; });
    var n = have.length + missing.length;
    if (sh.getMaxColumns() < n) sh.insertColumnsAfter(sh.getMaxColumns(), n - sh.getMaxColumns());   // must precede writes
    if (missing.length) sh.getRange(1, have.length + 1, 1, missing.length).setValues([missing]);
    sh.getRange(1, 1, 1, n).setFontWeight('bold').setBackground('#0b3a5b').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    sh.getRange(1, 1, sh.getMaxRows(), n).setNumberFormat('@');   // plain text: no date/number/formula coercion
    if (created || missing.length) summary.steps.push((created ? 'Created sheet ' : 'Updated headers of ') + name);
  });
  var blank = ss.getSheetByName('Sheet1');
  if (blank && ss.getSheets().length > 1 && blank.getLastRow() === 0) ss.deleteSheet(blank);
  try { // audit log: only the owner may edit it by hand
    var prot = ss.getSheetByName('Audit_Log').protect().setDescription('Audit log - append-only, do not edit');
    prot.removeEditors(prot.getEditors().filter(function (u) { return u.getEmail() !== Session.getEffectiveUser().getEmail(); }));
    if (prot.canDomainEdit()) prot.setDomainEdit(false);
  } catch (e) { summary.warnings.push('Could not protect Audit_Log: ' + e.message); }
  resetMemo_();

  // 3/4. Drive
  driveSetup_();
  summary.steps.push('Drive structure verified (' + APP.ROOT_FOLDER_NAME + '/Companies, System Documents)');

  // 7. default settings (only missing keys)
  var existing = {}; dbAll_('Settings').forEach(function (r) { existing[r.Key] = 1; });
  Object.keys(DEFAULT_SETTINGS).forEach(function (k) {
    if (existing[k]) return;
    dbInsert_('Settings', { Key: k, Value: JSON.stringify(DEFAULT_SETTINGS[k].v), Description: DEFAULT_SETTINGS[k].d, UpdatedBy: 'SETUP', UpdatedAt: nowIso_() });
    summary.steps.push('Default setting ' + k);
  });
  resetMemo_();

  // 6. initial System Administrator
  var owner = normEmail_(Session.getEffectiveUser().getEmail());
  if (!owner) summary.warnings.push('Could not determine owner email; add the first user manually in the Users sheet.');
  else if (!dbAll_('Users').some(function (u) { return normEmail_(u.Email) === owner; })) {
    var u = dbInsert_('Users', { Name: 'System Administrator', Email: owner, Role: 'System Administrator', Department: 'IT', Status: 'Active', DateAdded: nowIso_(), AddedBy: 'SETUP', Notes: 'Initial administrator created by setup' });
    audit_({ Email: 'SETUP', Role: 'SYSTEM' }, 'User Created', { recordType: 'User', recordId: u.UserID, newValue: { Email: owner, Role: 'System Administrator' } });
    summary.steps.push('Created initial System Administrator: ' + owner);
  }

  // 8. verify permissions
  ['SpreadsheetApp', 'DriveApp', 'MailApp', 'LockService', 'CacheService'].forEach(function (svc) {
    try {
      if (svc === 'SpreadsheetApp') SpreadsheetApp.openById(props.getProperty(PROP.DB_ID)).getName();
      if (svc === 'DriveApp') DriveApp.getFolderById(props.getProperty(PROP.ROOT_ID)).getName();
      if (svc === 'MailApp') MailApp.getRemainingDailyQuota();
      if (svc === 'LockService') LockService.getScriptLock();
      if (svc === 'CacheService') CacheService.getScriptCache().put('setup', '1', 5);
    } catch (e) { summary.warnings.push(svc + ' check failed: ' + e.message); }
  });
  audit_({ Email: owner || 'SETUP', Role: 'System Administrator' }, 'System Setup', { recordType: 'System', comments: summary.steps.length + ' step(s); ' + summary.warnings.length + ' warning(s)' });
  summary.databaseUrl = ss.getUrl();
  summary.webAppUrl = appUrl_();
  summary.next = ['Deploy as Web App (Execute as: Me, Access: your domain)', 'Sign in and add MLRO / DMLRO / Auditor / Viewer users in User Management', 'Review Settings (required documents, risk methodology, review frequencies)', 'Run installTriggers() for daily expiry checks'];
  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

/** Installs the daily maintenance trigger (idempotent). */
function installTriggers() {
  assertOwner_();
  var has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'dailyMaintenance'; });
  if (!has) ScriptApp.newTrigger('dailyMaintenance').timeBased().everyDays(1).atHour(6).create();
  return has ? 'Trigger already installed' : 'Daily trigger installed (06:00)';
}

/** Trigger entry point. Throttled so repeated external invocation cannot spam notifications. */
function dailyMaintenance() {
  assertOwner_();
  resetMemo_();
  var props = PropertiesService.getScriptProperties(), last = props.getProperty(PROP.MAINT_LAST);
  if (last && Date.now() - Number(last) < 6 * 3600 * 1000) return 'Skipped (ran recently)';
  props.setProperty(PROP.MAINT_LAST, String(Date.now()));
  return runMaintenance_();
}

// ------------------------------------------------------------------ test data (development only)
var TEST_NAME = 'TEST COMPANY - DO NOT USE';

/** Creates clearly-labelled fake data. Remove with removeTestData() before production. */
function seedTestData() {
  assertOwner_();
  resetMemo_();
  var owner = normEmail_(Session.getEffectiveUser().getEmail());
  var user = dbAll_('Users').filter(function (u) { return normEmail_(u.Email) === owner; })[0];
  if (!user) fail_('Run setupAMLSystem() first.');
  if (dbAll_('Companies').some(function (c) { return c.LegalName === TEST_NAME; })) return 'Test data already present';
  var sysUser = { Email: owner, Role: 'MLRO', UserID: user.UserID, Status: 'Active', Name: user.Name };
  _memo.user = sysUser;
  return withLock_(function () {
    var c = companyCreate_(sysUser, { __test: true, LegalName: TEST_NAME, TradingName: 'TEST', QFCNumber: 'TEST-0001', CRNumber: 'TEST-CR-0001', CountryOfIncorporation: 'Qatar', LegalForm: 'Limited Liability Company (LLC)', CompanyStatus: 'Active', BusinessActivity: 'Fictitious test entity', ContactPerson: 'Test Contact', ContactEmail: 'test@example.invalid' }).company;
    childSave_(sysUser, 'Engagement', { CompanyID: c.CompanyID, EngagementType: 'Audit', StartDate: '2026-01-01', PartnerManager: 'Test Partner', EngagementStatus: 'Active' });
    var parent = childSave_(sysUser, 'Shareholder', { CompanyID: c.CompanyID, ShareholderName: 'TEST HOLDING LLC', EntityType: 'Entity', Country: 'Qatar', HoldingPercentage: 100 }).record;
    var ubo = childSave_(sysUser, 'UBO', { CompanyID: c.CompanyID, FullName: 'TEST PERSON', Nationality: 'Testland', OwnershipPercentage: 60, DirectIndirect: 'Indirect', PEPStatus: 'Not a PEP', SanctionsStatus: 'Clear', AdverseMediaStatus: 'None identified', VerificationStatus: 'Pending' }).record;
    childSave_(sysUser, 'Shareholder', { CompanyID: c.CompanyID, ShareholderName: 'TEST PERSON', EntityType: 'Individual', Country: 'Testland', HoldingPercentage: 60, HeldThroughID: parent.ShareholderID, UBOID: ubo.UBOID });
    childSave_(sysUser, 'Shareholder', { CompanyID: c.CompanyID, ShareholderName: 'TEST PERSON 2', EntityType: 'Individual', Country: 'Testland', HoldingPercentage: 40, HeldThroughID: parent.ShareholderID });
    audit_(sysUser, 'Test Data Seeded', { companyId: c.CompanyID, recordType: 'System', comments: TEST_NAME });
    return 'Seeded ' + c.CompanyID;
  });
}

/** Physically removes all test companies and their child records (audit entries are kept). */
function removeTestData() {
  assertOwner_();
  resetMemo_();
  var ids = dbAll_('Companies').filter(function (c) { return c.IsTestData === 'Y'; }).map(function (c) { return c.CompanyID; }), n = 0;
  ['Engagements', 'UBOs', 'Shareholders', 'Documents', 'KYC_Reviews', 'Risk_Assessments'].forEach(function (t) {
    dbAll_(t).filter(function (r) { return ids.indexOf(r.CompanyID) >= 0; }).forEach(function (r) { dbHardDelete_(t, r[TABLES[t].idCol]); n++; });
  });
  dbAll_('Companies').filter(function (c) { return ids.indexOf(c.CompanyID) >= 0; }).forEach(function (c) {
    try { if (c.FolderID) DriveApp.getFolderById(c.FolderID).setTrashed(true); } catch (e) { }
    dbHardDelete_('Companies', c.CompanyID); n++;
  });
  audit_({ Email: normEmail_(Session.getEffectiveUser().getEmail()), Role: 'System Administrator' }, 'Test Data Removed', { recordType: 'System', comments: ids.join(',') || 'none' });
  return 'Removed ' + ids.length + ' test companies, ' + n + ' rows';
}
