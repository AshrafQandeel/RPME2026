/** CompanyService.gs - company master records, engagements (generic child CRUD lives here too). */

function visibleCompanies_(user, includeDeleted) {
  var all = dbAll_('Companies').filter(function (c) { return includeDeleted || !isDeleted_(c); });
  if (!(getSetting_('ACCESS') || {}).restrictToAssigned || ['MLRO', 'DMLRO', 'System Administrator'].indexOf(user.Role) >= 0) return all.filter(function () { return gate_(user, 'COMPANY_VIEW'); });
  var engsBy = groupBy_(live_(dbAll_('Engagements')), 'CompanyID');
  return all.filter(function (c) { return canAccessCompany_(user, c, engsBy[c.CompanyID] || []); });
}

function companyOut_(user, c) {
  var o = outRecord_(user, 'Company', c);
  var block = editBlockReason_(user, c);
  o._perm = {
    edit: hasPermission_(user, 'COMPANY_EDIT') && !block && !isDeleted_(c),
    del: hasPermission_(user, 'COMPANY_DELETE') && !isDeleted_(c),
    restore: hasPermission_(user, 'COMPANY_RESTORE') && isDeleted_(c),
    lockReason: block
  };
  return o;
}

/** Duplicate detection on QFC no., CR no. and company name (deleted records included). */
function checkCompanyDuplicates_(v, excludeId) {
  var errs = [];
  dbAll_('Companies').forEach(function (c) {
    if (c.CompanyID === excludeId) return;
    var tag = isDeleted_(c) ? ' (found in deleted records - ask the MLRO to restore it)' : '';
    if (v.QFCNumber && normId_(c.QFCNumber) === normId_(v.QFCNumber)) errs.push('QFC number already registered' + tag + '.');
    if (v.CRNumber && normId_(c.CRNumber) === normId_(v.CRNumber)) errs.push('CR number already registered' + tag + '.');
    if (v.LegalName && normName_(c.LegalName) && normName_(c.LegalName) === normName_(v.LegalName)) errs.push('Company already exists' + tag + '.');
  });
  if (errs.length) fail_(unique_(errs).join(' '), 'DUPLICATE');
}

function companyCreate_(user, p) {
  requirePermission_(user, 'COMPANY_CREATE');
  var v = validateFields_(TABLES.Companies.fields, p, { create: true, user: user });
  if (!v.QFCNumber && !v.CRNumber) fail_('Provide at least a QFC number or a CR number.', 'VALIDATION');
  checkCompanyDuplicates_(v, null);
  var id = nextId_('Companies'), folder;
  try { folder = ensureCompanyFolder_(id, v.LegalName, ''); } catch (e) { logError_(user, 'createCompanyFolder', e); fail_('Google Drive folder could not be created.', 'DRIVE'); }
  var now = nowIso_();
  v.CompanyID = id; v.RiskRating = 'Not Rated'; v.KycStatus = KYC.DRAFT; v.FolderID = folder.getId(); v.AuthorizedUsers = '';
  v.IsTestData = p.__test === true && user.Role !== 'Viewer' ? 'Y' : ''; v.IsDeleted = '';
  v.CreatedBy = user.Email; v.CreatedAt = now; v.UpdatedBy = user.Email; v.UpdatedAt = now;
  var rec;
  try { rec = dbInsert_('Companies', v); } catch (e) { logError_(user, 'createCompany', e); fail_('Database update failed.', 'DB'); }
  kycCreateReview_(user, id, 1);
  audit_(user, 'Company Created', { companyId: id, recordType: 'Company', recordId: id, newValue: outRecord_(user, 'Company', rec) });
  return { company: companyOut_(user, rec) };
}

function companyUpdate_(user, p) {
  requirePermission_(user, 'COMPANY_EDIT');
  var c = requireCompany_(user, p.id);
  assertEditable_(user, c);
  var v = validateFields_(TABLES.Companies.fields, p, { create: false, user: user });
  if (p.hasOwnProperty('AuthorizedUsers') && hasPermission_(user, 'COMPANY_RESTORE')) {
    var list = String(p.AuthorizedUsers || '').split(/[,;\s]+/).map(normEmail_).filter(Boolean);
    list.forEach(function (e) { if (!isEmail_(e)) fail_('Authorised users must be valid emails.', 'VALIDATION'); });
    v.AuthorizedUsers = list.join(',');
  }
  var after = {}; for (var k in c) after[k] = v[k] !== undefined ? v[k] : c[k];
  if (!after.QFCNumber && !after.CRNumber) fail_('Provide at least a QFC number or a CR number.', 'VALIDATION');
  checkCompanyDuplicates_(after, c.CompanyID);
  var keys = TABLES.Companies.fields.map(function (f) { return f.k; }).concat(['AuthorizedUsers']);
  var d = diff_(c, after, keys);
  if (!d.changed) return { company: companyOut_(user, c) };
  v.UpdatedBy = user.Email; v.UpdatedAt = nowIso_();
  var rec = dbUpdate_('Companies', c.CompanyID, v);
  if (d.neu.LegalName !== undefined && c.FolderID) renameCompanyFolder_(c.FolderID, c.CompanyID, rec.LegalName);
  audit_(user, 'Company Updated', { companyId: c.CompanyID, recordType: 'Company', recordId: c.CompanyID, oldValue: d.old, newValue: d.neu });
  return { company: companyOut_(user, rec) };
}

function companyDelete_(user, p) {
  requirePermission_(user, 'COMPANY_DELETE');
  var c = requireCompany_(user, p.id);
  if (!String(p.reason || '').trim()) fail_('A reason is required to delete a company.', 'VALIDATION');
  dbUpdate_('Companies', c.CompanyID, { IsDeleted: 'Y', DeletedBy: user.Email, DeletedAt: nowIso_(), UpdatedBy: user.Email, UpdatedAt: nowIso_() });
  audit_(user, 'Company Deleted', { companyId: c.CompanyID, recordType: 'Company', recordId: c.CompanyID, oldValue: { LegalName: c.LegalName, KycStatus: c.KycStatus }, comments: String(p.reason) + ' (soft delete; Drive folder and history retained)' });
  return { deleted: c.CompanyID };
}

function companyRestore_(user, p) {
  requirePermission_(user, 'COMPANY_RESTORE');
  var c = requireCompany_(user, p.id, true);
  if (!isDeleted_(c)) fail_('Company is not deleted.');
  var rec = dbUpdate_('Companies', c.CompanyID, { IsDeleted: '', DeletedBy: '', DeletedAt: '', UpdatedBy: user.Email, UpdatedAt: nowIso_() });
  audit_(user, 'Company Restored', { companyId: c.CompanyID, recordType: 'Company', recordId: c.CompanyID, comments: p.reason || '' });
  return { company: companyOut_(user, rec) };
}

function companyGet_(user, p) {
  var c = requireCompany_(user, p.id, true);
  var cid = c.CompanyID;
  var engs = dbWhere_('Engagements', function (e) { return e.CompanyID === cid && !isDeleted_(e); });
  var ubos = dbWhere_('UBOs', function (e) { return e.CompanyID === cid && !isDeleted_(e); });
  var shs = dbWhere_('Shareholders', function (e) { return e.CompanyID === cid && !isDeleted_(e); });
  var res = function (rows, kind) {
    var spec = CHILD_[kind];
    return rows.map(function (r) {
      var o = outRecord_(user, kind, r);
      o._perm = { edit: hasPermission_(user, spec.perm) && !editBlockReason_(user, c), del: hasPermission_(user, spec.delPerm, r) && !editBlockReason_(user, c) };
      return o;
    });
  };
  var review = kycCurrent_(cid), risk = riskCurrent_(cid);
  return {
    company: companyOut_(user, c), engagements: res(engs, 'Engagement'), ubos: res(ubos, 'UBO'), shareholders: res(shs, 'Shareholder'),
    ownership: ownershipAnalysis_(shs, ubos), uboWarnings: uboWarnings_(ubos),
    review: review ? { ReviewID: review.ReviewID, Status: review.Status, CycleNo: review.CycleNo } : null,
    proposedRating: risk ? risk.CalculatedRating : '', finalRating: c.RiskRating,
    can: { addEngagement: hasPermission_(user, 'ENGAGEMENT_MANAGE') && !editBlockReason_(user, c), addUbo: hasPermission_(user, 'UBO_MANAGE') && !editBlockReason_(user, c), addShareholder: hasPermission_(user, 'OWNERSHIP_MANAGE') && !editBlockReason_(user, c) }
  };
}

/** Company list with filters, sorting and server-side paging. */
function companyList_(user, f) {
  f = f || {};
  var today = todayStr_(), q = String(f.q || '').trim().toLowerCase();
  var engsBy = groupBy_(live_(dbAll_('Engagements')), 'CompanyID');
  var docsBy = groupBy_(live_(dbAll_('Documents')), 'CompanyID');
  var ubosBy = groupBy_(live_(dbAll_('UBOs')), 'CompanyID');
  var incDel = !!f.includeDeleted && hasPermission_(user, 'COMPANY_RESTORE');
  var rows = [];
  visibleCompanies_(user, incDel).forEach(function (c) {
    var engs = engsBy[c.CompanyID] || [], docs = docsBy[c.CompanyID] || [];
    if (q && [c.LegalName, c.TradingName, c.QFCNumber, c.CRNumber, c.CompanyID].join(' ').toLowerCase().indexOf(q) < 0) return;
    if (f.risk && c.RiskRating !== f.risk) return;
    if (f.reviewStatus && c.KycStatus !== f.reviewStatus) return;
    if (f.companyStatus && c.CompanyStatus !== f.companyStatus) return;
    if (f.pendingOnly && KYC_PENDING.indexOf(c.KycStatus) < 0) return;
    if (f.engagementType && !engs.some(function (e) { return e.EngagementType === f.engagementType; })) return;
    if (f.auditor && !engs.some(function (e) { return e.AssignedAuditor === normEmail_(f.auditor); }) && normEmail_(c.CreatedBy) !== normEmail_(f.auditor)) return;
    if (f.dateFrom && c.CreatedAt.substr(0, 10) < f.dateFrom) return;
    if (f.dateTo && c.CreatedAt.substr(0, 10) > f.dateTo) return;
    var cur = docs.filter(function (d) { return d.VersionStatus === 'Current'; });
    if (f.docStatus && !cur.some(function (d) { return effStatus_(d, today) === f.docStatus; })) return;
    if ((f.expiryFrom || f.expiryTo) && !cur.some(function (d) { return d.ExpiryDate && (!f.expiryFrom || d.ExpiryDate >= f.expiryFrom) && (!f.expiryTo || d.ExpiryDate <= f.expiryTo); })) return;
    var reqs = requirementStatus_(c, docs, ubosBy[c.CompanyID] || []);
    rows.push({
      CompanyID: c.CompanyID, LegalName: c.LegalName, QFCNumber: c.QFCNumber, CRNumber: c.CRNumber, RiskRating: c.RiskRating,
      KycStatus: c.KycStatus, NextKycReviewDate: c.NextKycReviewDate, CompanyStatus: c.CompanyStatus, IsDeleted: c.IsDeleted,
      Engagements: unique_(engs.map(function (e) { return e.EngagementType; })).join(', '),
      Missing: reqs.filter(function (r) { return !r.met; }).length,
      Expired: cur.filter(function (d) { return effStatus_(d, today) === 'Expired'; }).length,
      Overdue: !!(c.NextKycReviewDate && c.NextKycReviewDate < today)
    });
  });
  var sort = ['LegalName', 'RiskRating', 'KycStatus', 'NextKycReviewDate', 'CompanyID'].indexOf(f.sort) >= 0 ? f.sort : 'LegalName', dir = f.dir === 'desc' ? -1 : 1;
  rows.sort(function (a, b) { var x = String(a[sort]).toLowerCase(), y = String(b[sort]).toLowerCase(); return x < y ? -dir : x > y ? dir : 0; });
  var size = Math.min(Number(f.pageSize) || 25, 100), page = Math.max(Number(f.page) || 1, 1);
  return { total: rows.length, page: page, pageSize: size, rows: rows.slice((page - 1) * size, page * size) };
}

// ------------------------------------------------------------ generic child records (engagement / UBO / shareholder)

function childSave_(user, kind, p) {
  var spec = CHILD_[kind], t = TABLES[spec.table];
  var existing = p.id ? dbGet_(spec.table, p.id) : null;
  if (p.id && (!existing || isDeleted_(existing))) fail_(spec.label + ' not found.', 'NOT_FOUND');
  var company = requireCompany_(user, existing ? existing.CompanyID : String(p.CompanyID || ''));
  requirePermission_(user, spec.perm);
  assertEditable_(user, company);
  var v = validateFields_(t.fields, p, { create: !existing, user: user });
  if (!existing) t.fields.forEach(function (f) { if (v[f.k] === undefined) v[f.k] = f.def !== undefined ? f.def : ''; });
  var warnings = spec.check(v, { company: company, existing: existing, user: user }) || [];
  var keys = t.fields.map(function (f) { return f.k; }), rec, now = nowIso_();
  if (existing) {
    var after = {}; for (var k in existing) after[k] = v[k] !== undefined ? v[k] : existing[k];
    var d = diff_(existing, after, keys);
    if (!d.changed) return { record: outRecord_(user, kind, existing), warnings: warnings };
    v.UpdatedBy = user.Email; v.UpdatedAt = now;
    rec = dbUpdate_(spec.table, existing[t.idCol], v);
    audit_(user, spec.label + ' Updated', { companyId: company.CompanyID, recordType: spec.label, recordId: rec[t.idCol], oldValue: d.old, newValue: d.neu });
  } else {
    v.CompanyID = company.CompanyID; v.IsDeleted = ''; v.CreatedBy = user.Email; v.CreatedAt = now; v.UpdatedBy = user.Email; v.UpdatedAt = now;
    rec = dbInsert_(spec.table, v);
    audit_(user, spec.label + ' Added', { companyId: company.CompanyID, recordType: spec.label, recordId: rec[t.idCol], newValue: outRecord_(user, kind, rec) });
  }
  return { record: outRecord_(user, kind, rec), warnings: warnings.concat(spec.post ? spec.post(company) : []) };
}

function childDelete_(user, kind, p) {
  var spec = CHILD_[kind], t = TABLES[spec.table];
  var rec = dbGet_(spec.table, String(p.id || ''));
  if (!rec || isDeleted_(rec)) fail_(spec.label + ' not found.', 'NOT_FOUND');
  var company = requireCompany_(user, rec.CompanyID);
  requirePermission_(user, spec.delPerm, rec);
  assertEditable_(user, company);
  if (!String(p.reason || '').trim()) fail_('A reason is required to delete a record.', 'VALIDATION');
  if (spec.beforeDelete) spec.beforeDelete(rec);
  dbUpdate_(spec.table, rec[t.idCol], { IsDeleted: 'Y', DeletedBy: user.Email, DeletedAt: nowIso_(), UpdatedBy: user.Email, UpdatedAt: nowIso_() });
  audit_(user, spec.label + ' Deleted', { companyId: company.CompanyID, recordType: spec.label, recordId: rec[t.idCol], oldValue: outRecord_(user, kind, rec), comments: String(p.reason) });
  return { deleted: rec[t.idCol], warnings: spec.post ? spec.post(company) : [] };
}

function engagementCheck_(v, ctx) {
  var start = v.StartDate || (ctx.existing && ctx.existing.StartDate), end = v.EndDate !== undefined ? v.EndDate : (ctx.existing && ctx.existing.EndDate);
  if (start && end && end < start) fail_('Engagement end date cannot be before the start date.', 'VALIDATION');
  if (v.AssignedAuditor) {
    var u = dbAll_('Users').filter(function (x) { return normEmail_(x.Email) === v.AssignedAuditor && x.Status === 'Active'; })[0];
    if (!u) fail_('Assigned auditor must be an active registered user.', 'VALIDATION');
  }
  return [];
}
