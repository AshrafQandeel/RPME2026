/** NotificationService.gs - optional email notifications and the daily maintenance job. */

function appUrl_() { try { return ScriptApp.getService().getUrl(); } catch (e) { return ''; } }

function usersWith_(perm) {
  return dbAll_('Users').filter(function (u) { return u.Status === 'Active' && rolePerm_(u.Role, perm) === true; }).map(function (u) { return normEmail_(u.Email); });
}

/** Sends an event email. Never includes identity numbers or document content. Failures never break the caller. */
function notify_(event, ctx) {
  try {
    var cfg = getSetting_('NOTIFICATIONS');
    if (!cfg || !cfg.enabled || !(cfg.events || {})[event]) return;
    var c = ctx.company, to = ctx.to && ctx.to.length ? ctx.to : usersWith_('KYC_REVIEW');
    to = unique_(to.concat(cfg.extraRecipients || []).map(normEmail_).filter(isEmail_));
    if (!to.length) return;
    var subjects = {
      KYC_SUBMITTED: 'KYC submitted for review', KYC_REJECTED: 'KYC review rejected', KYC_APPROVED: 'KYC review approved',
      HIGH_RISK: 'High-risk company requires attention', DOC_EXPIRY: 'Documents expiring / expired', KYC_DUE: 'KYC reviews due / overdue'
    };
    var body = ctx.html || ('<p>' + escHtml_(subjects[event]) + ': <b>' + escHtml_(c ? c.LegalName : '') + '</b> (' + escHtml_(c ? c.CompanyID : '') + ').</p>' +
      (ctx.comments ? '<p>Comments: ' + escHtml_(ctx.comments) + '</p>' : ''));
    MailApp.sendEmail({ to: to.join(','), subject: '[AML/KYC] ' + subjects[event], htmlBody: body + '<p><a href="' + escHtml_(appUrl_()) + '">Open the AML/KYC system</a></p><p style="color:#666;font-size:12px">Automated message - contains no identity or document data.</p>' });
  } catch (e) { logError_(null, 'notify ' + event, e); }
}

var SYSTEM_USER_ = { Email: 'SYSTEM', Role: 'SYSTEM', Status: 'Active' };

/** Marks expired documents, sends expiry / KYC-due digests. Safe to run repeatedly. */
function runMaintenance_() {
  var today = todayStr_(), windows = getSetting_('EXPIRY_WARNING_DAYS') || [7, 30, 60, 90], expired = 0;
  var companies = {}; dbAll_('Companies').forEach(function (c) { if (!isDeleted_(c)) companies[c.CompanyID] = c; });
  var lines = [];
  dbAll_('Documents').forEach(function (d) {
    if (isDeleted_(d) || d.VersionStatus !== 'Current' || !d.ExpiryDate || !companies[d.CompanyID]) return;
    var days = daysBetween_(today, d.ExpiryDate);
    if (days < 0 && ['Expired', 'Rejected'].indexOf(d.Status) < 0 && expired < 200) {
      withLock_(function () {
        dbUpdate_('Documents', d.DocumentID, { Status: 'Expired', StatusChangedBy: 'SYSTEM', StatusChangedAt: nowIso_() });
        audit_(SYSTEM_USER_, 'Document Expired', { companyId: d.CompanyID, recordType: 'Document', recordId: d.DocumentID, oldValue: { Status: d.Status }, newValue: { Status: 'Expired' } });
      });
      expired++; lines.push(companies[d.CompanyID].LegalName + ' - ' + d.DocType + ' expired on ' + d.ExpiryDate);
    } else if (days === 0 || windows.indexOf(days) >= 0) {
      lines.push(companies[d.CompanyID].LegalName + ' - ' + d.DocType + ' expires ' + d.ExpiryDate + ' (' + days + ' days)');
    }
  });
  if (lines.length) notify_('DOC_EXPIRY', { html: '<p>Document expiry summary:</p><ul>' + lines.map(function (l) { return '<li>' + escHtml_(l) + '</li>'; }).join('') + '</ul>' });
  var due = [], isMonday = Utilities.formatDate(new Date(), APP.TZ, 'u') === '1';
  Object.keys(companies).forEach(function (id) {
    var c = companies[id]; if (!c.NextKycReviewDate || c.CompanyStatus !== 'Active') return;
    var d = daysBetween_(today, c.NextKycReviewDate);
    if (d < 0 && isMonday) due.push(c.LegalName + ' - KYC review overdue since ' + c.NextKycReviewDate);
    else if (d === 0 || d === 7 || d === 30) due.push(c.LegalName + ' - KYC review due ' + c.NextKycReviewDate);
  });
  if (due.length) notify_('KYC_DUE', { html: '<p>KYC review summary:</p><ul>' + due.map(function (l) { return '<li>' + escHtml_(l) + '</li>'; }).join('') + '</ul>' });
  return { expiredMarked: expired, expiryLines: lines.length, kycLines: due.length };
}
