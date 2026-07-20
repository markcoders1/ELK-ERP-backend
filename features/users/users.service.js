const crypto = require('crypto');
const bcrypt = require('bcrypt');
const User = require('./user.model');
const AuditLog = require('../hardware-approvals/auditLog.model');
const AppError = require('../../utils/AppError');
const {
  HTTP_STATUS,
  ROLES,
  USER_SORT_FIELDS,
  ENTITY_TYPES,
  USER_AUDIT_ACTIONS,
} = require('../../config/constants');
const { parsePagination, buildPaginationMeta } = require('../../shared/pagination');
const { escapeRegex } = require('../../shared/escapeRegex');

const SALT_ROUNDS = 12;
const TEMP_PASSWORD_LENGTH = 12;

const toAuditSnapshot = (user) => ({
  id: user._id?.toString?.() || user.id,
  firstName: user.firstName || '',
  lastName: user.lastName || '',
  name: user.name,
  email: user.email,
  phone: user.phone || '',
  role: user.role,
  isActive: user.isActive,
});

const writeUserAudit = async ({
  action,
  actorId,
  targetUser,
  snapshotBefore = null,
  snapshotAfter = null,
  changedFields = [],
  reason = null,
}) => {
  await AuditLog.create({
    entityType: ENTITY_TYPES.USER,
    changeRequestId: null,
    hardwareId: null,
    targetUserId: targetUser._id || targetUser.id,
    stockCode: null,
    action,
    decision: null,
    changedFields,
    submittedBy: actorId,
    decidedBy: actorId,
    reason,
    snapshotBefore,
    snapshotAfter,
  });
};

const buildListFilter = (query) => {
  const filter = {};

  // Inactive users hidden by default. Explicit isActive wins; showInactive=true includes all.
  if (query.isActive === 'true' || query.isActive === 'false') {
    filter.isActive = query.isActive === 'true';
  } else if (query.showInactive !== 'true') {
    filter.isActive = true;
  }

  if (query.role) {
    filter.role = query.role;
  }

  if (query.search) {
    const term = escapeRegex(query.search.trim());
    const regex = new RegExp(term, 'i');
    filter.$or = [
      { firstName: regex },
      { lastName: regex },
      { name: regex },
      { email: regex },
    ];
  }

  return filter;
};

const buildSort = (query) => {
  const sortBy = USER_SORT_FIELDS.includes(query.sortBy) ? query.sortBy : 'name';
  const sortOrder = query.sortOrder === 'desc' ? -1 : 1;

  return { [sortBy]: sortOrder };
};

const findAll = async (query) => {
  const { page, limit, skip } = parsePagination(query);
  const filter = buildListFilter(query);
  const sort = buildSort(query);

  const [items, total] = await Promise.all([
    User.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    User.countDocuments(filter),
  ]);

  return {
    items: items.map(User.toSafeObjectFromLean),
    pagination: buildPaginationMeta({ page, limit, total }),
  };
};

const findById = async (id) => {
  const user = await User.findById(id).lean();

  if (!user) {
    throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);
  }

  return User.toSafeObjectFromLean(user);
};

const create = async (payload, actorId) => {
  const email = payload.email.trim().toLowerCase();
  const firstName = payload.firstName.trim();
  const lastName = payload.lastName.trim();
  const name = User.buildDisplayName(firstName, lastName);

  const existing = await User.findOne({ email }).lean();

  if (existing) {
    throw new AppError('Email is already registered', HTTP_STATUS.CONFLICT);
  }

  const hashedPassword = await bcrypt.hash(payload.password, SALT_ROUNDS);

  try {
    const user = await User.create({
      firstName,
      lastName,
      name,
      email,
      phone: payload.phone?.trim() || '',
      password: hashedPassword,
      role: payload.role,
      isActive: payload.isActive ?? true,
      createdBy: actorId,
    });

    const safe = user.toSafeObject();

    await writeUserAudit({
      action: USER_AUDIT_ACTIONS.USER_CREATED,
      actorId,
      targetUser: user,
      snapshotBefore: null,
      snapshotAfter: toAuditSnapshot(user),
      changedFields: ['firstName', 'lastName', 'email', 'phone', 'role', 'isActive'],
    });

    return safe;
  } catch (error) {
    if (error.code === 11000) {
      throw new AppError('Email is already registered', HTTP_STATUS.CONFLICT);
    }
    throw error;
  }
};

const assertNotSelfRoleChange = (targetId, actorId, nextRole, currentRole) => {
  if (String(targetId) === String(actorId) && nextRole !== undefined && nextRole !== currentRole) {
    throw new AppError('You cannot change your own role', HTTP_STATUS.BAD_REQUEST);
  }
};

const assertNotSelfDeactivate = (targetId, actorId, nextIsActive) => {
  if (String(targetId) === String(actorId) && nextIsActive === false) {
    throw new AppError('You cannot deactivate your own account', HTTP_STATUS.BAD_REQUEST);
  }
};

const assertNotLastAdministrator = async (user, nextRole, nextIsActive) => {
  const isCurrentlyAdmin = user.role === ROLES.ADMINISTRATOR && user.isActive;
  if (!isCurrentlyAdmin) return;

  const demotingRole = nextRole !== undefined && nextRole !== ROLES.ADMINISTRATOR;
  const deactivating = nextIsActive === false;

  if (!demotingRole && !deactivating) return;

  const activeAdminCount = await User.countDocuments({
    role: ROLES.ADMINISTRATOR,
    isActive: true,
  });

  if (activeAdminCount <= 1) {
    throw new AppError(
      'Cannot deactivate or demote the last active Administrator',
      HTTP_STATUS.BAD_REQUEST
    );
  }
};

const update = async (id, payload, actorId) => {
  const user = await User.findById(id);

  if (!user) {
    throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);
  }

  assertNotSelfRoleChange(id, actorId, payload.role, user.role);
  assertNotSelfDeactivate(id, actorId, payload.isActive);
  await assertNotLastAdministrator(user, payload.role, payload.isActive);

  const before = toAuditSnapshot(user);
  const changedFields = [];

  if (payload.firstName !== undefined) {
    user.firstName = payload.firstName.trim();
    changedFields.push('firstName');
  }

  if (payload.lastName !== undefined) {
    user.lastName = payload.lastName.trim();
    changedFields.push('lastName');
  }

  if (payload.firstName !== undefined || payload.lastName !== undefined) {
    user.name = User.buildDisplayName(user.firstName, user.lastName, user.name);
    if (!changedFields.includes('name')) {
      changedFields.push('name');
    }
  }

  if (payload.phone !== undefined) {
    user.phone = payload.phone?.trim() || '';
    changedFields.push('phone');
  }

  const previousRole = user.role;
  if (payload.role !== undefined && payload.role !== user.role) {
    user.role = payload.role;
    changedFields.push('role');
  }

  const previousActive = user.isActive;
  if (payload.isActive !== undefined && payload.isActive !== user.isActive) {
    user.isActive = payload.isActive;
    changedFields.push('isActive');
  }

  if (changedFields.length === 0) {
    return user.toSafeObject();
  }

  await user.save();

  const after = toAuditSnapshot(user);

  if (previousRole !== user.role) {
    await writeUserAudit({
      action: USER_AUDIT_ACTIONS.ROLE_CHANGED,
      actorId,
      targetUser: user,
      snapshotBefore: before,
      snapshotAfter: after,
      changedFields: ['role'],
    });
  }

  if (previousActive !== user.isActive) {
    await writeUserAudit({
      action: user.isActive
        ? USER_AUDIT_ACTIONS.USER_ACTIVATED
        : USER_AUDIT_ACTIONS.USER_DEACTIVATED,
      actorId,
      targetUser: user,
      snapshotBefore: before,
      snapshotAfter: after,
      changedFields: ['isActive'],
    });
  }

  const profileFields = changedFields.filter(
    (field) => field !== 'role' && field !== 'isActive'
  );

  if (profileFields.length > 0) {
    await writeUserAudit({
      action: USER_AUDIT_ACTIONS.USER_UPDATED,
      actorId,
      targetUser: user,
      snapshotBefore: before,
      snapshotAfter: after,
      changedFields: profileFields,
    });
  }

  return user.toSafeObject();
};

const generateTemporaryPassword = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$';
  const bytes = crypto.randomBytes(TEMP_PASSWORD_LENGTH);
  let password = '';

  for (let i = 0; i < TEMP_PASSWORD_LENGTH; i += 1) {
    password += alphabet[bytes[i] % alphabet.length];
  }

  return password;
};

const resetPassword = async (id, actorId) => {
  const user = await User.findById(id).select('+password');

  if (!user) {
    throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);
  }

  const temporaryPassword = generateTemporaryPassword();
  user.password = await bcrypt.hash(temporaryPassword, SALT_ROUNDS);
  await user.save();

  await writeUserAudit({
    action: USER_AUDIT_ACTIONS.PASSWORD_RESET,
    actorId,
    targetUser: user,
    snapshotBefore: { password: '[redacted]' },
    snapshotAfter: { password: '[temporary-issued]' },
    changedFields: ['password'],
    reason: 'Temporary password generated (email delivery not configured)',
  });

  return {
    user: user.toSafeObject(),
    temporaryPassword,
    message: 'Temporary password generated. Email delivery is not configured yet.',
  };
};

const getSummary = async () => {
  const [
    totalUsers,
    activeUsers,
    roleCounts,
    recentUsers,
    latestLoginUser,
  ] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ isActive: true }),
    User.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$role', count: { $sum: 1 } } },
    ]),
    User.find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),
    User.findOne({ lastLogin: { $ne: null } })
      .sort({ lastLogin: -1 })
      .lean(),
  ]);

  const countsByRole = {
    [ROLES.ADMINISTRATOR]: 0,
    [ROLES.MANAGER]: 0,
    [ROLES.DATA_ENTRY]: 0,
    [ROLES.CONSULTANT]: 0,
  };

  roleCounts.forEach((row) => {
    if (Object.prototype.hasOwnProperty.call(countsByRole, row._id)) {
      countsByRole[row._id] = row.count;
    }
  });

  return {
    totalUsers,
    activeUsers,
    administrators: countsByRole[ROLES.ADMINISTRATOR],
    managers: countsByRole[ROLES.MANAGER],
    dataEntry: countsByRole[ROLES.DATA_ENTRY],
    consultants: countsByRole[ROLES.CONSULTANT],
    recentUsers: recentUsers.map(User.toSafeObjectFromLean),
    latestLogin: latestLoginUser ? User.toSafeObjectFromLean(latestLoginUser) : null,
  };
};

module.exports = {
  findAll,
  findById,
  create,
  update,
  resetPassword,
  getSummary,
};
