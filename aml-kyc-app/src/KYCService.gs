/** KYCService.gs - KYC review workflow (maker-checker) and checklist. */

function kycReviews_(companyId) {
  return dbWhere_('KYC_Reviews', function (r) { return r.CompanyID === companyId; }).sort(function (a, b) { return b.CycleNo - a.CycleNo; });
}
function kycCurrent_(companyId) { return kycReviews_(companyId)[0] || null; }

function kycCreateReview_(user, companyId, cycleNo) {
  var now = nowIso_();
  var rec = dbInsert_('KYC_Reviews', {
    CompanyID: companyId, CycleNo: cycleNo, Status: KYC.DRAFT, Checklist: '{}', CreatedBy: user.Email, CreatedAt: now, UpdatedBy: user.Email, UpdatedAt: now
  });
  audit_(user, 'KYC Review Created', { companyId: companyId, recordType: 'KYC Review', recordId: rec.ReviewID, comments: 'Cycle ' + cycleNo });
  return rec;
}

function segregationOk_(user, review) {
  var req = getSetting_('APPROVAL_REQUIREMENTS') || {};
  return !!req.allowSelfApproval || normEmail_(review.SubmittedBy) !== user.Email;
}

/** Blocking conditions for approval, driven by APPROVAL_REQUIREMENTS. */
function approvalIssues_(company, review) {
  var req = getSetting_('APPROVAL_REQUIREMENTS') || {}, issues = [], cid = company.CompanyID;
  var ubos = dbWhere_('UBOs', function (u) { return u.CompanyID === cid && !isDeleted_(u); });
  if (req.requireChecklistComplete) {
    var cl = jsonParse_(review.Checklist, {});
    var open = (getSetting_('CHECKLIST_ITEMS') || []).filter(function (i) { var c = cl[i.id]; return !(c && (c.done || c.na)); });
    if (open.length) issues.push('Checklist incomplete: ' + open.length + ' item(s) not completed or marked N/A.');
  }
  if (req.requireFinalRiskRating && RISK_LEVELS.indexOf(company.RiskRating) < 0) issues.push('A final risk rating has not been set by the MLRO/DMLRO.');
  if (req.requireMandatoryDocuments) {
    var missing = requirementStatus_(company, dbWhere_('Documents', function (d) { return d.CompanyID === cid; }), ubos).filter(function (r) { return !r.met; });
    if (missing.length) issues.push('Mandatory documents missing or not valid: ' + missing.map(function (m) { return m.label; }).join('; ') + '.');
  }
  if (req.requireUbo && !ubos.length) issues.push('No UBO has been recorded.');
  if (req.blockOnConfirmedSanctions && ubos.some(function (u) { return u.SanctionsStatus === 'Confirmed match'; })) issues.push('A UBO has a confirmed sanctions match.');
  return issues;
}

function kycActions_(user, company, r) {
  var a = [], s = r.Status, maker = [KYC.DRAFT, KYC.REJECTED, KYC.RETURNED].indexOf(s) >= 0;
  if ((maker && hasPermission_(user, 'KYC_EDIT')) || (s === KYC.UNDER && hasPermission_(user, 'KYC_REVIEW'))) a.push('save');
  if (maker && hasPermission_(user, 'KYC_SUBMIT')) a.push('submit');
  if ([KYC.SUBMITTED, KYC.RESUBMITTED].indexOf(s) >= 0 && hasPermission_(user, 'KYC_REVIEW') && segregationOk_(user, r)) a.push('start');
  if (s === KYC.UNDER && hasPermission_(user, 'KYC_REVIEW') && segregationOk_(user, r)) { a.push('approve'); a.push('reject'); }
  if (s === KYC.REJECTED && hasPermission_(user, 'KYC_REVIEW')) a.push('return');
  if (s === KYC.APPROVED && hasPermission_(user, 'KYC_REOPEN')) a.push('reopen');
  return a;
}

function kycOut_(r) {
  var o = {}; for (var k in r) o[k] = r[k];
  o.Checklist = jsonParse_(r.Checklist, {});
  return o;
}

function kycGet_(user, p) {
  var c = requireCompany_(user, p.companyId, true);
  var reviews = kycReviews_(c.CompanyID);
  if (!reviews.length && hasPermission_(user, 'KYC_EDIT')) reviews = [kycCreateReview_(user, c.CompanyID, 1)];
  var cur = reviews[0] || null;
  var engs = dbWhere_('Engagements', function (e) { return e.CompanyID === c.CompanyID && !isDeleted_(e); });
  return {
    company: { CompanyID: c.CompanyID, LegalName: c.LegalName, QFCNumber: c.QFCNumber, CRNumber: c.CRNumber, RiskRating: c.RiskRating, KycStatus: c.KycStatus, LastKycReviewDate: c.LastKycReviewDate, NextKycReviewDate: c.NextKycReviewDate },
    engagements: engs.map(function (e) { return { EngagementID: e.EngagementID, EngagementType: e.EngagementType, EngagementStatus: e.EngagementStatus }; }),
    review: cur ? kycOut_(cur) : null,
    history: reviews.map(function (r) { var o = kycOut_(r); delete o.Checklist; return o; }),
    items: getSetting_('CHECKLIST_ITEMS'),
    actions: cur ? kycActions_(user, c, cur) : [],
    issues: cur && [KYC.UNDER, KYC.SUBMITTED, KYC.RESUBMITTED].indexOf(cur.Status) >= 0 ? approvalIssues_(c, cur) : [],
    segregationNote: cur && cur.SubmittedBy && !segregationOk_(user, cur) ? 'You submitted this review and cannot approve it (maker-checker).' : ''
  };
}

function loadReview_(user, p, needPerm) {
  var r = dbGet_('KYC_Reviews', String(p.reviewId || ''));
  if (!r) fail_('Review not found.', 'NOT_FOUND');
  var c = requireCompany_(user, r.CompanyID);
  if (needPerm) requirePermission_(user, needPerm);
  var latest = kycCurrent_(r.CompanyID);
  if (latest.ReviewID !== r.ReviewID) fail_('This review cycle is closed. Reload the page.', 'STALE');
  return { review: r, company: c };
}

function setKycStatus_(user, x, status, patch, action, comments, extraNew) {
  var before = x.review.Status;
  patch = patch || {}; patch.Status = status; patch.UpdatedBy = user.Email; patch.UpdatedAt = nowIso_();
  var rec = dbUpdate_('KYC_Reviews', x.review.ReviewID, patch);
  var cpatch = { KycStatus: status, UpdatedBy: user.Email, UpdatedAt: nowIso_() };
  if (extraNew && extraNew.company) for (var k in extraNew.company) cpatch[k] = extraNew.company[k];
  dbUpdate_('Companies', x.company.CompanyID, cpatch);
  audit_(user, action, { companyId: x.company.CompanyID, recordType: 'KYC Review', recordId: x.review.ReviewID, oldValue: { Status: before }, newValue: { Status: status }, comments: comments || '' });
  return rec;
}

function kycSaveChecklist_(user, p) {
  var x = loadReview_(user, p);
  var allowed = kycActions_(user, x.company, x.review).indexOf('save') >= 0;
  if (!allowed) fail_(KYC_LOCKED.indexOf(x.review.Status) >= 0 && !isReviewer_(user) ? 'This review is locked.' : 'You do not have permission to perform this action.', 'FORBIDDEN');
  var valid = {}; (getSetting_('CHECKLIST_ITEMS') || []).forEach(function (i) { valid[i.id] = 1; });
  var cl = jsonParse_(x.review.Checklist, {}), before = JSON.parse(JSON.stringify(cl)), items = p.items || {}, now = nowIso_();
  Object.keys(items).forEach(function (id) {
    if (!valid[id]) fail_('Unknown checklist item.', 'VALIDATION');
    var it = items[id] || {};
    var n = { done: !!it.done && !it.na, na: !!it.na, comment: clip_(String(it.comment || '').trim(), 500), by: user.Email, at: now };
    var o = cl[id] || {};
    if (!!o.done === n.done && !!o.na === n.na && (o.comment || '') === n.comment) return;
    cl[id] = n;
  });
  var d = diff_({ c: JSON.stringify(before) }, { c: JSON.stringify(cl) }, ['c']);
  if (!d.changed) return { review: kycOut_(x.review) };
  var patch = { Checklist: cl, UpdatedBy: user.Email, UpdatedAt: now };
  if (p.engagementId !== undefined) patch.EngagementID = String(p.engagementId || '');
  var rec = dbUpdate_('KYC_Reviews', x.review.ReviewID, patch);
  var changed = {}; Object.keys(cl).forEach(function (k) { if (JSON.stringify(cl[k]) !== JSON.stringify(before[k])) changed[k] = { done: cl[k].done, na: cl[k].na, comment: cl[k].comment }; });
  audit_(user, 'KYC Checklist Updated', { companyId: x.company.CompanyID, recordType: 'KYC Review', recordId: x.review.ReviewID, newValue: changed });
  return { review: kycOut_(rec) };
}

function kycSubmit_(user, p) {
  var x = loadReview_(user, p, 'KYC_SUBMIT');
  var s = x.review.Status;
  if ([KYC.DRAFT, KYC.REJECTED, KYC.RETURNED].indexOf(s) < 0) fail_('This review cannot be submitted in its current status.', 'WORKFLOW');
  if (!isReviewer_(user) && s === KYC.DRAFT && !x.review.CreatedBy) fail_('Invalid review.');
  var again = s !== KYC.DRAFT;
  var rec = setKycStatus_(user, x, again ? KYC.RESUBMITTED : KYC.SUBMITTED, { SubmittedBy: user.Email, SubmittedAt: nowIso_(), RiskRatingAtReview: x.company.RiskRating, ReviewerEmail: '', Decision: '', DecisionComments: '' },
    again ? 'KYC Resubmitted' : 'KYC Submitted', p.comments);
  notify_('KYC_SUBMITTED', { company: x.company, comments: p.comments });
  return { review: kycOut_(rec) };
}

function kycStart_(user, p) {
  var x = loadReview_(user, p, 'KYC_REVIEW');
  if ([KYC.SUBMITTED, KYC.RESUBMITTED].indexOf(x.review.Status) < 0) fail_('This review is not awaiting review.', 'WORKFLOW');
  if (!segregationOk_(user, x.review)) fail_('Segregation of duties: you cannot review a submission you made yourself.', 'SOD');
  var rec = setKycStatus_(user, x, KYC.UNDER, { ReviewerEmail: user.Email }, 'KYC Review Started', '');
  return { review: kycOut_(rec) };
}

function kycApprove_(user, p) {
  var x = loadReview_(user, p, 'KYC_REVIEW');
  if (x.review.Status !== KYC.UNDER) fail_('Only a review that is Under Review can be approved.', 'WORKFLOW');
  if (!segregationOk_(user, x.review)) fail_('Segregation of duties: you cannot approve a submission you made yourself.', 'SOD');
  var issues = approvalIssues_(x.company, x.review);
  if (issues.length) fail_('Approval blocked: ' + issues.join(' '), 'APPROVAL_BLOCKED');
  var today = todayStr_(), months = (getSetting_('REVIEW_FREQUENCY_MONTHS') || {})[x.company.RiskRating] || 12, next = addMonths_(today, months);
  var rec = setKycStatus_(user, x, KYC.APPROVED, { ReviewerEmail: user.Email, ReviewedAt: nowIso_(), Decision: 'Approved', DecisionComments: clip_(p.comments, 1000), ReviewDate: today, NextReviewDate: next, RiskRatingAtReview: x.company.RiskRating },
    'KYC Approved', p.comments, { company: { LastKycReviewDate: today, NextKycReviewDate: next } });
  dbWhere_('Engagements', function (e) { return e.CompanyID === x.company.CompanyID && !isDeleted_(e) && ['Active', 'Proposed'].indexOf(e.EngagementStatus) >= 0; })
    .forEach(function (e) { dbUpdate_('Engagements', e.EngagementID, { LastKycReviewDate: today, NextKycReviewDate: next }); });
  notify_('KYC_APPROVED', { company: x.company, to: [x.review.SubmittedBy] });
  return { review: kycOut_(rec) };
}

function kycReject_(user, p) {
  var x = loadReview_(user, p, 'KYC_REVIEW');
  if (x.review.Status !== KYC.UNDER) fail_('Only a review that is Under Review can be rejected.', 'WORKFLOW');
  if (!segregationOk_(user, x.review)) fail_('Segregation of duties: you cannot reject a submission you made yourself.', 'SOD');
  if (!String(p.comments || '').trim()) fail_('Comments are required when rejecting a review.', 'VALIDATION');
  var rec = setKycStatus_(user, x, KYC.REJECTED, { ReviewerEmail: user.Email, ReviewedAt: nowIso_(), Decision: 'Rejected', DecisionComments: clip_(p.comments, 1000) }, 'KYC Rejected', p.comments);
  notify_('KYC_REJECTED', { company: x.company, to: [x.review.SubmittedBy], comments: p.comments });
  return { review: kycOut_(rec) };
}

function kycReturn_(user, p) {
  var x = loadReview_(user, p, 'KYC_REVIEW');
  if (x.review.Status !== KYC.REJECTED) fail_('Only a rejected review can be returned to the auditor.', 'WORKFLOW');
  var rec = setKycStatus_(user, x, KYC.RETURNED, {}, 'KYC Returned to Auditor', p.comments);
  return { review: kycOut_(rec) };
}

/** Starts a new review cycle for an approved company (required before an auditor may change approved data). */
function kycReopen_(user, p) {
  requirePermission_(user, 'KYC_REOPEN');
  var c = requireCompany_(user, p.companyId);
  var cur = kycCurrent_(c.CompanyID);
  if (!cur || cur.Status !== KYC.APPROVED) fail_('Only an approved review can be re-opened.', 'WORKFLOW');
  if (!String(p.reason || '').trim()) fail_('A reason is required to start a new review cycle.', 'VALIDATION');
  var rec = kycCreateReview_(user, c.CompanyID, cur.CycleNo + 1);
  dbUpdate_('Companies', c.CompanyID, { KycStatus: KYC.DRAFT, UpdatedBy: user.Email, UpdatedAt: nowIso_() });
  audit_(user, 'KYC Review Reopened', { companyId: c.CompanyID, recordType: 'KYC Review', recordId: rec.ReviewID, oldValue: { Status: KYC.APPROVED }, newValue: { Status: KYC.DRAFT }, comments: p.reason });
  return { review: kycOut_(rec) };
}

/** Latest review per company for the Reviews page. */
function kycList_(user, f) {
  f = f || {};
  var vis = {}; visibleCompanies_(user).forEach(function (c) { vis[c.CompanyID] = c; });
  var latest = {};
  dbAll_('KYC_Reviews').forEach(function (r) { if (vis[r.CompanyID] && (!latest[r.CompanyID] || r.CycleNo > latest[r.CompanyID].CycleNo)) latest[r.CompanyID] = r; });
  var rows = [], today = todayStr_();
  Object.keys(latest).forEach(function (id) {
    var r = latest[id], c = vis[id];
    if (f.status && r.Status !== f.status) return;
    if (f.pendingOnly && KYC_PENDING.indexOf(r.Status) < 0) return;
    if (f.dueOnly && !(c.NextKycReviewDate && daysBetween_(today, c.NextKycReviewDate) <= (getSetting_('KYC_DUE_WINDOW_DAYS') || 30))) return;
    rows.push({ ReviewID: r.ReviewID, CompanyID: id, LegalName: c.LegalName, QFCNumber: c.QFCNumber, CRNumber: c.CRNumber, Status: r.Status, CycleNo: r.CycleNo,
      RiskRating: c.RiskRating, SubmittedBy: r.SubmittedBy, SubmittedAt: r.SubmittedAt, LastKycReviewDate: c.LastKycReviewDate, NextKycReviewDate: c.NextKycReviewDate,
      Overdue: !!(c.NextKycReviewDate && c.NextKycReviewDate < today) });
  });
  rows.sort(function (a, b) { return (a.NextKycReviewDate || '9999') < (b.NextKycReviewDate || '9999') ? -1 : 1; });
  return { rows: rows, statuses: [KYC.DRAFT, KYC.SUBMITTED, KYC.UNDER, KYC.APPROVED, KYC.REJECTED, KYC.RETURNED, KYC.RESUBMITTED] };
}
