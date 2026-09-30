/** AuditService.gs - append-only, hash-chained audit trail. There is no update/delete API for it. */

function maskSensitive_(v) {
  if (v === undefined || v === null || v === '') return '';
  if (typeof v !== 'object') return String(v);
  var o = Array.isArray(v) ? [] : {};
  for (var k in v) {
    if ((k === 'QIDNumber' || k === 'PassportNumber') && v[k]) o[k] = maskId_(v[k]);
    else if (typeof v[k] === 'object' && v[k] !== null) o[k] = maskSensitive_(v[k]);
    else o[k] = v[k];
  }
  return o;
}
function auditVal_(v) {
  v = maskSensitive_(v);
  return clip_(typeof v === 'object' ? JSON.stringify(v) : v, 20000);
}

/**
 * user: {Email, Role} (a pseudo user {Email:'SYSTEM', Role:'SYSTEM'} is allowed for jobs).
 * o: {companyId, recordType, recordId, oldValue, newValue, comments}
 */
function audit_(user, action, o) {
  o = o || {};
  return withLock_(function () {
    var props = PropertiesService.getScriptProperties();
    var rec = {
      LogID: nextId_('Audit_Log'), Timestamp: nowIso_(), UserEmail: user ? user.Email : 'SYSTEM', UserRole: user ? user.Role : 'SYSTEM',
      Action: action, CompanyID: o.companyId || '', RecordType: o.recordType || '', RecordID: o.recordId || '',
      OldValue: auditVal_(o.oldValue), NewValue: auditVal_(o.newValue),
      ClientInfo: _memo.client ? 'UA: ' + _memo.client + ' (client-reported; IP not available in Apps Script)' : 'IP not available in Apps Script',
      Comments: clip_(o.comments || '', 2000)
    };
    rec.PrevHash = props.getProperty(PROP.AUDIT_HASH) || '';
    rec.Hash = auditHash_(rec);
    dbInsert_('Audit_Log', rec);
    props.setProperty(PROP.AUDIT_HASH, rec.Hash);
    return rec.LogID;
  });
}

function auditHash_(r) {
  return sha256Hex_([r.PrevHash, r.LogID, r.Timestamp, r.UserEmail, r.UserRole, r.Action, r.CompanyID, r.RecordType, r.RecordID,
    r.OldValue, r.NewValue, r.ClientInfo, r.Comments].join('|'));
}

function readAuditTail_(windowSize) {
  var sh = sheet_('Audit_Log'), last = sh.getLastRow(), cols = cols_('Audit_Log');
  if (last < 2) return [];
  var start = Math.max(2, last - windowSize + 1);
  var vals = sh.getRange(start, 1, last - start + 1, cols.length).getValues();
  return vals.reverse().map(function (row) {
    var o = {};
    cols.forEach(function (c, i) { o[c] = String(row[i]); });
    return o;
  });
}

/** filters: {companyId, user, action, from, to, q, offset, limit} */
function auditList_(user, f) {
  f = f || {};
  if (f.companyId) {
    requireCompany_(user, f.companyId, true);
    if (!gate_(user, 'AUDIT_VIEW') && !gate_(user, 'AUDIT_VIEW_COMPANY')) requirePermission_(user, 'AUDIT_VIEW_COMPANY');
  } else {
    requirePermission_(user, 'AUDIT_VIEW');
  }
  var rows = readAuditTail_(5000), q = String(f.q || '').toLowerCase();
  rows = rows.filter(function (r) {
    if (f.companyId && r.CompanyID !== f.companyId) return false;
    if (f.user && r.UserEmail.toLowerCase().indexOf(String(f.user).toLowerCase()) < 0) return false;
    if (f.action && r.Action !== f.action) return false;
    if (f.from && r.Timestamp.substr(0, 10) < f.from) return false;
    if (f.to && r.Timestamp.substr(0, 10) > f.to) return false;
    if (q && (r.Action + ' ' + r.RecordID + ' ' + r.Comments + ' ' + r.UserEmail).toLowerCase().indexOf(q) < 0) return false;
    return true;
  });
  var off = Number(f.offset) || 0, lim = Math.min(Number(f.limit) || 100, 500);
  return {
    total: rows.length,
    rows: rows.slice(off, off + lim).map(function (r) { delete r.PrevHash; delete r.Hash; return r; }),
    actions: unique_(readAuditTail_(1000).map(function (r) { return r.Action; })).sort()
  };
}

/** Re-computes the hash chain to detect tampering with Audit_Log. */
function auditVerify_(user) {
  requirePermission_(user, 'AUDIT_VIEW');
  var sh = sheet_('Audit_Log'), last = sh.getLastRow(), cols = cols_('Audit_Log');
  if (last < 2) return { ok: true, checked: 0 };
  var vals = sh.getRange(2, 1, last - 1, cols.length).getValues(), prev = '', bad = null;
  for (var i = 0; i < vals.length; i++) {
    var r = {};
    cols.forEach(function (c, j) { r[c] = String(vals[i][j]); });
    if (r.PrevHash !== prev || auditHash_(r) !== r.Hash) { bad = { row: i + 2, logId: r.LogID }; break; }
    prev = r.Hash;
  }
  audit_(user, 'Audit Chain Verified', { recordType: 'Audit_Log', comments: bad ? 'BROKEN at ' + bad.logId : 'OK' });
  return { ok: !bad, checked: vals.length, brokenAt: bad };
}
