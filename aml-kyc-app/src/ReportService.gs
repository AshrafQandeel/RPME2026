/** ReportService.gs - dashboard, global search and reports. */

function dashboard_(user) {
  var today = todayStr_(), comps = visibleCompanies_(user), ids = {};
  comps.forEach(function (c) { ids[c.CompanyID] = c; });
  var docs = dbAll_('Documents').filter(function (d) { return !isDeleted_(d) && ids[d.CompanyID]; });
  var ubosBy = groupBy_(live_(dbAll_('UBOs')), 'CompanyID'), docsBy = groupBy_(docs, 'CompanyID'), engs = live_(dbAll_('Engagements')).filter(function (e) { return ids[e.CompanyID]; });
  var windows = (getSetting_('EXPIRY_WARNING_DAYS') || [7, 30, 60, 90]).slice().sort(function (a, b) { return a - b; });
  var dueWin = getSetting_('KYC_DUE_WINDOW_DAYS') || 30;
  var count = function (arr, fn) { return arr.filter(fn).length; };
  var cur = docs.filter(function (d) { return d.VersionStatus === 'Current'; });
  var buckets = { expired: 0 }; windows.forEach(function (w) { buckets['w' + w] = 0; });
  cur.forEach(function (d) {
    if (!d.ExpiryDate || ['Rejected', 'Superseded'].indexOf(d.Status) >= 0) return;
    var n = daysBetween_(today, d.ExpiryDate);
    if (n < 0) { buckets.expired++; return; }
    for (var i = 0; i < windows.length; i++) if (n <= windows[i]) { buckets['w' + windows[i]]++; break; }
  });
  var missingCompanies = 0, missingTotal = 0;
  comps.forEach(function (c) {
    if (c.CompanyStatus !== 'Active') return;
    var m = requirementStatus_(c, docsBy[c.CompanyID] || [], ubosBy[c.CompanyID] || []).filter(function (r) { return !r.met; }).length;
    if (m) { missingCompanies++; missingTotal += m; }
  });
  var types = {}; engs.forEach(function (e) { types[e.EngagementType] = (types[e.EngagementType] || 0) + 1; });
  var kycStatus = {}; comps.forEach(function (c) { kycStatus[c.KycStatus] = (kycStatus[c.KycStatus] || 0) + 1; });
  var withNext = comps.filter(function (c) { return c.NextKycReviewDate; });
  return {
    companies: {
      total: comps.length, active: count(comps, function (c) { return c.CompanyStatus === 'Active'; }),
      pendingReview: count(comps, function (c) { return KYC_PENDING.indexOf(c.KycStatus) >= 0; }),
      high: count(comps, function (c) { return c.RiskRating === 'High'; }), medium: count(comps, function (c) { return c.RiskRating === 'Medium'; }),
      low: count(comps, function (c) { return c.RiskRating === 'Low'; }), notRated: count(comps, function (c) { return RISK_LEVELS.indexOf(c.RiskRating) < 0; })
    },
    documents: {
      total: docs.length, pendingReview: count(cur, function (d) { return ['Pending', 'Uploaded', 'Under Review'].indexOf(d.Status) >= 0; }),
      expired: buckets.expired, expiringSoon: windows.reduce(function (s, w) { return s + buckets['w' + w]; }, 0), missing: missingTotal, companiesWithMissing: missingCompanies
    },
    kyc: {
      due: count(withNext, function (c) { var n = daysBetween_(today, c.NextKycReviewDate); return n >= 0 && n <= dueWin; }),
      overdue: count(withNext, function (c) { return c.NextKycReviewDate < today; }),
      completed: count(comps, function (c) { return c.KycStatus === KYC.APPROVED; }),
      awaitingMlro: count(comps, function (c) { return KYC_PENDING.indexOf(c.KycStatus) >= 0; })
    },
    charts: {
      risk: { High: count(comps, function (c) { return c.RiskRating === 'High'; }), Medium: count(comps, function (c) { return c.RiskRating === 'Medium'; }), Low: count(comps, function (c) { return c.RiskRating === 'Low'; }), 'Not rated': count(comps, function (c) { return RISK_LEVELS.indexOf(c.RiskRating) < 0; }) },
      kycStatus: kycStatus, expiry: buckets, engagementTypes: types, windows: windows
    }
  };
}

/** Global search across companies, engagements, UBOs and auditors. Identity numbers searchable only with SENSITIVE_VIEW. */
function searchAll_(user, p) {
  var q = String(p.q || '').trim().toLowerCase();
  if (q.length < 2) return { rows: [] };
  var sens = hasPermission_(user, 'SENSITIVE_VIEW'), hits = {};
  var comps = visibleCompanies_(user), byId = {}; comps.forEach(function (c) { byId[c.CompanyID] = c; });
  function add(cid, why) { if (byId[cid]) (hits[cid] = hits[cid] || []).push(why); }
  var has = function (v) { return String(v || '').toLowerCase().indexOf(q) >= 0; };
  comps.forEach(function (c) {
    if (has(c.LegalName) || has(c.TradingName)) add(c.CompanyID, 'Company name');
    if (has(c.QFCNumber)) add(c.CompanyID, 'QFC number');
    if (has(c.CRNumber)) add(c.CompanyID, 'CR number');
    if (has(c.RiskRating) && q.length >= 3) add(c.CompanyID, 'Risk rating');
    if (has(c.CompanyID)) add(c.CompanyID, 'Company ID');
  });
  live_(dbAll_('Engagements')).forEach(function (e) {
    if (has(e.EngagementType) || has(e.EngagementID)) add(e.CompanyID, 'Engagement: ' + e.EngagementType);
    if (has(e.AssignedAuditor) || has(e.PartnerManager)) add(e.CompanyID, 'Auditor/partner: ' + (e.AssignedAuditor || e.PartnerManager));
  });
  var names = {}; dbAll_('Users').forEach(function (u) { if (has(u.Name)) names[normEmail_(u.Email)] = u.Name; });
  live_(dbAll_('Engagements')).forEach(function (e) { if (names[e.AssignedAuditor]) add(e.CompanyID, 'Auditor: ' + names[e.AssignedAuditor]); });
  live_(dbAll_('UBOs')).forEach(function (u) {
    if (has(u.FullName)) add(u.CompanyID, 'UBO: ' + u.FullName);
    if (sens && has(u.QIDNumber)) add(u.CompanyID, 'UBO QID');
    if (sens && has(u.PassportNumber)) add(u.CompanyID, 'UBO passport');
  });
  var rows = Object.keys(hits).slice(0, 50).map(function (id) {
    var c = byId[id];
    return { CompanyID: id, LegalName: c.LegalName, QFCNumber: c.QFCNumber, CRNumber: c.CRNumber, RiskRating: c.RiskRating, KycStatus: c.KycStatus, matches: unique_(hits[id]).join('; ') };
  });
  return { rows: rows };
}

// ------------------------------------------------------------------ reports
function rep_(title, user, sections) { return { title: title, generatedAt: nowIso_(), generatedBy: user.Email, sections: sections }; }
function sec_(title, columns, rows) { return { title: title, columns: columns, rows: rows }; }

function reportRun_(user, p) {
  requirePermission_(user, 'REPORT_VIEW');
  var type = String(p.type || ''), today = todayStr_(), out;
  var comps = visibleCompanies_(user), byId = {}; comps.forEach(function (c) { byId[c.CompanyID] = c; });
  if (type === 'companyKyc') {
    var c = requireCompany_(user, p.companyId), cid = c.CompanyID;
    var cg = companyGet_(user, { id: cid }), dl = docList_(user, { companyId: cid }), rv = kycReviews_(cid), rk = riskCurrent_(cid);
    var auditRows = auditList_(user, { companyId: cid, limit: 500 }).rows.filter(function (r) { return /^(KYC|Risk)/.test(r.Action); });
    out = rep_('Company KYC Report - ' + c.LegalName, user, [
      sec_('Company details', ['Field', 'Value'], [['Company ID', c.CompanyID], ['Legal name', c.LegalName], ['Trading name', c.TradingName], ['QFC number', c.QFCNumber], ['CR number', c.CRNumber],
        ['Trade license', c.TradeLicenseNumber], ['Tax card', c.TaxCardNumber], ['Computer card', c.ComputerCardNumber], ['Parent company CR', c.ParentCompanyCR], ['Country of incorporation', c.CountryOfIncorporation],
        ['Legal form', c.LegalForm], ['Registered address', c.RegisteredAddress], ['Business activity', c.BusinessActivity], ['Date of incorporation', c.DateOfIncorporation], ['Status', c.CompanyStatus],
        ['Risk rating (final)', c.RiskRating], ['KYC status', c.KycStatus], ['Last KYC review', c.LastKycReviewDate], ['Next KYC review', c.NextKycReviewDate]]),
      sec_('Engagements', ['ID', 'Type', 'Start', 'End', 'Partner/Manager', 'Auditor', 'Status', 'Risk'], cg.engagements.map(function (e) { return [e.EngagementID, e.EngagementType, e.StartDate, e.EndDate, e.PartnerManager, e.AssignedAuditor, e.EngagementStatus, e.RiskLevel]; })),
      sec_('UBOs', ['ID', 'Name', 'Nationality', 'Own %', 'Voting %', 'Type', 'PEP', 'Sanctions', 'Adverse media', 'Risk', 'Verification', 'QID', 'Passport'],
        cg.ubos.map(function (u) { return [u.UBOID, u.FullName, u.Nationality, u.OwnershipPercentage, u.VotingPercentage, u.DirectIndirect, u.PEPStatus, u.SanctionsStatus, u.AdverseMediaStatus, u.RiskRating, u.VerificationStatus, u.QIDNumber, u.PassportNumber]; })),
      sec_('Ownership structure', ['Chain (Company <- ... )', 'Effective %', 'End of chain'], cg.ownership.chains.map(function (ch) { return [ch.path.map(function (s) { return s.name + ' (' + s.pct + '%)'; }).join(' <- '), ch.effective, ch.terminal]; })),
      sec_('Ownership warnings', ['Warning'], cg.ownership.warnings.concat(cg.uboWarnings).map(function (w) { return [w]; })),
      sec_('Documents (current)', ['Type', 'File', 'Status', 'Version', 'Uploaded by', 'Uploaded', 'Expiry'], dl.documents.filter(function (d) { return d.VersionStatus === 'Current'; }).map(function (d) { return [d.DocType, d.FileName, d.EffStatus, d.VersionNo, d.UploadedBy, d.UploadDate.substr(0, 10), d.ExpiryDate]; })),
      sec_('Mandatory documents', ['Requirement', 'Met'], dl.requirements.map(function (r) { return [r.label, r.met ? 'Yes' : 'NO']; })),
      sec_('Risk assessment', ['Item', 'Value'], rk ? [['Score', rk.Score], ['Calculated rating', rk.CalculatedRating], ['Final rating', rk.FinalRating], ['Set by', rk.FinalRatingBy], ['Override reason', rk.OverrideReason]] : [['Status', 'Not assessed']]),
      sec_('KYC reviews', ['Review', 'Cycle', 'Status', 'Submitted by', 'Reviewer', 'Reviewed', 'Decision', 'Next review'], rv.map(function (r) { return [r.ReviewID, r.CycleNo, r.Status, r.SubmittedBy, r.ReviewerEmail, r.ReviewedAt, r.Decision, r.NextReviewDate]; })),
      sec_('Approval history', ['When', 'Who', 'Role', 'Action', 'Comments'], auditRows.map(function (r) { return [r.Timestamp, r.UserEmail, r.UserRole, r.Action, r.Comments]; }))
    ]);
  } else if (type === 'docExpiry') {
    var days = p.days === undefined || p.days === '' ? Math.max.apply(null, getSetting_('EXPIRY_WARNING_DAYS')) : Number(p.days);
    var rows = docListAll_(user, { withinDays: days }).rows;
    out = rep_('Document Expiry Report (expired + expiring within ' + days + ' days)', user, [sec_('Documents', ['Company', 'Company ID', 'Document type', 'File', 'Status', 'Expiry date', 'Days'], rows.map(function (d) { return [d.CompanyName, d.CompanyID, d.DocType, d.FileName, d.EffStatus, d.ExpiryDate, d.DaysToExpiry]; }))]);
  } else if (type === 'highRisk') {
    out = rep_('High-Risk Company Report', user, [sec_('High-risk companies', ['Company ID', 'Company', 'QFC', 'CR', 'KYC status', 'Last review', 'Next review'],
      comps.filter(function (c) { return c.RiskRating === 'High'; }).map(function (c) { return [c.CompanyID, c.LegalName, c.QFCNumber, c.CRNumber, c.KycStatus, c.LastKycReviewDate, c.NextKycReviewDate]; }))]);
  } else if (type === 'pendingReview') {
    var rows2 = kycList_(user, { pendingOnly: true }).rows;
    out = rep_('Pending Review Report', user, [sec_('Awaiting review', ['Company ID', 'Company', 'Status', 'Submitted by', 'Submitted at', 'Risk'], rows2.map(function (r) { return [r.CompanyID, r.LegalName, r.Status, r.SubmittedBy, r.SubmittedAt, r.RiskRating]; }))]);
  } else if (type === 'kycCompletion') {
    var all = kycList_(user, {}).rows, tally = {};
    all.forEach(function (r) { tally[r.Status] = (tally[r.Status] || 0) + 1; });
    out = rep_('KYC Completion Report', user, [
      sec_('Summary', ['Status', 'Companies'], Object.keys(tally).map(function (k) { return [k, tally[k]]; })),
      sec_('Detail', ['Company ID', 'Company', 'Status', 'Risk', 'Last review', 'Next review', 'Overdue'], all.map(function (r) { return [r.CompanyID, r.LegalName, r.Status, r.RiskRating, r.LastKycReviewDate, r.NextKycReviewDate, r.Overdue ? 'YES' : '']; }))]);
  } else {
    fail_('Unknown report.', 'VALIDATION');
  }
  audit_(user, 'Report Generated', { companyId: p.companyId || '', recordType: 'Report', recordId: type, comments: out.title });
  return out;
}

function reportHtml_(rep) {
  var h = '<html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;font-size:10px;color:#111}h1{font-size:16px;color:#0b3a5b}h2{font-size:12px;margin:14px 0 4px;color:#0b3a5b}' +
    'table{border-collapse:collapse;width:100%;margin-bottom:6px}th,td{border:1px solid #bbb;padding:3px 5px;text-align:left;vertical-align:top}th{background:#e8eef3}.m{color:#666;font-size:9px}</style></head><body>';
  h += '<h1>' + escHtml_(rep.title) + '</h1><div class="m">Generated ' + escHtml_(rep.generatedAt) + ' by ' + escHtml_(rep.generatedBy) + ' - CONFIDENTIAL. This report supports, and does not itself evidence, regulatory compliance.</div>';
  rep.sections.forEach(function (s) {
    h += '<h2>' + escHtml_(s.title) + '</h2><table><tr>' + s.columns.map(function (c) { return '<th>' + escHtml_(c) + '</th>'; }).join('') + '</tr>';
    if (!s.rows.length) h += '<tr><td colspan="' + s.columns.length + '">No records</td></tr>';
    s.rows.forEach(function (r) { h += '<tr>' + r.map(function (v) { return '<td>' + escHtml_(v) + '</td>'; }).join('') + '</tr>'; });
    h += '</table>';
  });
  return h + '</body></html>';
}

function reportPdf_(user, p) {
  var rep = reportRun_(user, p);
  var pdf = Utilities.newBlob(reportHtml_(rep), 'text/html', 'report.html').getAs('application/pdf');
  return { name: 'AML_' + String(p.type) + '_' + todayStr_() + '.pdf', mimeType: 'application/pdf', base64: Utilities.base64Encode(pdf.getBytes()) };
}
