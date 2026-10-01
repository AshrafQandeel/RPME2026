/** DriveManager.gs - Google Drive repository. Folder IDs never leave the server. */

function driveFolder_(propKey, label) {
  var id = PropertiesService.getScriptProperties().getProperty(propKey);
  if (!id) fail_('Google Drive folder could not be found (' + label + '). Run setupAMLSystem().', 'NOT_SETUP');
  try { return DriveApp.getFolderById(id); } catch (e) { logError_(null, 'driveFolder ' + label, e); fail_('Google Drive folder could not be found (' + label + ').', 'DRIVE'); }
}
function ensureChildFolder_(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}
function ensurePrivate_(folder) {
  try { folder.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE); } catch (e) { /* domain policy may forbid; ignore */ }
}

/** Creates (or reuses) AML_KYC_SYSTEM/, Companies/ and System Documents/. Idempotent. */
function driveSetup_() {
  var props = PropertiesService.getScriptProperties(), root = null, id = props.getProperty(PROP.ROOT_ID);
  if (id) { try { root = DriveApp.getFolderById(id); } catch (e) { root = null; } }
  if (!root) { var it = DriveApp.getFoldersByName(APP.ROOT_FOLDER_NAME); root = it.hasNext() ? it.next() : DriveApp.createFolder(APP.ROOT_FOLDER_NAME); }
  var companies = ensureChildFolder_(root, 'Companies'), sys = ensureChildFolder_(root, 'System Documents');
  ensureChildFolder_(sys, 'Backups');
  [root, companies, sys].forEach(ensurePrivate_);
  props.setProperty(PROP.ROOT_ID, root.getId());
  props.setProperty(PROP.COMPANIES_ID, companies.getId());
  props.setProperty(PROP.SYSDOCS_ID, sys.getId());
  return root;
}

/**
 * Returns the company's folder, creating it with all subfolders if needed. Never creates a duplicate:
 * reuses the stored folder ID, then any existing folder named "<CompanyID>_*".
 */
function ensureCompanyFolder_(companyId, legalName, storedFolderId) {
  var folder = null;
  if (storedFolderId) { try { folder = DriveApp.getFolderById(storedFolderId); if (folder.isTrashed()) folder = null; } catch (e) { folder = null; } }
  var parent = driveFolder_(PROP.COMPANIES_ID, 'Companies');
  if (!folder) {
    var it = parent.getFolders();
    while (it.hasNext()) { var f = it.next(); if (f.getName().indexOf(companyId + '_') === 0) { folder = f; break; } }
  }
  if (!folder) folder = parent.createFolder(companyId + '_' + sanitizeFolderName_(legalName));
  DOC_FOLDERS.forEach(function (n) { ensureChildFolder_(folder, n); });
  ensurePrivate_(folder);
  return folder;
}

function renameCompanyFolder_(folderId, companyId, legalName) {
  try { DriveApp.getFolderById(folderId).setName(companyId + '_' + sanitizeFolderName_(legalName)); } catch (e) { logError_(null, 'renameFolder', e); }
}

function backupDatabase_(user) {
  requirePermission_(user, 'BACKUP');
  var stamp = Utilities.formatDate(new Date(), APP.TZ, 'yyyy-MM-dd_HHmm');
  var name = APP.DB_NAME + '_Backup_' + stamp;
  var sys = driveFolder_(PROP.SYSDOCS_ID, 'System Documents');
  var backups = ensureChildFolder_(sys, 'Backups');
  DriveApp.getFileById(PropertiesService.getScriptProperties().getProperty(PROP.DB_ID)).makeCopy(name, backups);
  audit_(user, 'Database Backup', { recordType: 'Backup', recordId: name, comments: 'Retention: ' + (getSetting_('BACKUP_RETENTION_DAYS') || 0) + ' days (0 = keep forever; never auto-deleted)' });
  return { name: name };
}
