/** DocumentService.gs - uploads, versioning, status, access and deletion of compliance documents. */

var MIME_BY_EXT = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv: 'text/csv', txt: 'text/plain', tif: 'image/tiff', tiff: 'image/tiff'
};
var MAGIC = {
  pdf: [[0x25, 0x50, 0x44, 0x46]], png: [[0x89, 0x50, 0x4E, 0x47]], jpg: [[0xFF, 0xD8, 0xFF]], jpeg: [[0xFF, 0xD8, 0xFF]],
  docx: [[0x50, 0x4B]], xlsx: [[0x50, 0x4B]], doc: [[0xD0, 0xCF, 0x11, 0xE0]], xls: [[0xD0, 0xCF, 0x11, 0xE0]]
};

function effStatus_(d, today) {
  if (d.VersionStatus === 'Current' && d.ExpiryDate && d.ExpiryDate < today && ['Rejected', 'Superseded', 'Expired'].indexOf(d.Status) < 0) return 'Expired';
  return d.Status;
}
function docOut_(user, d, company, today) {
  var o = outRecord_(user, 'Document', d);
  o.EffStatus = effStatus_(d, today);
  o.DaysToExpiry = d.ExpiryDate ? daysBetween_(today, d.ExpiryDate) : null;
  o._perm = {
    del: hasPermission_(user, 'DOC_DELETE', d) && !editBlockReason_(user, company),
    status: hasPermission_(user, 'DOC_STATUS') && d.VersionStatus === 'Current',
    replace: hasPermission_(user, 'DOC_UPLOAD') && d.VersionStatus === 'Current'
  };
  return o;
}

/** Evaluates configured mandatory documents. Returns [{id,label,met}]. */
function requirementStatus_(company, docs, ubos) {
  var today = todayStr_();
  var cur = docs.filter(function (d) {
    return !isDeleted_(d) && d.VersionStatus === 'Current' && ['Rejected', 'Replacement Required'].indexOf(d.Status) < 0 && effStatus_(d, today) !== 'Expired';
  });
  var out = [];
  (getSetting_('REQUIRED_DOCS') || []).forEach(function (r) {
    if (r.when === 'parentCR' && !company.ParentCompanyCR) return;
    if (r.when === 'perUBO') {
      ubos.forEach(function (u) {
        out.push({ id: r.id + ':' + u.UBOID, label: r.label.replace(/ per UBO$/, '') + ' - ' + u.FullName,
          met: cur.some(function (d) { return r.types.indexOf(d.DocType) >= 0 && d.Subject === u.UBOID; }) });
      });
      return;
    }
    out.push({ id: r.id, label: r.label, met: cur.some(function (d) { return r.types.indexOf(d.DocType) >= 0; }) });
  });
  return out;
}

function docList_(user, p) {
  var company = requireCompany_(user, p.companyId);
  requirePermission_(user, 'DOC_VIEW');
  var today = todayStr_();
  var docs = dbWhere_('Documents', function (d) { return d.CompanyID === company.CompanyID && !isDeleted_(d); });
  var ubos = dbWhere_('UBOs', function (u) { return u.CompanyID === company.CompanyID && !isDeleted_(u); });
  var engs = dbWhere_('Engagements', function (e) { return e.CompanyID === company.CompanyID && !isDeleted_(e); });
  docs.sort(function (a, b) { return a.DocType < b.DocType ? -1 : a.DocType > b.DocType ? 1 : (b.VersionNo - a.VersionNo); });
  return {
    documents: docs.map(function (d) { return docOut_(user, d, company, today); }),
    requirements: requirementStatus_(company, docs, ubos),
    docTypes: docTypes_(), statuses: DOC_STATUSES,
    subjects: ubos.map(function (u) { return { id: u.UBOID, label: 'UBO: ' + u.FullName }; })
      .concat(engs.map(function (e) { return { id: e.EngagementID, label: 'Engagement: ' + e.EngagementType + ' (' + e.EngagementID + ')' }; })),
    canUpload: hasPermission_(user, 'DOC_UPLOAD'),
    fileRules: getSetting_('FILE_RULES')
  };
}

function validateUpload_(p) {
  var rules = getSetting_('FILE_RULES'), name = sanitizeFileName_(p.fileName);
  var m = /\.([A-Za-z0-9]{1,5})$/.exec(name), ext = m ? m[1].toLowerCase() : '';
  if (!ext || rules.allowedExt.map(function (e) { return String(e).toLowerCase(); }).indexOf(ext) < 0) fail_('File type not supported. Allowed: ' + rules.allowedExt.join(', ') + '.', 'FILE_TYPE');
  var maxBytes = Math.min(rules.maxMB, 25) * 1024 * 1024;
  var b64 = String(p.base64 || '').replace(/^data:[^,]*,/, '');
  if (!b64) fail_('No file content received.', 'UPLOAD');
  if (b64.length > maxBytes * 1.4 + 100) fail_('File size exceeds allowed limit (' + rules.maxMB + ' MB).', 'FILE_SIZE');
  var bytes;
  try { bytes = Utilities.base64Decode(b64); } catch (e) { fail_('Document upload failed.', 'UPLOAD'); }
  if (!bytes.length) fail_('The file is empty.', 'UPLOAD');
  if (bytes.length > maxBytes) fail_('File size exceeds allowed limit (' + rules.maxMB + ' MB).', 'FILE_SIZE');
  var sigs = MAGIC[ext];
  if (sigs && !sigs.some(function (s) { return s.every(function (b, i) { return (bytes[i] & 0xff) === b; }); })) fail_('File type not supported: content does not match the .' + ext + ' extension.', 'FILE_TYPE');
  return { name: name, ext: ext, bytes: bytes, mime: MIME_BY_EXT[ext] || 'application/octet-stream' };
}

function docUpload_(user, p) {
  requirePermission_(user, 'DOC_UPLOAD');
  var company = requireCompany_(user, p.companyId);
  var def = docTypeDef_(String(p.docType || ''));
  if (!def) fail_('Select a valid document type.', 'VALIDATION');
  var expiry = String(p.expiryDate || '').trim();
  if (expiry && !isValidDate_(expiry)) fail_('Expiry date must be a valid date (YYYY-MM-DD).', 'VALIDATION');
  var remarks = clip_(p.remarks, 1000), subject = clip_(String(p.subject || '').trim(), 120);
  var file = validateUpload_(p);
  var all = dbWhere_('Documents', function (d) { return d.CompanyID === company.CompanyID && !isDeleted_(d); });
  if (/^UBO-\d+$/.test(subject) && !dbWhere_('UBOs', function (u) { return u.UBOID === subject && u.CompanyID === company.CompanyID && !isDeleted_(u); }).length) fail_('Invalid subject.', 'VALIDATION');
  if (/^ENG-\d+$/.test(subject) && !dbWhere_('Engagements', function (e) { return e.EngagementID === subject && e.CompanyID === company.CompanyID && !isDeleted_(e); }).length) fail_('Invalid subject.', 'VALIDATION');

  // Determine which current documents this upload supersedes.
  var superseded = [];
  if (p.replacesDocId) {
    var old = all.filter(function (d) { return d.DocumentID === p.replacesDocId; })[0];
    if (!old || old.VersionStatus !== 'Current') fail_('The document to replace was not found or is not current.', 'VALIDATION');
    if (old.DocType !== def.type) fail_('A replacement must have the same document type.', 'VALIDATION');
    superseded = [old]; subject = subject || old.Subject;
  } else {
    superseded = all.filter(function (d) {
      return d.DocType === def.type && d.VersionStatus === 'Current' && (!def.multi || (subject && d.Subject === subject));
    });
  }
  var version = all.filter(function (d) { return d.DocType === def.type && d.Subject === subject; })
    .reduce(function (m, d) { return Math.max(m, d.VersionNo || 0); }, 0) + 1;

  var docId = nextId_('Documents'), fileObj, folder;
  try {
    var cf = ensureCompanyFolder_(company.CompanyID, company.LegalName, company.FolderID);
    folder = ensureChildFolder_(cf, def.folder);
    fileObj = folder.createFile(Utilities.newBlob(file.bytes, file.mime, docId + '_' + file.name));
  } catch (e) { logError_(user, 'docUpload drive', e); fail_('Document upload failed.', 'UPLOAD'); }

  var rec;
  try {
    rec = dbInsert_('Documents', {
      DocumentID: docId, CompanyID: company.CompanyID, DocType: def.type, Category: def.category, FileName: file.name,
      DriveFileID: fileObj.getId(), FolderID: folder.getId(), UploadedBy: user.Email, UploadDate: nowIso_(), ExpiryDate: expiry,
      Status: 'Uploaded', VersionNo: version, VersionStatus: 'Current', SupersededByID: '', Subject: subject, Remarks: remarks,
      MimeType: file.mime, SizeBytes: file.bytes.length,
      Checksum: Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, file.bytes).map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join(''),
      IsDeleted: '', CreatedBy: user.Email, CreatedAt: nowIso_(), UpdatedBy: user.Email, UpdatedAt: nowIso_()
    });
    superseded.forEach(function (d) {
      dbUpdate_('Documents', d.DocumentID, { VersionStatus: 'Superseded', SupersededByID: docId, UpdatedBy: user.Email, UpdatedAt: nowIso_() });
    });
  } catch (e) {
    try { fileObj.setTrashed(true); } catch (x) { }
    logError_(user, 'docUpload db', e);
    fail_('Database update failed. The file was not saved.', 'DB');
  }
  audit_(user, superseded.length ? 'Document Replaced' : 'Document Uploaded', {
    companyId: company.CompanyID, recordType: 'Document', recordId: docId,
    oldValue: superseded.length ? { Superseded: superseded.map(function (d) { return d.DocumentID + ' (' + d.FileName + ')'; }) } : '',
    newValue: { DocType: def.type, FileName: file.name, Version: version, ExpiryDate: expiry, Subject: subject }
  });
  var warnings = [];
  if (def.expires && !expiry) warnings.push('No expiry date was recorded for a document type that normally expires.');
  if (expiry && expiry < todayStr_()) warnings.push('The expiry date is in the past - the document will show as Expired.');
  return { document: docOut_(user, rec, company, todayStr_()), warnings: warnings };
}

function loadDoc_(user, docId) {
  var d = dbGet_('Documents', String(docId || ''));
  if (!d || isDeleted_(d)) fail_('Document not found.', 'NOT_FOUND');
  var company = requireCompany_(user, d.CompanyID, true);
  return { doc: d, company: company };
}

/** Returns file content (base64) after server-side authorisation; Drive IDs are never sent to the browser. */
function docAccess_(user, p) {
  requirePermission_(user, 'DOC_VIEW');
  var x = loadDoc_(user, p.docId);
  if (x.doc.SizeBytes > 25 * 1024 * 1024) fail_('File is too large to open in the browser.');
  var blob;
  try { blob = DriveApp.getFileById(x.doc.DriveFileID).getBlob(); } catch (e) { logError_(user, 'docAccess', e); fail_('The file could not be retrieved from Google Drive.', 'DRIVE'); }
  audit_(user, p.mode === 'download' ? 'Document Downloaded' : 'Document Viewed', { companyId: x.doc.CompanyID, recordType: 'Document', recordId: x.doc.DocumentID, comments: x.doc.FileName });
  return { name: x.doc.FileName, mimeType: x.doc.MimeType, base64: Utilities.base64Encode(blob.getBytes()) };
}

function docSetStatus_(user, p) {
  requirePermission_(user, 'DOC_STATUS');
  var x = loadDoc_(user, p.docId), status = String(p.status || '');
  if (DOC_STATUSES.indexOf(status) < 0) fail_('Invalid document status.', 'VALIDATION');
  if (x.doc.VersionStatus !== 'Current') fail_('Only the current version of a document can change status.');
  if (['Rejected', 'Replacement Required'].indexOf(status) >= 0 && !String(p.remarks || '').trim()) fail_('Remarks are required when rejecting a document or requesting a replacement.', 'VALIDATION');
  var patch = { Status: status, StatusChangedBy: user.Email, StatusChangedAt: nowIso_(), UpdatedBy: user.Email, UpdatedAt: nowIso_() };
  if (p.remarks) patch.Remarks = clip_(p.remarks, 1000);
  var rec = dbUpdate_('Documents', x.doc.DocumentID, patch);
  audit_(user, 'Document Status Changed', { companyId: x.doc.CompanyID, recordType: 'Document', recordId: x.doc.DocumentID, oldValue: { Status: x.doc.Status }, newValue: { Status: status }, comments: p.remarks || '' });
  return { document: docOut_(user, rec, x.company, todayStr_()) };
}

function docDelete_(user, p) {
  var x = loadDoc_(user, p.docId);
  requirePermission_(user, 'DOC_DELETE', x.doc);
  assertEditable_(user, x.company);
  if (!String(p.reason || '').trim()) fail_('A reason is required to delete a document.', 'VALIDATION');
  dbUpdate_('Documents', x.doc.DocumentID, { IsDeleted: 'Y', DeletedBy: user.Email, DeletedAt: nowIso_(), UpdatedBy: user.Email, UpdatedAt: nowIso_() });
  var restored = '';
  if (x.doc.VersionStatus === 'Current') {
    var prev = dbWhere_('Documents', function (d) { return d.SupersededByID === x.doc.DocumentID && !isDeleted_(d); })
      .sort(function (a, b) { return b.VersionNo - a.VersionNo; })[0];
    if (prev) { dbUpdate_('Documents', prev.DocumentID, { VersionStatus: 'Current', SupersededByID: '', UpdatedBy: user.Email, UpdatedAt: nowIso_() }); restored = prev.DocumentID; }
  }
  // The Drive file is deliberately retained (record-keeping); only the register entry is removed from active views.
  audit_(user, 'Document Deleted', { companyId: x.doc.CompanyID, recordType: 'Document', recordId: x.doc.DocumentID,
    oldValue: { FileName: x.doc.FileName, DocType: x.doc.DocType, Version: x.doc.VersionNo }, comments: String(p.reason) + (restored ? ' | Restored previous version ' + restored : '') });
  return { deleted: x.doc.DocumentID, restored: restored };
}

/** Documents register across companies the user can access (Documents page / expiry monitor). */
function docListAll_(user, f) {
  requirePermission_(user, 'DOC_VIEW');
  f = f || {};
  var today = todayStr_(), q = String(f.q || '').toLowerCase();
  var companies = {}; visibleCompanies_(user).forEach(function (c) { companies[c.CompanyID] = c; });
  var rows = [];
  dbAll_('Documents').forEach(function (d) {
    if (isDeleted_(d) || !companies[d.CompanyID]) return;
    if (!f.includeHistory && d.VersionStatus !== 'Current') return;
    var eff = effStatus_(d, today);
    if (f.status && eff !== f.status) return;
    if (f.docType && d.DocType !== f.docType) return;
    if (f.expiryFrom && (!d.ExpiryDate || d.ExpiryDate < f.expiryFrom)) return;
    if (f.expiryTo && (!d.ExpiryDate || d.ExpiryDate > f.expiryTo)) return;
    if (f.withinDays !== undefined && f.withinDays !== '' && f.withinDays !== null) {
      if (!d.ExpiryDate || daysBetween_(today, d.ExpiryDate) > Number(f.withinDays)) return;
    }
    if (q && (d.FileName + ' ' + d.DocType + ' ' + companies[d.CompanyID].LegalName + ' ' + d.CompanyID).toLowerCase().indexOf(q) < 0) return;
    var o = outRecord_(user, 'Document', d);
    o.EffStatus = eff; o.DaysToExpiry = d.ExpiryDate ? daysBetween_(today, d.ExpiryDate) : null; o.CompanyName = companies[d.CompanyID].LegalName;
    rows.push(o);
  });
  rows.sort(function (a, b) { return (a.ExpiryDate || '9999') < (b.ExpiryDate || '9999') ? -1 : 1; });
  return { total: rows.length, rows: rows.slice(0, 500), docTypes: docTypes_().map(function (d) { return d.type; }), statuses: DOC_STATUSES.concat(['Superseded']) };
}
