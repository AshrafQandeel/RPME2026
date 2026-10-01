'use strict';
/** Minimal in-memory mocks of the Apps Script services used by the app, so the real .gs files can run under Node. */
const vm = require('vm'), fs = require('fs'), path = require('path'), crypto = require('crypto');

function createEnv(srcDir) {
  const state = { active: '', effective: 'owner@firm.test', mails: [], props: {}, cache: {}, nextId: 1 };
  const id = () => 'ID' + (state.nextId++);

  // ---------- Sheets
  class Range {
    constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
    getValues() { const o = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) { const v = (this.sh.data[this.r - 1 + i] || [])[this.c - 1 + j]; row.push(v === undefined ? '' : v); } o.push(row); } return o; }
    setValues(vals) { for (let i = 0; i < this.nr; i++) { const rr = this.r - 1 + i; this.sh.data[rr] = this.sh.data[rr] || []; for (let j = 0; j < this.nc; j++) { let v = vals[i][j]; this.sh.data[rr][this.c - 1 + j] = (v === '' || v === null || v === undefined) ? '' : String(v); } } return this; }
    setNumberFormat() { return this; } setFontWeight() { return this; } setBackground() { return this; } setFontColor() { return this; }
  }
  class Sheet {
    constructor(name) { this.name = name; this.data = []; this.maxRows = 1000; this.maxCols = 26; }
    getRange(r, c, nr, nc) { nr = nr || 1; nc = nc || 1; if (r < 1 || c < 1 || r + nr - 1 > this.maxRows || c + nc - 1 > this.maxCols) throw new Error('Range out of bounds: ' + this.name + ' r' + r + ' c' + c + ' ' + nr + 'x' + nc + ' (max ' + this.maxRows + 'x' + this.maxCols + ')'); return new Range(this, r, c, nr, nc); }
    getLastRow() { for (let i = this.data.length - 1; i >= 0; i--) if ((this.data[i] || []).some(v => v !== '' && v !== undefined)) return i + 1; return 0; }
    getLastColumn() { let m = 0; this.data.forEach(r => { (r || []).forEach((v, j) => { if (v !== '' && v !== undefined) m = Math.max(m, j + 1); }); }); return m; }
    getMaxRows() { return this.maxRows; } getMaxColumns() { return this.maxCols; }
    insertRowsAfter(a, n) { this.maxRows += n; } insertColumnsAfter(a, n) { this.maxCols += n; }
    deleteRow(r) { this.data.splice(r - 1, 1); }
    setFrozenRows() { }
    protect() { const p = { setDescription() { return p; }, removeEditors() { return p; }, getEditors() { return []; }, canDomainEdit() { return false; }, setDomainEdit() { return p; } }; return p; }
  }
  class Spreadsheet {
    constructor(name) { this.id = id(); this.name = name; this.sheets = [new Sheet('Sheet1')]; }
    getId() { return this.id; } getName() { return this.name; } getUrl() { return 'https://sheets.test/' + this.id; }
    getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; }
    insertSheet(n) { const s = new Sheet(n); this.sheets.push(s); return s; }
    getSheets() { return this.sheets; } deleteSheet(s) { this.sheets = this.sheets.filter(x => x !== s); }
  }
  const spreadsheets = {};
  const SpreadsheetApp = {
    create(n) { const s = new Spreadsheet(n); spreadsheets[s.id] = s; return s; },
    openById(i) { if (!spreadsheets[i]) throw new Error('No spreadsheet ' + i); return spreadsheets[i]; }
  };

  // ---------- Drive
  const nodes = {};
  class Node {
    constructor(name, parent, kind, blob) { this.id = id(); this.name = name; this.parent = parent; this.kind = kind; this.blob = blob; this.trashed = false; this.children = []; nodes[this.id] = this; if (parent) parent.children.push(this); }
    getId() { return this.id; } getName() { return this.name; } setName(n) { this.name = n; return this; }
    isTrashed() { return this.trashed; } setTrashed(t) { this.trashed = t; return this; }
    setSharing() { return this; }
    getFoldersByName(n) { return iter(this.children.filter(c => c.kind === 'folder' && c.name === n && !c.trashed)); }
    getFolders() { return iter(this.children.filter(c => c.kind === 'folder' && !c.trashed)); }
    createFolder(n) { return new Node(n, this, 'folder'); }
    createFile(blob) { return new Node(blob.getName(), this, 'file', blob); }
    getBlob() { return this.blob; }
    makeCopy(n, folder) { return new Node(n, folder, 'file', this.blob); }
    getFiles() { return iter(this.children.filter(c => c.kind === 'file')); }
  }
  const iter = arr => { let i = 0; return { hasNext: () => i < arr.length, next: () => arr[i++] }; };
  const driveRoot = new Node('root', null, 'folder');
  const DriveApp = {
    Access: { PRIVATE: 'PRIVATE' }, Permission: { NONE: 'NONE' },
    getFoldersByName(n) { return driveRoot.getFoldersByName(n); },
    createFolder(n) { return driveRoot.createFolder(n); },
    getFolderById(i) { const n = nodes[i]; if (!n || n.kind !== 'folder') throw new Error('No folder ' + i); return n; },
    getFileById(i) { if (spreadsheets[i]) return { makeCopy: (n, f) => new Node(n, f, 'file', null) }; const n = nodes[i]; if (!n || n.kind !== 'file') throw new Error('No file ' + i); return n; }
  };

  // ---------- misc services
  const props = { getProperty: k => (k in state.props ? state.props[k] : null), setProperty: (k, v) => { state.props[k] = String(v); } };
  const cacheApi = {
    get: k => state.cache[k] === undefined ? null : state.cache[k], put: (k, v) => { state.cache[k] = String(v); },
    putAll: m => Object.assign(state.cache, m), getAll: ks => { const o = {}; ks.forEach(k => { if (state.cache[k] !== undefined) o[k] = state.cache[k]; }); return o; },
    remove: k => { delete state.cache[k]; }
  };
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  function formatDate(d, tz, fmt) {
    const t = new Date(d.getTime() + 3 * 3600 * 1000);
    const map = { yyyy: t.getUTCFullYear(), yy: pad(t.getUTCFullYear() % 100), MM: pad(t.getUTCMonth() + 1), dd: pad(t.getUTCDate()), HH: pad(t.getUTCHours()), mm: pad(t.getUTCMinutes()), ss: pad(t.getUTCSeconds()), u: t.getUTCDay() === 0 ? 7 : t.getUTCDay() };
    return fmt.replace(/'T'|yyyy|yy|MM|dd|HH|mm|ss|u/g, m => m === "'T'" ? 'T' : map[m]);
  }
  const bytesOf = b => Array.from(Buffer.isBuffer(b) ? b : Buffer.from(b));
  const Utilities = {
    formatDate, DigestAlgorithm: { SHA_256: 'sha256', MD5: 'md5' }, Charset: { UTF_8: 'utf8' },
    computeDigest: (alg, data) => bytesOf(crypto.createHash(alg).update(typeof data === 'string' ? data : Buffer.from(data.map(x => x & 0xff))).digest()).map(b => b > 127 ? b - 256 : b),
    base64Encode: b => Buffer.from(Array.isArray(b) ? b.map(x => x & 0xff) : b).toString('base64'),
    base64Decode: s => { if (/[^A-Za-z0-9+/=]/.test(s)) throw new Error('bad b64'); return bytesOf(Buffer.from(s, 'base64')).map(b => b > 127 ? b - 256 : b); },
    newBlob: (bytes, mime, name) => ({ bytes, mime, name, getName: () => name, getBytes: () => bytes, getAs: () => ({ getBytes: () => Buffer.from('%PDF-fake') }) })
  };
  const ctx = {
    console, Date, JSON, Math, Object, Array, String, Number, RegExp, Error, isFinite, parseInt, parseFloat,
    Utilities, SpreadsheetApp, DriveApp,
    PropertiesService: { getScriptProperties: () => props },
    CacheService: { getScriptCache: () => cacheApi },
    LockService: { getScriptLock: () => ({ waitLock() { }, releaseLock() { } }) },
    Session: { getActiveUser: () => ({ getEmail: () => state.active }), getEffectiveUser: () => ({ getEmail: () => state.effective }) },
    MailApp: { sendEmail: m => state.mails.push(m), getRemainingDailyQuota: () => 100 },
    ScriptApp: { getService: () => ({ getUrl: () => 'https://script.test/exec' }), getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ everyDays: () => ({ atHour: () => ({ create() { } }) }) }) }) },
    HtmlService: { createHtmlOutput: h => ({ html: h, setTitle() { return this; } }), createTemplateFromFile: () => ({ evaluate: () => ({ setTitle() { return this; }, addMetaTag() { return this; } }) }), createHtmlOutputFromFile: () => ({ getContent: () => '' }) }
  };
  vm.createContext(ctx);
  const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.gs')).sort();
  files.forEach(f => vm.runInContext(fs.readFileSync(path.join(srcDir, f), 'utf8'), ctx, { filename: f }));
  return { ctx, state, files, nodes, driveRoot, spreadsheets };
}
module.exports = { createEnv };
