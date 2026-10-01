/** SettingsService.gs - configurable parameters stored in the Settings sheet. */

function allSettings_() {
  var key = 'settings';
  if (_memo[key]) return _memo[key];
  var m = {};
  dbAll_('Settings').forEach(function (r) { m[r.Key] = jsonParse_(r.Value, undefined); });
  _memo[key] = m;
  return m;
}

function getSetting_(key) {
  var s = allSettings_();
  if (s[key] !== undefined) return s[key];
  return DEFAULT_SETTINGS[key] ? DEFAULT_SETTINGS[key].v : undefined;
}

function getRolePermissions_() { return getSetting_('ROLE_PERMISSIONS') || DEFAULT_ROLE_PERMISSIONS; }
function docTypes_() { return getSetting_('DOC_TYPES') || DEFAULT_DOC_TYPES; }
function docTypeDef_(type) { return docTypes_().filter(function (d) { return d.type === type; })[0]; }

function settingValidators_() {
  function arrStr(v) { if (!Array.isArray(v) || !v.every(function (x) { return typeof x === 'string' && x.length && x.length < 100; })) fail_('Must be a JSON array of non-empty strings.'); }
  function posInt(v) { if (typeof v !== 'number' || v < 0 || v % 1) fail_('Must be a non-negative integer.'); }
  return {
    ENGAGEMENT_TYPES: arrStr, LEGAL_FORMS: arrStr, HIGH_RISK_JURISDICTIONS: function (v) { if (!Array.isArray(v)) fail_('Must be a JSON array.'); },
    DOC_TYPES: function (v) {
      if (!Array.isArray(v) || !v.length) fail_('Must be a non-empty array.');
      v.forEach(function (d) {
        if (!d.type || !d.category || DOC_FOLDERS.indexOf(d.folder) < 0) fail_('Each document type needs type, category and a valid folder (' + DOC_FOLDERS.join(', ') + ').');
      });
    },
    REQUIRED_DOCS: function (v) {
      if (!Array.isArray(v)) fail_('Must be an array.');
      var types = docTypes_().map(function (d) { return d.type; });
      v.forEach(function (r) {
        if (!r.id || !r.label || !Array.isArray(r.types) || ['always', 'parentCR', 'perUBO'].indexOf(r.when) < 0) fail_('Each requirement needs id, label, types[] and when (always|parentCR|perUBO).');
        r.types.forEach(function (t) { if (types.indexOf(t) < 0) fail_('Unknown document type: ' + t); });
      });
    },
    CHECKLIST_ITEMS: function (v) {
      if (!Array.isArray(v) || !v.length) fail_('Must be a non-empty array.');
      var ids = {};
      v.forEach(function (i) { if (!/^[a-z0-9_]{1,30}$/.test(i.id || '') || !i.label || ids[i.id]) fail_('Each item needs a unique id (a-z0-9_) and label.'); ids[i.id] = 1; });
    },
    REVIEW_FREQUENCY_MONTHS: function (v) { RISK_LEVELS.forEach(function (l) { if (!(v[l] > 0 && v[l] <= 120)) fail_('Provide 1-120 months for ' + l + '.'); }); },
    KYC_DUE_WINDOW_DAYS: posInt,
    EXPIRY_WARNING_DAYS: function (v) { if (!Array.isArray(v) || !v.length || !v.every(function (x) { return typeof x === 'number' && x > 0; })) fail_('Must be an array of positive numbers.'); },
    APPROVAL_REQUIREMENTS: function (v) { if (typeof v !== 'object' || Array.isArray(v)) fail_('Must be an object.'); },
    RISK_CONFIG: function (v) {
      if (!v || !Array.isArray(v.factors) || !v.factors.length || !v.thresholds) fail_('Risk config needs factors[] and thresholds.');
      if (!(v.thresholds.mediumFrom >= 0 && v.thresholds.highFrom > v.thresholds.mediumFrom && v.thresholds.highFrom <= 100)) fail_('Thresholds must satisfy 0 <= mediumFrom < highFrom <= 100.');
      var ids = {};
      v.factors.forEach(function (f) {
        if (!f.id || !f.label || ids[f.id] || !(f.weight > 0) || !Array.isArray(f.options) || f.options.length < 2) fail_('Factor "' + f.id + '" is invalid (unique id, label, weight > 0, 2+ options).');
        ids[f.id] = 1;
        f.options.forEach(function (o) { if (!o.v || typeof o.s !== 'number' || o.s < 0) fail_('Factor "' + f.id + '" has an invalid option.'); });
      });
    },
    FILE_RULES: function (v) {
      if (!(v.maxMB > 0 && v.maxMB <= 25)) fail_('maxMB must be between 1 and 25.');
      if (!Array.isArray(v.allowedExt) || !v.allowedExt.length) fail_('allowedExt must be a non-empty array.');
      var bad = v.allowedExt.filter(function (e) { return ['exe', 'js', 'bat', 'cmd', 'sh', 'html', 'htm', 'svg', 'vbs', 'msi', 'jar', 'ps1', 'scr'].indexOf(String(e).toLowerCase()) >= 0; });
      if (bad.length) fail_('Executable/active content types are not allowed: ' + bad.join(', '));
    },
    ACCESS: function (v) { if (typeof v !== 'object' || !(v.uboThresholdPercent > 0 && v.uboThresholdPercent <= 100)) fail_('Invalid ACCESS settings.'); },
    NOTIFICATIONS: function (v) { if (typeof v !== 'object' || typeof v.enabled !== 'boolean') fail_('Invalid NOTIFICATIONS settings.'); },
    ROLE_PERMISSIONS: function (v) {
      BUILTIN_ROLES.forEach(function (r) { if (!v[r]) fail_('Built-in role missing: ' + r); });
      Object.keys(v).forEach(function (r) {
        Object.keys(v[r]).forEach(function (p) {
          if (PERMISSIONS.indexOf(p) < 0) fail_('Unknown permission: ' + p);
          if (v[r][p] !== true && v[r][p] !== 'own') fail_('Permission values must be true or "own".');
        });
      });
      if (!v.MLRO.ROLE_MANAGE || !v.MLRO.SETTINGS_AML || !v.MLRO.USER_MANAGE) fail_('The MLRO role must retain ROLE_MANAGE, SETTINGS_AML and USER_MANAGE.');
    },
    BACKUP_RETENTION_DAYS: posInt
  };
}

function settingsForClient_(user) {
  var out = [];
  Object.keys(DEFAULT_SETTINGS).forEach(function (k) {
    var need = SETTING_PERMS[k];
    if (!hasPermission_(user, need) && !hasPermission_(user, 'SETTINGS_AML') && !hasPermission_(user, 'SETTINGS_SYSTEM')) return;
    out.push({ key: k, description: DEFAULT_SETTINGS[k].d, value: getSetting_(k), editable: hasPermission_(user, need), permission: need });
  });
  return out;
}

function settingSave_(user, p) {
  var key = String(p.key || ''), def = DEFAULT_SETTINGS[key];
  if (!def) fail_('Unknown setting.');
  requirePermission_(user, SETTING_PERMS[key]);
  var value = p.reset ? def.v : p.value;
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch (e) { fail_('Value is not valid JSON.'); } }
  settingValidators_()[key](value);
  var old = getSetting_(key);
  var existing = dbGet_('Settings', key);
  var rec = { Key: key, Value: JSON.stringify(value), Description: def.d, UpdatedBy: user.Email, UpdatedAt: nowIso_() };
  if (existing) dbUpdate_('Settings', key, rec); else dbInsert_('Settings', rec);
  delete _memo.settings;
  audit_(user, 'Setting Changed', { recordType: 'Setting', recordId: key, oldValue: old, newValue: value, comments: p.reset ? 'Reset to default' : '' });
  return { key: key, value: value };
}
