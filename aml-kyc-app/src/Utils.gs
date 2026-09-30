/** Utils.gs - shared helpers (all private: names end with "_"). */

/** User-safe error. Only AppError messages are shown to end users. */
function AppError(message, code) {
  this.name = 'AppError';
  this.message = message;
  this.code = code || 'ERROR';
}
AppError.prototype = Object.create(Error.prototype);

function fail_(msg, code) { throw new AppError(msg, code); }

function nowIso_() { return Utilities.formatDate(new Date(), APP.TZ, "yyyy-MM-dd'T'HH:mm:ss"); }
function todayStr_() { return Utilities.formatDate(new Date(), APP.TZ, 'yyyy-MM-dd'); }

function isValidDate_(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  var p = s.split('-').map(Number), d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  return d.getUTCFullYear() === p[0] && d.getUTCMonth() === p[1] - 1 && d.getUTCDate() === p[2] && p[0] >= 1900 && p[0] <= 2200;
}
function dateToUtc_(s) { var p = s.split('-').map(Number); return Date.UTC(p[0], p[1] - 1, p[2]); }
function daysBetween_(fromStr, toStr) { return Math.round((dateToUtc_(toStr) - dateToUtc_(fromStr)) / 86400000); }
function addMonths_(dateStr, m) {
  var p = dateStr.split('-').map(Number), y = p[0], mo = p[1] - 1 + m, d = p[2];
  y += Math.floor(mo / 12); mo = ((mo % 12) + 12) % 12;
  var last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  var dt = new Date(Date.UTC(y, mo, Math.min(d, last)));
  return dt.toISOString().substr(0, 10);
}
function addDays_(dateStr, n) { return new Date(dateToUtc_(dateStr) + n * 86400000).toISOString().substr(0, 10); }

function pad_(n, w) { var s = String(n); while (s.length < w) s = '0' + s; return s; }
function normEmail_(e) { return String(e || '').trim().toLowerCase(); }
/** Normalised identifier for duplicate detection (case/space/punctuation-insensitive). */
function normId_(s) { return String(s || '').toUpperCase().replace(/[\s\-_\/.]/g, ''); }
function normName_(s) {
  return String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9؀-ۿ ]/g, ' ')
    .replace(/\b(llc|w l l|wll|ltd|limited|llp|inc|co|company|qfc|branch)\b/g, ' ').replace(/\s+/g, ' ').trim();
}
function clip_(s, n) { s = String(s === null || s === undefined ? '' : s); return s.length > n ? s.substr(0, n) : s; }
function isEmail_(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s); }
function maskId_(s) { s = String(s || ''); return s.length <= 3 ? (s ? '***' : '') : new Array(s.length - 2).join('*') + s.substr(-3); }
function jsonParse_(s, dflt) { try { return s === '' || s === null || s === undefined ? dflt : JSON.parse(s); } catch (e) { return dflt; } }
function sanitizeFileName_(s) {
  s = String(s || 'file').replace(/[\\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim();
  return s.length > 120 ? s.substr(0, 120) : (s || 'file');
}
function sanitizeFolderName_(s) { return sanitizeFileName_(s).replace(/[.]+$/, '').substr(0, 60).trim(); }
function escHtml_(s) {
  return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function unique_(arr) { var seen = {}; return arr.filter(function (x) { return seen[x] ? false : (seen[x] = true); }); }
function groupBy_(rows, key) {
  var m = {};
  rows.forEach(function (r) { (m[r[key]] = m[r[key]] || []).push(r); });
  return m;
}
function sha256Hex_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}
function isDeleted_(r) { return r.IsDeleted === 'Y'; }
function live_(rows) { return rows.filter(function (r) { return r.IsDeleted !== 'Y'; }); }

/** Shallow diff of two records over the given keys -> {old:{}, new:{}} (only changed keys). */
function diff_(before, after, keys) {
  var o = {}, n = {}, changed = false;
  keys.forEach(function (k) {
    var a = before[k] === undefined ? '' : before[k], b = after[k] === undefined ? '' : after[k];
    if (String(a) !== String(b)) { o[k] = a; n[k] = b; changed = true; }
  });
  return { old: o, neu: n, changed: changed };
}

function resolveOptions_(f) {
  if (Array.isArray(f.options)) return f.options;
  if (typeof f.options === 'string') {
    if (f.options.indexOf('setting:') === 0) return getSetting_(f.options.substr(8)) || [];
    if (f.options === 'roles') return Object.keys(getRolePermissions_());
  }
  return null;
}

/**
 * Validates `data` against field definitions. Returns cleaned values (only editable fields present in
 * data, or all fields when opts.create). Throws AppError listing every problem.
 * opts: {create:bool, user:user}
 */
function validateFields_(fields, data, opts) {
  opts = opts || {};
  var out = {}, errs = [];
  fields.forEach(function (f) {
    if (f.ro) return;
    if (f.perm && !(opts.user && hasPermission_(opts.user, f.perm))) return;
    var has = Object.prototype.hasOwnProperty.call(data, f.k);
    if (!has && !opts.create) return;
    var raw = has ? data[f.k] : (f.def !== undefined ? f.def : '');
    var v = (raw === null || raw === undefined) ? '' : (typeof raw === 'string' ? raw.trim() : raw);
    if (v === '' && has && f.def !== undefined && !f.required) v = '';
    var L = f.label;
    if (v === '' || v === undefined) {
      if (f.required) errs.push(L + ' is required.');
      out[f.k] = '';
      return;
    }
    switch (f.type) {
      case 'text': case 'textarea': case 'ref':
        v = String(v);
        if (v.length > (f.max || (f.type === 'textarea' ? 2000 : 250))) { errs.push(L + ' is too long.'); return; }
        break;
      case 'email':
        v = normEmail_(v);
        if (!isEmail_(v) || v.length > 200) { errs.push(L + ' must be a valid email address.'); return; }
        break;
      case 'user':
        v = normEmail_(v);
        if (!isEmail_(v)) { errs.push(L + ' must be a valid user email.'); return; }
        break;
      case 'date':
        if (!isValidDate_(String(v))) { errs.push(L + ' must be a valid date (YYYY-MM-DD).'); return; }
        v = String(v);
        break;
      case 'number':
        var n = Number(v);
        if (!isFinite(n)) { errs.push(L + ' must be a number.'); return; }
        if (f.min !== undefined && n < f.min) { errs.push(L + ' must be at least ' + f.min + '.'); return; }
        if (f.max !== undefined && n > f.max) { errs.push(L + ' must not exceed ' + f.max + '.'); return; }
        v = Math.round(n * 10000) / 10000;
        break;
      case 'flag':
        v = (v === true || v === 'Y' || v === 'true') ? 'Y' : '';
        break;
      case 'select':
        var opts2 = resolveOptions_(f);
        if (opts2 && opts2.indexOf(v) < 0) { errs.push(L + ' has an invalid value.'); return; }
        break;
    }
    if (f.pattern && !new RegExp(f.pattern).test(String(v))) { errs.push(f.patternMsg || (L + ' has an invalid format.')); return; }
    out[f.k] = v;
  });
  if (errs.length) fail_(errs.join(' '), 'VALIDATION');
  return out;
}

/** Field definitions safe to send to the browser, with options resolved. */
function clientFields_(entity, user) {
  var tname = Object.keys(TABLES).filter(function (n) { return TABLES[n].entity === entity; })[0];
  return TABLES[tname].fields.map(function (f) {
    var c = {};
    for (var k in f) c[k] = f[k];
    var o = resolveOptions_(f);
    if (o) c.options = o; else delete c.options;
    if (f.suggest) c.suggestions = getSetting_(f.suggest) || [];
    c.readonly = !!f.ro || !!(f.perm && !hasPermission_(user, f.perm));
    return c;
  });
}
