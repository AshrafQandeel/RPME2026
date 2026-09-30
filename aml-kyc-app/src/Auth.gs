/**
 * Auth.gs - authentication (Google account -> Users sheet) and centralised authorisation.
 * Every sensitive server operation must call requirePermission_() - hidden UI buttons are cosmetic only.
 */

function getCurrentUser_() {
  if (_memo.user) return _memo.user;
  var email = normEmail_(Session.getActiveUser().getEmail());
  if (!email) fail_('Access Denied. Your Google account could not be identified.', 'ACCESS_DENIED');
  var u = dbAll_('Users').filter(function (r) { return normEmail_(r.Email) === email; })[0];
  if (!u || u.Status !== 'Active') fail_('Access Denied. Your account is not registered or is inactive.', 'ACCESS_DENIED');
  var domains = (getSetting_('ACCESS') || {}).allowedDomains || [];
  if (domains.length && domains.map(function (d) { return String(d).toLowerCase(); }).indexOf(email.split('@')[1]) < 0) {
    fail_('Access Denied. Your email domain is not authorised.', 'ACCESS_DENIED');
  }
  u = JSON.parse(JSON.stringify(u));
  u.Email = email;
  touchLastLogin_(u);
  _memo.user = u;
  return u;
}

function touchLastLogin_(u) {
  try {
    var c = CacheService.getScriptCache(), k = 'login:' + u.Email;
    if (c.get(k)) return;
    c.put(k, '1', 3600);
    withLock_(function () { dbUpdate_('Users', u.UserID, { LastLogin: nowIso_() }); });
    audit_(u, 'User Login', { recordType: 'User', recordId: u.UserID });
  } catch (e) { /* never block login on bookkeeping */ }
}

/** Raw permission grant for a role: true | 'own' | false. */
function rolePerm_(role, action) {
  var perms = getRolePermissions_()[role];
  var v = perms ? perms[action] : false;
  if (v && role === 'System Administrator' && APPROVAL_PERMS.indexOf(action) >= 0 && !(getSetting_('ACCESS') || {}).sysadminCanApprove) return false;
  return v || false;
}

/**
 * Central authorisation check.
 * - true grants: allowed.
 * - "own" grants: allowed only when a resource is supplied and it was created/uploaded by the user.
 */
function hasPermission_(user, action, resource) {
  if (!user || user.Status !== 'Active') return false;
  var v = rolePerm_(user.Role, action);
  if (v === true) return true;
  if (v === 'own') return !!resource && ownerOf_(resource) === user.Email;
  return false;
}
/** Coarse gate used by the router: passes for both true and "own" grants. */
function gate_(user, action) { return !!rolePerm_(user.Role, action); }
function ownerOf_(res) { return normEmail_(res.CreatedBy || res.UploadedBy || ''); }

function requirePermission_(user, action, resource) {
  if (!hasPermission_(user, action, resource)) {
    try { audit_(user, 'Permission Denied', { recordType: 'Permission', recordId: action, comments: 'Attempted ' + action }); } catch (e) { }
    fail_('You do not have permission to perform this action.', 'FORBIDDEN');
  }
}

function effectivePermissions_(user) {
  var o = {};
  PERMISSIONS.forEach(function (p) { o[p] = rolePerm_(user.Role, p); });
  return o;
}

// ---- company-level access
function canAccessCompany_(user, company, engagementsOfCompany) {
  if (!company) return false;
  if (!gate_(user, 'COMPANY_VIEW')) return false;
  if (!(getSetting_('ACCESS') || {}).restrictToAssigned) return true;
  if (['MLRO', 'DMLRO', 'System Administrator'].indexOf(user.Role) >= 0) return true;
  if (normEmail_(company.CreatedBy) === user.Email) return true;
  if (String(company.AuthorizedUsers || '').toLowerCase().split(/[,;\s]+/).indexOf(user.Email) >= 0) return true;
  var engs = engagementsOfCompany || dbWhere_('Engagements', function (e) { return e.CompanyID === company.CompanyID && !isDeleted_(e); });
  return engs.some(function (e) { return normEmail_(e.AssignedAuditor) === user.Email; });
}

/** Loads a company the user may see; throws otherwise. Never reveals whether a hidden company exists. */
function requireCompany_(user, companyId, includeDeleted) {
  var c = dbGet_('Companies', String(companyId || ''));
  if (!c || (isDeleted_(c) && !(includeDeleted && hasPermission_(user, 'COMPANY_RESTORE'))) || !canAccessCompany_(user, c)) {
    fail_('Company not found or you do not have access.', 'NOT_FOUND');
  }
  return c;
}

function isReviewer_(user) { return hasPermission_(user, 'KYC_REVIEW'); }

/** Returns a reason string when the user may not modify the company record (maker-checker lock), else ''. */
function editBlockReason_(user, company) {
  if (isReviewer_(user)) return '';
  if (KYC_LOCKED.indexOf(company.KycStatus) >= 0) {
    return company.KycStatus === KYC.APPROVED
      ? 'This record has been approved and cannot be modified. Start a new KYC review to make changes.'
      : 'This record is locked while the KYC review is in progress.';
  }
  return '';
}
function assertEditable_(user, company) {
  var r = editBlockReason_(user, company);
  if (r) fail_(r, 'LOCKED');
}

/** Removes/masks fields the user should not receive. */
function outRecord_(user, entity, rec) {
  var o = {};
  for (var k in rec) o[k] = rec[k];
  delete o.DriveFileID; delete o.FolderID; delete o.Checksum;
  if (!hasPermission_(user, 'SENSITIVE_VIEW')) {
    if (o.QIDNumber) o.QIDNumber = maskId_(o.QIDNumber);
    if (o.PassportNumber) o.PassportNumber = maskId_(o.PassportNumber);
  }
  if (entity === 'Company' && !hasPermission_(user, 'COMPANY_EDIT') && !hasPermission_(user, 'USER_MANAGE')) delete o.AuthorizedUsers;
  return o;
}
