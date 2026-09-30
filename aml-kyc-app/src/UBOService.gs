/** UBOService.gs - UBOs, shareholders and the ownership-structure analysis. */

var CHILD_ = {
  Engagement: { table: 'Engagements', label: 'Engagement', perm: 'ENGAGEMENT_MANAGE', delPerm: 'ENGAGEMENT_DELETE', check: function (v, c) { return engagementCheck_(v, c); } },
  UBO: { table: 'UBOs', label: 'UBO', perm: 'UBO_MANAGE', delPerm: 'UBO_DELETE', check: function (v, c) { return uboCheck_(v, c); } },
  Shareholder: { table: 'Shareholders', label: 'Shareholder', perm: 'OWNERSHIP_MANAGE', delPerm: 'SHAREHOLDER_DELETE', check: function (v, c) { return shareholderCheck_(v, c); }, beforeDelete: function (r) { return shareholderBeforeDelete_(r); }, post: function (c) { return ownershipPost_(c); } }
};

function uboWarnings_(ubos, ignoreId, addPct) {
  var w = [], direct = 0;
  ubos.forEach(function (u) { if (u.UBOID !== ignoreId && (u.DirectIndirect === 'Direct' || u.DirectIndirect === 'Both')) direct += Number(u.OwnershipPercentage) || 0; });
  direct += addPct || 0;
  if (direct > 100.01) w.push('Total direct ownership recorded across UBOs is ' + Math.round(direct * 100) / 100 + '% which exceeds 100%.');
  ubos.forEach(function (u) {
    if (u.SanctionsStatus === 'Confirmed match') w.push('UBO ' + u.FullName + ': confirmed sanctions match - escalate to the MLRO immediately.');
    if (u.SanctionsStatus === 'Potential match') w.push('UBO ' + u.FullName + ': potential sanctions match requires review.');
  });
  return w;
}

function uboCheck_(v, ctx) {
  var others = dbWhere_('UBOs', function (u) { return u.CompanyID === ctx.company.CompanyID && !isDeleted_(u); });
  var pct = v.OwnershipPercentage !== undefined && (v.DirectIndirect === 'Direct' || v.DirectIndirect === 'Both') ? Number(v.OwnershipPercentage) : 0;
  var w = [];
  var direct = others.reduce(function (s, u) { return s + (u.UBOID !== (ctx.existing && ctx.existing.UBOID) && (u.DirectIndirect === 'Direct' || u.DirectIndirect === 'Both') ? Number(u.OwnershipPercentage) || 0 : 0); }, 0) + pct;
  if (direct > 100.01) w.push('Total direct ownership recorded across UBOs is ' + Math.round(direct * 100) / 100 + '% which exceeds 100%.');
  if (v.VerificationStatus === 'Verified' && !v.VerificationDate) v.VerificationDate = todayStr_();
  if (v.SanctionsStatus === 'Confirmed match') w.push('Confirmed sanctions match recorded - escalate to the MLRO immediately.');
  return w;
}

function shareholderCheck_(v, ctx) {
  var cid = ctx.company.CompanyID, selfId = ctx.existing && ctx.existing.ShareholderID;
  var all = dbWhere_('Shareholders', function (s) { return s.CompanyID === cid && !isDeleted_(s); });
  if (v.HeldThroughID) {
    var parent = all.filter(function (s) { return s.ShareholderID === v.HeldThroughID; })[0];
    if (!parent) fail_('The selected intermediate entity does not exist for this company.', 'VALIDATION');
    if (parent.EntityType !== 'Entity') fail_('An individual cannot be an intermediate holding entity.', 'VALIDATION');
    if (selfId) { // cycle detection
      var cur = parent, guard = 0;
      while (cur && guard++ < 50) {
        if (cur.ShareholderID === selfId) fail_('This selection would create a circular ownership chain.', 'VALIDATION');
        cur = all.filter(function (s) { return s.ShareholderID === cur.HeldThroughID; })[0];
      }
    }
  }
  if (v.UBOID && !dbWhere_('UBOs', function (u) { return u.UBOID === v.UBOID && u.CompanyID === cid && !isDeleted_(u); }).length) fail_('The linked UBO record does not exist for this company.', 'VALIDATION');
  if (v.EntityType === 'Individual' && v.HeldThroughID === undefined) { /* ok */ }
  return [];
}
function shareholderBeforeDelete_(rec) {
  var kids = dbWhere_('Shareholders', function (s) { return s.HeldThroughID === rec.ShareholderID && !isDeleted_(s); });
  if (kids.length) fail_('Remove or re-assign the ' + kids.length + ' holder(s) recorded under this entity first.', 'VALIDATION');
}
function ownershipPost_(company) {
  var shs = dbWhere_('Shareholders', function (s) { return s.CompanyID === company.CompanyID && !isDeleted_(s); });
  var ubos = dbWhere_('UBOs', function (u) { return u.CompanyID === company.CompanyID && !isDeleted_(u); });
  return ownershipAnalysis_(shs, ubos).warnings;
}

/**
 * Builds the ownership chains (Company <- Shareholder <- Intermediate <- Ultimate parent <- UBO),
 * effective percentages and integrity warnings.
 */
function ownershipAnalysis_(shs, ubos) {
  var thr = Number((getSetting_('ACCESS') || {}).uboThresholdPercent) || 25;
  var byId = {}, kids = {}, warnings = [], chains = [], indiv = {};
  shs.forEach(function (s) { byId[s.ShareholderID] = s; });
  shs.forEach(function (s) {
    var k = s.HeldThroughID && byId[s.HeldThroughID] ? s.HeldThroughID : '';
    if (s.HeldThroughID && !byId[s.HeldThroughID]) warnings.push(s.ShareholderName + ': the intermediate entity it holds shares in no longer exists.');
    (kids[k] = kids[k] || []).push(s);
    if (s.IsNominee === 'Y') warnings.push('Nominee shareholder recorded: ' + s.ShareholderName + ' - identify the principal.');
  });
  var sum = function (arr) { return Math.round(arr.reduce(function (a, s) { return a + (Number(s.HoldingPercentage) || 0); }, 0) * 10000) / 10000; };
  var direct = kids[''] || [], directTotal = sum(direct);
  if (!shs.length) warnings.push('No shareholders have been recorded.');
  else if (Math.abs(directTotal - 100) > 0.01) warnings.push('Total direct ownership is ' + directTotal + '% (expected 100%).');

  function walk(node, path, eff, seen) {
    if (seen.indexOf(node.ShareholderID) >= 0) { warnings.push('Circular ownership detected at ' + node.ShareholderName + '.'); return; }
    var step = { id: node.ShareholderID, name: node.ShareholderName, type: node.EntityType, country: node.Country, pct: Number(node.HoldingPercentage), ultimate: node.IsUltimateParent === 'Y' };
    var p = path.concat([step]), e = eff * step.pct / 100, ch = kids[node.ShareholderID] || [];
    if (node.EntityType === 'Entity' && ch.length) {
      var t = sum(ch);
      if (Math.abs(t - 100) > 0.01) warnings.push('Holders recorded in ' + node.ShareholderName + ' total ' + t + '% (expected 100%).');
      ch.forEach(function (c) { walk(c, p, e, seen.concat([node.ShareholderID])); });
      return;
    }
    var terminal = node.EntityType === 'Individual' ? 'Individual' : (step.ultimate ? 'Ultimate parent' : 'Not traced further');
    if (terminal === 'Not traced further') warnings.push('Ownership of ' + node.ShareholderName + ' has not been traced to its individual owners or an ultimate parent.');
    chains.push({ path: p, effective: Math.round(e * 10000) / 10000, terminal: terminal });
    if (node.EntityType === 'Individual') {
      var key = node.UBOID || 'n:' + normName_(node.ShareholderName);
      indiv[key] = indiv[key] || { name: node.ShareholderName, uboId: node.UBOID || '', effective: 0 };
      indiv[key].effective += e;
    }
  }
  direct.forEach(function (d) { walk(d, [], 100, []); });
  var individuals = Object.keys(indiv).map(function (k) {
    var i = indiv[k]; i.effective = Math.round(i.effective * 10000) / 10000;
    i.uboRecorded = !!(i.uboId || ubos.some(function (u) { return normName_(u.FullName) === normName_(i.name); }));
    if (i.effective >= thr && !i.uboRecorded) warnings.push(i.name + ' holds ' + i.effective + '% effective ownership (>= ' + thr + '% threshold) but is not recorded as a UBO.');
    return i;
  });
  return { directTotal: directTotal, chains: chains, individuals: individuals, warnings: unique_(warnings), threshold: thr };
}
