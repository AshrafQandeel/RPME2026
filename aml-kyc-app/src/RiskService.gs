/** RiskService.gs - configurable AML/KYC risk assessment. The methodology lives in Settings (RISK_CONFIG). */

function riskCurrent_(companyId) {
  var rows = dbWhere_('Risk_Assessments', function (r) { return r.CompanyID === companyId && r.IsCurrent === 'Y'; });
  return rows[rows.length - 1] || null;
}

/** answers: {factorId: optionValue}. Returns {score, rating, complete, escalations[]}. */
function riskCompute_(cfg, answers) {
  var num = 0, den = 0, esc = [], missing = 0;
  cfg.factors.forEach(function (f) {
    var opt = f.options.filter(function (o) { return o.v === answers[f.id]; })[0];
    if (!opt) { missing++; return; }
    var max = Math.max.apply(null, f.options.map(function (o) { return o.s; })) || 1;
    num += f.weight * opt.s; den += f.weight * max;
    if (opt.esc) esc.push(f.label + ': ' + opt.v);
  });
  var score = den ? Math.round(num / den * 1000) / 10 : 0;
  var rating = score >= cfg.thresholds.highFrom ? 'High' : score >= cfg.thresholds.mediumFrom ? 'Medium' : 'Low';
  if (esc.length) rating = 'High';
  return { score: score, rating: rating, complete: missing === 0, escalations: esc };
}

/** Suggested answers derived from recorded data. Suggestions only - the assessor decides. */
function riskHints_(company, ubos, shs, cfg) {
  var h = {};
  function opt(fid, v) { var f = cfg.factors.filter(function (x) { return x.id === fid; })[0]; if (f && f.options.some(function (o) { return o.v === v; })) h[fid] = v; }
  function escOpt(fid) { var f = cfg.factors.filter(function (x) { return x.id === fid; })[0]; var o = f && f.options.filter(function (x) { return x.esc; })[0]; if (o) h[fid] = o.v; }
  var st = function (k) { return ubos.map(function (u) { return u[k]; }); }, any = function (a, v) { return a.indexOf(v) >= 0; };
  if (ubos.length) {
    var pep = st('PEPStatus');
    if (any(pep, 'PEP')) opt('pep', 'PEP identified'); else if (any(pep, 'Family member of PEP') || any(pep, 'Close associate of PEP')) opt('pep', 'PEP associate / family member'); else if (pep.every(function (x) { return x === 'Not a PEP'; })) opt('pep', 'No PEP identified');
    var sc = st('SanctionsStatus');
    if (any(sc, 'Confirmed match')) opt('sanctions', 'Confirmed match'); else if (any(sc, 'Potential match')) opt('sanctions', 'Potential match'); else if (any(sc, 'Not screened')) opt('sanctions', 'Not screened'); else opt('sanctions', 'Clear');
    var am = st('AdverseMediaStatus');
    if (any(am, 'Negative media identified')) opt('adverse_media', 'Negative media identified'); else if (any(am, 'Further review required') || any(am, 'Not screened')) opt('adverse_media', 'Further review required'); else opt('adverse_media', 'No adverse media identified');
    if (st('VerificationStatus').every(function (x) { return x === 'Verified'; })) opt('ubo_clarity', 'UBOs identified and verified'); else opt('ubo_clarity', 'Identified - verification pending');
    if (any(st('RiskRating'), 'High')) opt('ubo_risk', 'UBO rated high'); else if (any(st('RiskRating'), 'Medium')) opt('ubo_risk', 'UBO rated medium'); else opt('ubo_risk', 'No UBO rated high');
  } else opt('ubo_clarity', 'Unclear / cannot identify UBO');
  var hr = (getSetting_('HIGH_RISK_JURISDICTIONS') || []).map(function (x) { return String(x).toLowerCase(); });
  if (hr.indexOf(String(company.CountryOfIncorporation).toLowerCase()) >= 0) escOpt('geo_incorporation');
  if (ubos.some(function (u) { return hr.indexOf(String(u.CountryOfResidence).toLowerCase()) >= 0 || hr.indexOf(String(u.Nationality).toLowerCase()) >= 0; })) escOpt('geo_residence');
  return h;
}

function riskGet_(user, p) {
  var c = requireCompany_(user, p.companyId, true), cfg = getSetting_('RISK_CONFIG');
  var ubos = dbWhere_('UBOs', function (u) { return u.CompanyID === c.CompanyID && !isDeleted_(u); });
  var shs = dbWhere_('Shareholders', function (s) { return s.CompanyID === c.CompanyID && !isDeleted_(s); });
  var cur = riskCurrent_(c.CompanyID);
  var hist = dbWhere_('Risk_Assessments', function (r) { return r.CompanyID === c.CompanyID; }).slice(-10).reverse().map(function (r) {
    return { RiskID: r.RiskID, Score: r.Score, CalculatedRating: r.CalculatedRating, FinalRating: r.FinalRating, FinalRatingBy: r.FinalRatingBy, FinalRatingAt: r.FinalRatingAt, AssessedBy: r.UpdatedBy, AssessedAt: r.UpdatedAt, OverrideReason: r.OverrideReason };
  });
  return {
    config: cfg, current: cur ? { RiskID: cur.RiskID, Answers: jsonParse_(cur.Answers, {}), Score: cur.Score, CalculatedRating: cur.CalculatedRating, Escalations: jsonParse_(cur.Escalations, []), FinalRating: cur.FinalRating, OverrideReason: cur.OverrideReason, Notes: cur.Notes } : null,
    hints: riskHints_(c, ubos, shs, cfg), history: hist, companyRating: c.RiskRating,
    can: { assess: hasPermission_(user, 'RISK_ASSESS') && !editBlockReason_(user, c), finalize: hasPermission_(user, 'RISK_EDIT_FINAL') }
  };
}

function riskSave_(user, p) {
  requirePermission_(user, 'RISK_ASSESS');
  var c = requireCompany_(user, p.companyId);
  assertEditable_(user, c);
  var cfg = getSetting_('RISK_CONFIG'), answers = {}, src = p.answers || {};
  Object.keys(src).forEach(function (fid) {
    var f = cfg.factors.filter(function (x) { return x.id === fid; })[0];
    if (!f) fail_('Unknown risk factor.', 'VALIDATION');
    if (src[fid] === '' || src[fid] === null) return;
    if (!f.options.some(function (o) { return o.v === src[fid]; })) fail_('Invalid answer for ' + f.label + '.', 'VALIDATION');
    answers[fid] = src[fid];
  });
  var calc = riskCompute_(cfg, answers), now = nowIso_(), cur = riskCurrent_(c.CompanyID), rec;
  var fields = { Answers: answers, Score: calc.score, CalculatedRating: calc.complete ? calc.rating : '', Escalations: calc.escalations, ConfigVersion: cfg.version || 1, Notes: clip_(p.notes, 1000), UpdatedBy: user.Email, UpdatedAt: now };
  if (cur && !cur.FinalRating) {
    rec = dbUpdate_('Risk_Assessments', cur.RiskID, fields);
  } else {
    if (cur) dbUpdate_('Risk_Assessments', cur.RiskID, { IsCurrent: '' });
    fields.CompanyID = c.CompanyID; fields.EngagementID = ''; fields.IsCurrent = 'Y'; fields.CreatedBy = user.Email; fields.CreatedAt = now;
    rec = dbInsert_('Risk_Assessments', fields);
  }
  audit_(user, 'Risk Assessment Saved', { companyId: c.CompanyID, recordType: 'Risk Assessment', recordId: rec.RiskID,
    oldValue: cur ? { Score: cur.Score, CalculatedRating: cur.CalculatedRating } : '', newValue: { Score: calc.score, CalculatedRating: fields.CalculatedRating, Complete: calc.complete } });
  return { score: calc.score, rating: fields.CalculatedRating, complete: calc.complete, escalations: calc.escalations, riskId: rec.RiskID };
}

/** MLRO/DMLRO sets the final risk rating (may differ from the calculated one, with a documented reason). */
function riskFinalize_(user, p) {
  requirePermission_(user, 'RISK_EDIT_FINAL');
  var c = requireCompany_(user, p.companyId), cur = riskCurrent_(c.CompanyID);
  if (!cur) fail_('Complete a risk assessment first.', 'VALIDATION');
  var cfg = getSetting_('RISK_CONFIG'), calc = riskCompute_(cfg, jsonParse_(cur.Answers, {}));
  if (!calc.complete) fail_('The risk assessment is incomplete.', 'VALIDATION');
  var rating = String(p.rating || '');
  if (RISK_LEVELS.indexOf(rating) < 0) fail_('Select a valid final rating.', 'VALIDATION');
  var reason = String(p.reason || '').trim();
  if (rating !== calc.rating && !reason) fail_('A reason is required when the final rating differs from the calculated rating (' + calc.rating + ').', 'VALIDATION');
  var now = nowIso_();
  dbUpdate_('Risk_Assessments', cur.RiskID, { CalculatedRating: calc.rating, FinalRating: rating, FinalRatingBy: user.Email, FinalRatingAt: now, OverrideReason: clip_(reason, 1000), UpdatedBy: user.Email, UpdatedAt: now });
  var old = c.RiskRating;
  dbUpdate_('Companies', c.CompanyID, { RiskRating: rating, UpdatedBy: user.Email, UpdatedAt: now });
  dbWhere_('Engagements', function (e) { return e.CompanyID === c.CompanyID && !isDeleted_(e); }).forEach(function (e) { dbUpdate_('Engagements', e.EngagementID, { RiskLevel: rating }); });
  audit_(user, 'Risk Rating Changed', { companyId: c.CompanyID, recordType: 'Company', recordId: c.CompanyID, oldValue: { RiskRating: old }, newValue: { RiskRating: rating, Calculated: calc.rating, Score: calc.score }, comments: reason });
  if (rating === 'High') notify_('HIGH_RISK', { company: c });
  return { rating: rating };
}
