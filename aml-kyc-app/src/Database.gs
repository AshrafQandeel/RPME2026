/** Database.gs - Google Sheets data access layer with caching and locking. */

var _memo = {};          // per-execution memo
var _lockDepth = 0;
var CACHE_TTL = 300;
var CHUNK = 30000;       // chars per cache chunk (CacheService limit is 100KB/value)

function resetMemo_() { _memo = {}; }

function withLock_(fn) {
  if (_lockDepth > 0) return fn();
  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) { fail_('The system is busy. Please try again in a moment.', 'BUSY'); }
  _lockDepth++;
  try { return fn(); } finally { _lockDepth--; lock.releaseLock(); }
}

// ---- cache helpers
function cachePut_(key, obj) {
  try {
    var s = JSON.stringify(obj), n = Math.ceil(s.length / CHUNK);
    if (n > 30) return;
    var m = {};
    for (var i = 0; i < n; i++) m[key + ':' + i] = s.substr(i * CHUNK, CHUNK);
    m[key + ':n'] = String(n);
    CacheService.getScriptCache().putAll(m, CACHE_TTL);
  } catch (e) { /* cache is best-effort */ }
}
function cacheGet_(key) {
  try {
    var c = CacheService.getScriptCache(), n = Number(c.get(key + ':n'));
    if (!n) return null;
    var keys = []; for (var i = 0; i < n; i++) keys.push(key + ':' + i);
    var all = c.getAll(keys), s = '';
    for (var j = 0; j < n; j++) { if (all[keys[j]] === undefined) return null; s += all[keys[j]]; }
    return JSON.parse(s);
  } catch (e) { return null; }
}
function cacheDrop_(key) { try { CacheService.getScriptCache().remove(key + ':n'); } catch (e) { } }
function invalidate_(name) { delete _memo['t:' + name]; cacheDrop_('t:' + name); if (name === 'Settings') delete _memo.settings; }

// ---- spreadsheet access
function getDb_() {
  if (_memo.ss) return _memo.ss;
  var id = PropertiesService.getScriptProperties().getProperty(PROP.DB_ID);
  if (!id) fail_('The system has not been set up. Ask the administrator to run setupAMLSystem().', 'NOT_SETUP');
  try { _memo.ss = SpreadsheetApp.openById(id); } catch (e) { logError_(null, 'openDb', e); fail_('Database update failed.', 'DB'); }
  return _memo.ss;
}
function sheet_(name) {
  var sh = getDb_().getSheetByName(name);
  if (!sh) fail_('Database sheet is missing: ' + name, 'DB');
  return sh;
}
function cols_(name) {
  var k = 'c:' + name;
  if (_memo[k]) return _memo[k];
  var sh = sheet_(name), n = sh.getLastColumn();
  _memo[k] = n ? sh.getRange(1, 1, 1, n).getValues()[0].map(String) : [];
  return _memo[k];
}
function coerce_(col, v) {
  if (v instanceof Date) return Utilities.formatDate(v, APP.TZ, "yyyy-MM-dd'T'HH:mm:ss").replace(/T00:00:00$/, '');
  if (NUMERIC_COLS[col]) return v === '' || v === null ? '' : Number(v);
  return v === null || v === undefined ? '' : String(v);
}

/** All rows of a sheet as objects. Treat the returned objects as read-only. */
function dbAll_(name) {
  var k = 't:' + name;
  if (_memo[k]) return _memo[k];
  var rows = cacheGet_(k);
  if (!rows) {
    var sh = sheet_(name), cols = cols_(name), last = sh.getLastRow();
    rows = [];
    if (last > 1) {
      var vals = sh.getRange(2, 1, last - 1, cols.length).getValues();
      for (var i = 0; i < vals.length; i++) {
        if (vals[i][0] === '' || vals[i][0] === null) continue;
        var o = {};
        for (var j = 0; j < cols.length; j++) o[cols[j]] = coerce_(cols[j], vals[i][j]);
        rows.push(o);
      }
    }
    cachePut_(k, rows);
  }
  _memo[k] = rows;
  return rows;
}
function dbGet_(name, id) {
  var idCol = TABLES[name].idCol, rows = dbAll_(name);
  for (var i = 0; i < rows.length; i++) if (rows[i][idCol] === id) return rows[i];
  return null;
}
function dbWhere_(name, fn) { return dbAll_(name).filter(fn); }

function toCell_(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'object') v = JSON.stringify(v);
  if (typeof v === 'string' && v.length > 49000) v = v.substr(0, 49000);
  return v;
}

function nextId_(name) {
  var t = TABLES[name], props = PropertiesService.getScriptProperties(), key = PROP.COUNTER + t.prefix;
  var cur = Number(props.getProperty(key)) || 0;
  var max = 0;
  if (!cur) {
    dbAll_(name).forEach(function (r) { var n = Number(String(r[t.idCol]).split('-')[1]); if (n > max) max = n; });
    cur = max;
  }
  cur++;
  props.setProperty(key, String(cur));
  return t.prefix + '-' + pad_(cur, 6);
}

/** Inserts a record (caller must hold the write lock via withLock_). Returns the stored record. */
function dbInsert_(name, obj) {
  return withLock_(function () {
    var t = TABLES[name], cols = cols_(name);
    if (!obj[t.idCol]) obj[t.idCol] = nextId_(name);
    var sh = sheet_(name), r = sh.getLastRow() + 1;
    if (r > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 200);
    var row = cols.map(function (c) { return toCell_(obj[c]); });
    sh.getRange(r, 1, 1, cols.length).setNumberFormat('@').setValues([row]);
    invalidate_(name);
    var rec = {};
    cols.forEach(function (c, i) { rec[c] = coerce_(c, row[i]); });
    return rec;
  });
}

function rowIndex_(name, id) {
  var sh = sheet_(name), last = sh.getLastRow();
  if (last < 2) return -1;
  var ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === id) return i + 2;
  return -1;
}

/** Merges `patch` into the record with the given ID. Returns the updated record. */
function dbUpdate_(name, id, patch) {
  return withLock_(function () {
    var cols = cols_(name), t = TABLES[name], sh = sheet_(name), r = rowIndex_(name, id);
    if (r < 0) fail_('Record not found.', 'NOT_FOUND');
    var cur = sh.getRange(r, 1, 1, cols.length).getValues()[0];
    var rec = {};
    cols.forEach(function (c, i) { rec[c] = patch.hasOwnProperty(c) && c !== t.idCol ? toCell_(patch[c]) : cur[i]; });
    sh.getRange(r, 1, 1, cols.length).setNumberFormat('@').setValues([cols.map(function (c) { return rec[c]; })]);
    invalidate_(name);
    var out = {};
    cols.forEach(function (c) { out[c] = coerce_(c, rec[c]); });
    return out;
  });
}

/** Physically deletes a row. Used only for test-data removal. */
function dbHardDelete_(name, id) {
  return withLock_(function () {
    var r = rowIndex_(name, id);
    if (r > 0) { sheet_(name).deleteRow(r); invalidate_(name); }
  });
}

function logError_(user, action, e) {
  try {
    var rec = { Timestamp: nowIso_(), UserEmail: user ? user.Email : '', Action: action, Message: clip_(e && e.message || e, 1000), Stack: clip_(e && e.stack || '', 4000) };
    var sh = getDb_().getSheetByName('Error_Log');
    if (!sh) return rec;
    rec.ErrorID = 'ERR-' + Utilities.formatDate(new Date(), APP.TZ, 'yyMMddHHmmss') + '-' + pad_(Math.floor(Math.random() * 1000), 3);
    var cols = cols_('Error_Log'), r = sh.getLastRow() + 1;
    sh.getRange(r, 1, 1, cols.length).setNumberFormat('@').setValues([cols.map(function (c) { return toCell_(rec[c]); })]);
    return rec;
  } catch (x) {
    console.error('logError_ failed', x, e);
    return { ErrorID: 'ERR-UNLOGGED' };
  }
}
