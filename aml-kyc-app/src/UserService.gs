/** UserService.gs - user administration. */

function userList_(user) {
  requirePermission_(user, 'USER_MANAGE');
  return {
    users: dbAll_('Users').map(function (u) { return u; }),
    fields: clientFields_('User', user),
    privilegedRoles: PRIVILEGED_ROLES
  };
}

function activeRoleManagers_(excludeId, override) {
  return dbAll_('Users').filter(function (u) {
    if (u.UserID === excludeId) return false;
    return u.Status === 'Active' && rolePerm_(u.Role, 'ROLE_MANAGE') === true;
  }).length + (override ? 1 : 0);
}

function userSave_(user, p) {
  requirePermission_(user, 'USER_MANAGE');
  var existing = p.id ? dbGet_('Users', p.id) : null;
  if (p.id && !existing) fail_('User not found.', 'NOT_FOUND');
  var v = validateFields_(TABLES.Users.fields, p, { create: !existing, user: user });
  var newRole = v.Role !== undefined ? v.Role : existing.Role;
  var oldRole = existing ? existing.Role : null;
  // Privileged roles: only ROLE_MANAGE holders may grant them or change users who hold them.
  if ((PRIVILEGED_ROLES.indexOf(newRole) >= 0 || (oldRole && PRIVILEGED_ROLES.indexOf(oldRole) >= 0)) && !hasPermission_(user, 'ROLE_MANAGE')) {
    fail_('You do not have permission to perform this action.', 'FORBIDDEN');
  }
  if (existing && existing.UserID === user.UserID && ((v.Role && v.Role !== existing.Role) || (v.Status && v.Status !== existing.Status))) {
    fail_('You cannot change your own role or status.');
  }
  if (v.Email) {
    var dup = dbAll_('Users').filter(function (u) { return normEmail_(u.Email) === v.Email && (!existing || u.UserID !== existing.UserID); })[0];
    if (dup) fail_('A user with this email already exists.');
  }
  if (existing) {
    var after = {};
    Object.keys(existing).forEach(function (k) { after[k] = v[k] !== undefined ? v[k] : existing[k]; });
    var stillManager = after.Status === 'Active' && rolePerm_(after.Role, 'ROLE_MANAGE') === true;
    if (!stillManager && activeRoleManagers_(existing.UserID) < 1) fail_('At least one active user must retain role-management rights.');
    var d = diff_(existing, after, ['Name', 'Email', 'Role', 'Department', 'Status', 'Notes']);
    if (!d.changed) return { user: existing };
    v.UpdatedBy = user.Email; v.UpdatedAt = nowIso_();
    var rec = dbUpdate_('Users', existing.UserID, v);
    audit_(user, d.neu.Role !== undefined ? 'Role Changed' : 'User Updated', { recordType: 'User', recordId: rec.UserID, oldValue: d.old, newValue: d.neu });
    CacheService.getScriptCache().remove('login:' + normEmail_(rec.Email));
    return { user: rec };
  }
  v.DateAdded = nowIso_(); v.AddedBy = user.Email; v.UpdatedBy = user.Email; v.UpdatedAt = v.DateAdded;
  var created = dbInsert_('Users', v);
  audit_(user, 'User Created', { recordType: 'User', recordId: created.UserID, newValue: { Name: created.Name, Email: created.Email, Role: created.Role, Status: created.Status } });
  return { user: created };
}
