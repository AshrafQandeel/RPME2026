/**
 * Code.gs - web app entry point and the single server API gateway.
 *
 * The browser talks to the server ONLY through api(action, payload, clientInfo). Every route is:
 *   1. authenticated (Google account -> Users sheet, Active),
 *   2. gated by a role permission (coarse), and
 *   3. re-checked inside the handler with the concrete record (fine-grained, incl. ownership and workflow locks).
 */

var ROUTES = {
  bootstrap: { h: function (u) { return bootstrap_(u); } },
  dashboard: { perm: 'COMPANY_VIEW', h: function (u) { return dashboard_(u); } },
  search: { perm: 'COMPANY_VIEW', h: function (u, p) { return searchAll_(u, p); } },

  companyList: { perm: 'COMPANY_VIEW', h: function (u, p) { return companyList_(u, p); } },
  companyGet: { perm: 'COMPANY_VIEW', h: function (u, p) { return companyGet_(u, p); } },
  companyCreate: { perm: 'COMPANY_CREATE', write: true, h: function (u, p) { return companyCreate_(u, p); } },
  companyUpdate: { perm: 'COMPANY_EDIT', write: true, h: function (u, p) { return companyUpdate_(u, p); } },
  companyDelete: { perm: 'COMPANY_DELETE', write: true, h: function (u, p) { return companyDelete_(u, p); } },
  companyRestore: { perm: 'COMPANY_RESTORE', write: true, h: function (u, p) { return companyRestore_(u, p); } },

  engagementSave: { perm: 'ENGAGEMENT_MANAGE', write: true, h: function (u, p) { return childSave_(u, 'Engagement', p); } },
  engagementDelete: { perm: 'ENGAGEMENT_DELETE', write: true, h: function (u, p) { return childDelete_(u, 'Engagement', p); } },
  uboSave: { perm: 'UBO_MANAGE', write: true, h: function (u, p) { return childSave_(u, 'UBO', p); } },
  uboDelete: { perm: 'UBO_DELETE', write: true, h: function (u, p) { return childDelete_(u, 'UBO', p); } },
  shareholderSave: { perm: 'OWNERSHIP_MANAGE', write: true, h: function (u, p) { return childSave_(u, 'Shareholder', p); } },
  shareholderDelete: { perm: 'SHAREHOLDER_DELETE', write: true, h: function (u, p) { return childDelete_(u, 'Shareholder', p); } },

  docList: { perm: 'DOC_VIEW', h: function (u, p) { return docList_(u, p); } },
  docListAll: { perm: 'DOC_VIEW', h: function (u, p) { return docListAll_(u, p); } },
  docUpload: { perm: 'DOC_UPLOAD', write: true, h: function (u, p) { return docUpload_(u, p); } },
  docAccess: { perm: 'DOC_VIEW', h: function (u, p) { return docAccess_(u, p); } },
  docSetStatus: { perm: 'DOC_STATUS', write: true, h: function (u, p) { return docSetStatus_(u, p); } },
  docDelete: { perm: 'DOC_DELETE', write: true, h: function (u, p) { return docDelete_(u, p); } },

  kycGet: { perm: 'COMPANY_VIEW', write: true, h: function (u, p) { return kycGet_(u, p); } },
  kycList: { perm: 'COMPANY_VIEW', h: function (u, p) { return kycList_(u, p); } },
  kycSave: { perm: 'KYC_EDIT', write: true, h: function (u, p) { return kycSaveChecklist_(u, p); } },
  kycSubmit: { perm: 'KYC_SUBMIT', write: true, h: function (u, p) { return kycSubmit_(u, p); } },
  kycStart: { perm: 'KYC_REVIEW', write: true, h: function (u, p) { return kycStart_(u, p); } },
  kycApprove: { perm: 'KYC_REVIEW', write: true, h: function (u, p) { return kycApprove_(u, p); } },
  kycReject: { perm: 'KYC_REVIEW', write: true, h: function (u, p) { return kycReject_(u, p); } },
  kycReturn: { perm: 'KYC_REVIEW', write: true, h: function (u, p) { return kycReturn_(u, p); } },
  kycReopen: { perm: 'KYC_REOPEN', write: true, h: function (u, p) { return kycReopen_(u, p); } },

  riskGet: { perm: 'COMPANY_VIEW', h: function (u, p) { return riskGet_(u, p); } },
  riskSave: { perm: 'RISK_ASSESS', write: true, h: function (u, p) { return riskSave_(u, p); } },
  riskFinalize: { perm: 'RISK_EDIT_FINAL', write: true, h: function (u, p) { return riskFinalize_(u, p); } },

  auditList: { h: function (u, p) { return auditList_(u, p); } },   // permission depends on scope; checked inside
  auditVerify: { perm: 'AUDIT_VIEW', write: true, h: function (u) { return auditVerify_(u); } },

  userList: { perm: 'USER_MANAGE', h: function (u) { return userList_(u); } },
  userSave: { perm: 'USER_MANAGE', write: true, h: function (u, p) { return userSave_(u, p); } },

  reportRun: { perm: 'REPORT_VIEW', h: function (u, p) { return reportRun_(u, p); } },
  reportPdf: { perm: 'REPORT_VIEW', h: function (u, p) { return reportPdf_(u, p); } },

  settingsGet: { h: function (u) { return { settings: settingsForClient_(u) }; } },
  settingsSave: { write: true, h: function (u, p) { return settingSave_(u, p); } },   // per-key permission checked inside

  adminBackup: { perm: 'BACKUP', h: function (u) { return backupDatabase_(u); } }
};

function doGet() {
  try {
    getCurrentUser_();
  } catch (e) {
    var msg = e instanceof AppError ? e.message : 'The application is temporarily unavailable.';
    if (!(e instanceof AppError)) logError_(null, 'doGet', e);
    return HtmlService.createHtmlOutput('<div style="font-family:Arial;max-width:520px;margin:80px auto;text-align:center"><h2>Access Denied</h2><p>' + escHtml_(msg) +
      '</p><p style="color:#666">Contact your MLRO or System Administrator to request access.</p></div>').setTitle(APP.NAME);
  }
  return HtmlService.createTemplateFromFile('Index').evaluate().setTitle(APP.NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include_(name) { return HtmlService.createHtmlOutputFromFile(name).getContent(); }

/** The only data entry point for the browser. Always returns {ok, data} or {ok:false, error, code}. */
function api(action, payload, clientInfo) {
  var user = null;
  try {
    _memo = {};
    _memo.client = clip_(String(clientInfo || '').replace(/[\r\n|]/g, ' '), 150);
    user = getCurrentUser_();
    var r = Object.prototype.hasOwnProperty.call(ROUTES, action) ? ROUTES[action] : null;
    if (!r) fail_('Unknown request.', 'BAD_REQUEST');
    if (r.perm && !gate_(user, r.perm)) requirePermission_(user, r.perm);   // audits + throws FORBIDDEN
    if (payload !== null && payload !== undefined && typeof payload !== 'object') fail_('Invalid request.', 'BAD_REQUEST');
    payload = payload || {};
    var data = r.write ? withLock_(function () { return r.h(user, payload); }) : r.h(user, payload);
    return { ok: true, data: JSON.parse(JSON.stringify(data === undefined ? null : data)) };
  } catch (e) {
    if (e instanceof AppError) return { ok: false, error: e.message, code: e.code };
    var rec = logError_(user, String(action), e);
    return { ok: false, error: 'An unexpected error occurred. Please try again or contact the administrator. Reference: ' + (rec && rec.ErrorID || 'n/a'), code: 'INTERNAL' };
  }
}

function bootstrap_(user) {
  var users = dbAll_('Users').filter(function (u) { return u.Status === 'Active'; }).map(function (u) { return { email: normEmail_(u.Email), name: u.Name, role: u.Role }; });
  return {
    app: { name: APP.NAME, version: APP.VERSION },
    user: { Name: user.Name, Email: user.Email, Role: user.Role, Department: user.Department },
    perms: effectivePermissions_(user),
    fields: {
      Company: clientFields_('Company', user), Engagement: clientFields_('Engagement', user),
      UBO: clientFields_('UBO', user), Shareholder: clientFields_('Shareholder', user),
      User: gate_(user, 'USER_MANAGE') ? clientFields_('User', user) : []
    },
    lists: {
      engagementTypes: getSetting_('ENGAGEMENT_TYPES'), docTypes: docTypes_(), docStatuses: DOC_STATUSES, riskLevels: RISK_LEVELS,
      kycStatuses: [KYC.DRAFT, KYC.SUBMITTED, KYC.UNDER, KYC.APPROVED, KYC.REJECTED, KYC.RETURNED, KYC.RESUBMITTED],
      companyStatuses: ['Active', 'Inactive', 'Dormant', 'In Liquidation', 'Struck Off'],
      users: users, privilegedRoles: PRIVILEGED_ROLES, roles: Object.keys(getRolePermissions_())
    },
    limits: { fileRules: getSetting_('FILE_RULES'), expiryWindows: getSetting_('EXPIRY_WARNING_DAYS') }
  };
}
