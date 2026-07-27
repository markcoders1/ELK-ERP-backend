const HardwareItem = require('../hardware/hardwareItem.model');
const hardwareService = require('../hardware/hardware.service');
const ChangeRequest = require('./changeRequest.model');
const AuditLog = require('./auditLog.model');
const notificationService = require('./notification.service');
const syncService = require('./sync.service');
const componentApprovalsService = require('../component-approvals/componentApprovals.service');
const AppError = require('../../utils/AppError');
const {
  HTTP_STATUS,
  ENTITY_TYPES,
  CHANGE_REQUEST_ACTIONS,
  CHANGE_REQUEST_STATUS,
  AUDIT_DECISIONS,
  CHANGE_REQUEST_SORT_FIELDS,
  AUDIT_SORT_FIELDS,
  SYNC_STATUS,
} = require('../../config/constants');
const { parsePagination, buildPaginationMeta } = require('../../shared/pagination');
const { escapeRegex } = require('../../shared/escapeRegex');
const {
  calculateHardwarePricing,
  DEFAULT_MARKUP,
} = require('../hardware/hardwarePricing.service');

const USER_SELECT = 'name email role';

const toOptionalNumber = (value) => {
  if (value === '' || value === null || value === undefined) return undefined;
  const number = Number(value);
  return Number.isNaN(number) ? undefined : number;
};

const normalizeStockCode = (stockCode) => stockCode.trim().toUpperCase();
const normalizeGroupCode = (groupCode) => groupCode.trim().toUpperCase();

/**
 * Source-data snapshot for change requests (no calculated pricing trees).
 * Agreed is derived via the pricing calculator so snapshots stay consistent.
 */
const buildHardwareSnapshot = (payload, { existing = null } = {}) => {
  const base = existing
    ? {
        groupCode: existing.groupCode,
        stockCode: existing.stockCode,
        description: existing.description,
        supplierName: existing.supplierName || '',
        supplierCode: existing.supplierCode || '',
        regionalCosts: existing.regionalCosts || {},
        pricingBasis: existing.pricingBasis,
        mnfMarkup: existing.mnfMarkup ?? DEFAULT_MARKUP,
        frcMarkup: existing.frcMarkup ?? DEFAULT_MARKUP,
        retailMarkup: existing.retailMarkup ?? DEFAULT_MARKUP,
        weight: existing.weight ?? 0,
        isImport: existing.isImport ?? false,
        isActive: existing.isActive !== false,
      }
    : {};

  const mnfMarkup =
    payload.mnfMarkup !== undefined
      ? toOptionalNumber(payload.mnfMarkup) ?? DEFAULT_MARKUP
      : base.mnfMarkup ?? DEFAULT_MARKUP;
  const frcMarkup =
    payload.frcMarkup !== undefined
      ? toOptionalNumber(payload.frcMarkup) ?? DEFAULT_MARKUP
      : base.frcMarkup ?? DEFAULT_MARKUP;
  const retailMarkup =
    payload.retailMarkup !== undefined
      ? toOptionalNumber(payload.retailMarkup) ?? DEFAULT_MARKUP
      : base.retailMarkup ?? DEFAULT_MARKUP;

  const pricingBasis = payload.pricingBasis ?? base.pricingBasis;
  const existingRegional = base.regionalCosts || {};

  const cpt =
    payload.regionalCosts && Object.prototype.hasOwnProperty.call(payload.regionalCosts, 'cpt')
      ? toOptionalNumber(payload.regionalCosts.cpt)
      : existingRegional.cpt;
  const jhb =
    payload.regionalCosts && Object.prototype.hasOwnProperty.call(payload.regionalCosts, 'jhb')
      ? toOptionalNumber(payload.regionalCosts.jhb)
      : existingRegional.jhb;

  const pricing = calculateHardwarePricing({
    cpt,
    jhb,
    pricingBasis,
    mnfMarkup,
    frcMarkup,
    retailMarkup,
  });

  const stockCode = payload.stockCode
    ? normalizeStockCode(payload.stockCode)
    : base.stockCode;

  return {
    groupCode: payload.groupCode !== undefined
      ? normalizeGroupCode(payload.groupCode)
      : base.groupCode,
    stockCode,
    description:
      payload.description !== undefined ? payload.description.trim() : base.description,
    supplierName:
      payload.supplierName !== undefined
        ? payload.supplierName.trim()
        : base.supplierName || '',
    supplierCode:
      payload.supplierCode !== undefined
        ? payload.supplierCode.trim()
        : base.supplierCode || '',
    regionalCosts: {
      cpt: cpt ?? null,
      jhb: jhb ?? null,
      agreed: pricing.agreed ?? null,
    },
    pricingBasis,
    mnfMarkup,
    frcMarkup,
    retailMarkup,
    weight:
      payload.weight !== undefined
        ? toOptionalNumber(payload.weight) ?? 0
        : base.weight ?? 0,
    isImport:
      payload.isImport !== undefined ? Boolean(payload.isImport) : base.isImport ?? false,
    isActive:
      payload.isActive !== undefined ? Boolean(payload.isActive) : base.isActive !== false,
  };
};

const snapshotFromHardwareDoc = (item) => {
  const source = item.toObject ? item.toObject() : item;
  return buildHardwareSnapshot({}, { existing: source });
};

const valuesEqual = (a, b) => {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (typeof a === 'number' || typeof b === 'number') {
    return Number(a) === Number(b);
  }
  if (typeof a === 'object' || typeof b === 'object') {
    return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  }
  return String(a) === String(b);
};

const COMPARISON_FIELDS = [
  'groupCode',
  'stockCode',
  'description',
  'supplierName',
  'supplierCode',
  'pricingBasis',
  'mnfMarkup',
  'frcMarkup',
  'retailMarkup',
  'weight',
  'isImport',
  'isActive',
  'regionalCosts.cpt',
  'regionalCosts.jhb',
  'regionalCosts.agreed',
];

const getPathValue = (obj, path) => {
  if (!obj) return undefined;
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
};

const computeChangedFields = (before, after) => {
  if (!before) {
    return COMPARISON_FIELDS.filter((field) => {
      const value = getPathValue(after, field);
      return value !== undefined && value !== null && value !== '';
    });
  }

  return COMPARISON_FIELDS.filter(
    (field) => !valuesEqual(getPathValue(before, field), getPathValue(after, field))
  );
};

const assertNoPendingConflict = async ({ hardwareId = null, stockCode = null }) => {
  const filter = {
    entityType: ENTITY_TYPES.HARDWARE,
    status: CHANGE_REQUEST_STATUS.PENDING,
  };

  if (hardwareId) {
    filter.hardwareId = hardwareId;
  } else if (stockCode) {
    filter['snapshotAfter.stockCode'] = normalizeStockCode(stockCode);
  } else {
    return;
  }

  const existing = await ChangeRequest.findOne(filter).lean();
  if (existing) {
    throw new AppError(
      'A pending approval request already exists for this hardware item',
      HTTP_STATUS.CONFLICT
    );
  }
};

const populateRequestQuery = (query) =>
  query
    .populate('submittedBy', USER_SELECT)
    .populate('approvedBy', USER_SELECT)
    .populate('rejectedBy', USER_SELECT);

const submitCreate = async (payload, user) => {
  const stockCode = normalizeStockCode(payload.stockCode);

  const existingItem = await HardwareItem.findOne({ stockCode }).lean();
  if (existingItem) {
    throw new AppError('Stock code already exists', HTTP_STATUS.CONFLICT);
  }

  await assertNoPendingConflict({ stockCode });

  const snapshotAfter = buildHardwareSnapshot(payload);
  const changedFields = computeChangedFields(null, snapshotAfter);

  const request = await ChangeRequest.create({
    entityType: ENTITY_TYPES.HARDWARE,
    hardwareId: null,
    action: CHANGE_REQUEST_ACTIONS.CREATE,
    status: CHANGE_REQUEST_STATUS.PENDING,
    submittedBy: user.id,
    submittedAt: new Date(),
    snapshotBefore: null,
    snapshotAfter,
    changedFields,
    syncStatus: SYNC_STATUS.WAITING,
    comments: payload.comments?.trim?.() || '',
  });

  await notificationService.notifyReviewersOfSubmission({
    changeRequest: request,
    submitter: user,
  });

  const populated = await populateRequestQuery(ChangeRequest.findById(request._id)).lean();
  return ChangeRequest.toSafeObjectFromLean(populated);
};

const submitUpdate = async (hardwareId, payload, user) => {
  const item = await HardwareItem.findOne({ _id: hardwareId, deletedAt: null });
  if (!item) {
    throw new AppError('Hardware item not found', HTTP_STATUS.NOT_FOUND);
  }

  await assertNoPendingConflict({ hardwareId });

  const snapshotBefore = snapshotFromHardwareDoc(item);
  const snapshotAfter = buildHardwareSnapshot(payload, { existing: item });
  const changedFields = computeChangedFields(snapshotBefore, snapshotAfter);

  if (changedFields.length === 0) {
    throw new AppError('No changes detected', HTTP_STATUS.BAD_REQUEST);
  }

  const request = await ChangeRequest.create({
    entityType: ENTITY_TYPES.HARDWARE,
    hardwareId: item._id,
    action: CHANGE_REQUEST_ACTIONS.UPDATE,
    status: CHANGE_REQUEST_STATUS.PENDING,
    submittedBy: user.id,
    submittedAt: new Date(),
    snapshotBefore,
    snapshotAfter,
    changedFields,
    syncStatus: SYNC_STATUS.WAITING,
    comments: payload.comments?.trim?.() || '',
  });

  await notificationService.notifyReviewersOfSubmission({
    changeRequest: request,
    submitter: user,
  });

  const populated = await populateRequestQuery(ChangeRequest.findById(request._id)).lean();
  return ChangeRequest.toSafeObjectFromLean(populated);
};

const buildListFilter = (query) => {
  const filter = {};

  if (query.entityType) {
    filter.entityType = query.entityType;
  } else {
    // Show Hardware + Component requests in the shared Approvals queue.
    filter.entityType = {
      $in: [ENTITY_TYPES.HARDWARE, ENTITY_TYPES.COMPONENT],
    };
  }

  if (query.status) {
    filter.status = query.status;
  }

  if (query.action) {
    filter.action = query.action;
  }

  if (query.submittedBy) {
    filter.submittedBy = query.submittedBy;
  }

  if (query.search) {
    const term = escapeRegex(query.search.trim());
    filter.$or = [
      { 'snapshotAfter.stockCode': new RegExp(term, 'i') },
      { 'snapshotAfter.description': new RegExp(term, 'i') },
      { 'snapshotBefore.stockCode': new RegExp(term, 'i') },
      { 'snapshotBefore.description': new RegExp(term, 'i') },
      { 'snapshotAfter.header.componentCode': new RegExp(term, 'i') },
      { 'snapshotAfter.header.description': new RegExp(term, 'i') },
      { 'snapshotBefore.header.componentCode': new RegExp(term, 'i') },
      { 'snapshotBefore.header.description': new RegExp(term, 'i') },
    ];
  }

  return filter;
};

const buildSort = (query, defaultField = 'submittedAt') => {
  const sortBy = CHANGE_REQUEST_SORT_FIELDS.includes(query.sortBy)
    ? query.sortBy
    : defaultField;
  const sortOrder = query.sortOrder === 'asc' ? 1 : -1;
  return { [sortBy]: sortOrder };
};

const findAll = async (query) => {
  const { page, limit, skip } = parsePagination(query);
  const filter = buildListFilter(query);
  const sort = buildSort(query);

  const [items, total] = await Promise.all([
    populateRequestQuery(ChangeRequest.find(filter).sort(sort).skip(skip).limit(limit)).lean(),
    ChangeRequest.countDocuments(filter),
  ]);

  return {
    items: items.map(ChangeRequest.toSafeObjectFromLean),
    pagination: buildPaginationMeta({ page, limit, total }),
  };
};

const findById = async (id) => {
  const item = await populateRequestQuery(ChangeRequest.findById(id)).lean();

  if (
    !item ||
    (item.entityType !== ENTITY_TYPES.HARDWARE &&
      item.entityType !== ENTITY_TYPES.COMPONENT)
  ) {
    throw new AppError('Change request not found', HTTP_STATUS.NOT_FOUND);
  }

  return ChangeRequest.toSafeObjectFromLean(item);
};

const createAuditEntry = async ({
  changeRequest,
  decision,
  decidedBy,
  reason = null,
  hardwareId = null,
}) => {
  const stockCode =
    changeRequest.snapshotAfter?.stockCode ||
    changeRequest.snapshotBefore?.stockCode ||
    'UNKNOWN';

  await AuditLog.create({
    entityType: changeRequest.entityType || ENTITY_TYPES.HARDWARE,
    changeRequestId: changeRequest._id,
    hardwareId,
    stockCode,
    action: changeRequest.action,
    decision,
    changedFields: changeRequest.changedFields || [],
    submittedBy: changeRequest.submittedBy,
    decidedBy,
    reason,
    snapshotBefore: changeRequest.snapshotBefore,
    snapshotAfter: changeRequest.snapshotAfter,
  });
};

const approve = async (id, user) => {
  const request = await ChangeRequest.findById(id);

  if (!request) {
    throw new AppError('Change request not found', HTTP_STATUS.NOT_FOUND);
  }

  if (request.entityType === ENTITY_TYPES.COMPONENT) {
    return componentApprovalsService.approve(id, user);
  }

  if (request.entityType !== ENTITY_TYPES.HARDWARE) {
    throw new AppError('Change request not found', HTTP_STATUS.NOT_FOUND);
  }

  if (request.status !== CHANGE_REQUEST_STATUS.PENDING) {
    throw new AppError('Only pending requests can be approved', HTTP_STATUS.BAD_REQUEST);
  }

  const snapshot = request.snapshotAfter;
  let appliedHardware = null;

  if (request.action === CHANGE_REQUEST_ACTIONS.CREATE) {
    appliedHardware = await hardwareService.create(snapshot, request.submittedBy);
  } else if (request.action === CHANGE_REQUEST_ACTIONS.UPDATE) {
    if (!request.hardwareId) {
      throw new AppError('Update request is missing hardwareId', HTTP_STATUS.BAD_REQUEST);
    }
    appliedHardware = await hardwareService.update(
      request.hardwareId.toString(),
      snapshot,
      request.submittedBy
    );
  } else {
    throw new AppError('Unsupported change request action', HTTP_STATUS.BAD_REQUEST);
  }

  const syncResult = await syncService.trigger({
    changeRequestId: request._id.toString(),
    stockCode: snapshot.stockCode,
    entityType: request.entityType,
  });

  request.status = CHANGE_REQUEST_STATUS.APPROVED;
  request.approvedBy = user.id;
  request.reviewedAt = new Date();
  request.syncStatus = syncResult.syncStatus;
  request.syncLogs = syncResult.syncLogs;
  if (request.action === CHANGE_REQUEST_ACTIONS.CREATE && appliedHardware?.id) {
    request.hardwareId = appliedHardware.id;
  }
  await request.save();

  await createAuditEntry({
    changeRequest: request,
    decision: AUDIT_DECISIONS.APPROVED,
    decidedBy: user.id,
    hardwareId: request.hardwareId,
  });

  await notificationService.notifySubmitterOfDecision({
    changeRequest: request,
    decision: AUDIT_DECISIONS.APPROVED,
    decidedByName: user.name,
  });

  return findById(request._id);
};

const reject = async (id, { reason }, user) => {
  const trimmedReason = reason?.trim?.() || '';
  if (!trimmedReason) {
    throw new AppError('Rejection reason is required', HTTP_STATUS.BAD_REQUEST);
  }

  const request = await ChangeRequest.findById(id);

  if (!request) {
    throw new AppError('Change request not found', HTTP_STATUS.NOT_FOUND);
  }

  if (request.entityType === ENTITY_TYPES.COMPONENT) {
    return componentApprovalsService.reject(id, { reason: trimmedReason }, user);
  }

  if (request.entityType !== ENTITY_TYPES.HARDWARE) {
    throw new AppError('Change request not found', HTTP_STATUS.NOT_FOUND);
  }

  if (request.status !== CHANGE_REQUEST_STATUS.PENDING) {
    throw new AppError('Only pending requests can be rejected', HTTP_STATUS.BAD_REQUEST);
  }

  request.status = CHANGE_REQUEST_STATUS.REJECTED;
  request.rejectedBy = user.id;
  request.reviewedAt = new Date();
  request.rejectionReason = trimmedReason;
  request.syncStatus = SYNC_STATUS.WAITING;
  await request.save();

  await createAuditEntry({
    changeRequest: request,
    decision: AUDIT_DECISIONS.REJECTED,
    decidedBy: user.id,
    reason: trimmedReason,
    hardwareId: request.hardwareId,
  });

  await notificationService.notifySubmitterOfDecision({
    changeRequest: request,
    decision: AUDIT_DECISIONS.REJECTED,
    reason: trimmedReason,
    decidedByName: user.name,
  });

  return findById(request._id);
};

const buildAuditFilter = (query) => {
  const filter = {};
  if (query.entityType) {
    filter.entityType = query.entityType;
  } else {
    filter.entityType = {
      $in: [ENTITY_TYPES.HARDWARE, ENTITY_TYPES.COMPONENT],
    };
  }
  const andClauses = [];

  if (query.decision || query.status) {
    filter.decision = query.decision || query.status;
  }

  if (query.stockCode) {
    filter.stockCode = normalizeStockCode(query.stockCode);
  }

  if (query.componentCode) {
    filter.componentCode = String(query.componentCode).trim().toUpperCase();
  }

  if (query.dateFrom || query.dateTo) {
    filter.createdAt = {};
    if (query.dateFrom) {
      filter.createdAt.$gte = new Date(query.dateFrom);
    }
    if (query.dateTo) {
      const end = new Date(query.dateTo);
      end.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = end;
    }
  }

  if (query.userId) {
    andClauses.push({
      $or: [{ submittedBy: query.userId }, { decidedBy: query.userId }],
    });
  }

  if (query.search) {
    const term = escapeRegex(query.search.trim());
    andClauses.push({
      $or: [
        { stockCode: new RegExp(term, 'i') },
        { componentCode: new RegExp(term, 'i') },
        { reason: new RegExp(term, 'i') },
      ],
    });
  }

  if (andClauses.length > 0) {
    filter.$and = andClauses;
  }

  return filter;
};

const findAuditTrail = async (query) => {
  const { page, limit, skip } = parsePagination(query);
  const filter = buildAuditFilter(query);
  const sortBy = AUDIT_SORT_FIELDS.includes(query.sortBy) ? query.sortBy : 'createdAt';
  const sortOrder = query.sortOrder === 'asc' ? 1 : -1;

  const [items, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limit)
      .populate('submittedBy', USER_SELECT)
      .populate('decidedBy', USER_SELECT)
      .lean(),
    AuditLog.countDocuments(filter),
  ]);

  return {
    items: items.map(AuditLog.toSafeObjectFromLean),
    pagination: buildPaginationMeta({ page, limit, total }),
  };
};

const getDashboardSummary = async (userId) => {
  const [
    pendingCount,
    hardwareLinesCount,
    recentRequests,
    recentAudits,
    notifications,
  ] = await Promise.all([
    ChangeRequest.countDocuments({
      entityType: ENTITY_TYPES.HARDWARE,
      status: CHANGE_REQUEST_STATUS.PENDING,
    }),
    HardwareItem.countDocuments({ deletedAt: null }),
    populateRequestQuery(
      ChangeRequest.find({ entityType: ENTITY_TYPES.HARDWARE })
        .sort({ submittedAt: -1 })
        .limit(5)
    ).lean(),
    AuditLog.find({ entityType: ENTITY_TYPES.HARDWARE })
      .sort({ createdAt: -1 })
      .limit(8)
      .populate('submittedBy', USER_SELECT)
      .populate('decidedBy', USER_SELECT)
      .lean(),
    notificationService.listForUser(userId, { limit: 10 }),
  ]);

  const volumeStart = new Date();
  volumeStart.setDate(volumeStart.getDate() - 6);
  volumeStart.setHours(0, 0, 0, 0);

  const volumeDocs = await ChangeRequest.aggregate([
    {
      $match: {
        entityType: ENTITY_TYPES.HARDWARE,
        submittedAt: { $gte: volumeStart },
      },
    },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$submittedAt' },
        },
        requests: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const approvalVolumeSeries = [];
  for (let i = 0; i < 7; i += 1) {
    const day = new Date(volumeStart);
    day.setDate(volumeStart.getDate() + i);
    const key = day.toISOString().slice(0, 10);
    const found = volumeDocs.find((d) => d._id === key);
    approvalVolumeSeries.push({
      day: dayNames[day.getDay()],
      requests: found?.requests || 0,
    });
  }

  const sync = syncService.getPlaceholderStatus();

  return {
    pendingCount,
    hardwareLinesCount,
    recentRequests: recentRequests.map(ChangeRequest.toSafeObjectFromLean),
    recentActivity: recentAudits.map((doc) => {
      const safe = AuditLog.toSafeObjectFromLean(doc);
      return {
        id: safe.id,
        title: safe.decision === AUDIT_DECISIONS.APPROVED ? 'Request Approved' : 'Request Rejected',
        description: `${safe.stockCode} · ${safe.action} · ${safe.decision}${
          safe.reason ? ` · ${safe.reason}` : ''
        }`,
        time: safe.createdAt,
        type: safe.decision === AUDIT_DECISIONS.APPROVED ? 'approval' : 'rejection',
        stockCode: safe.stockCode,
        decision: safe.decision,
        decidedBy: safe.decidedBy,
      };
    }),
    approvalVolumeSeries,
    syncStatus: sync,
    notifications,
    approvalWorkflow: {
      title: 'Approval Workflow',
      subtitle: 'Submit → Manager Review → Live Catalogue → Downstream Sync',
      stages: [
        { id: 'submit', label: 'Submit', complete: true },
        {
          id: 'review',
          label: 'Manager Review',
          complete: pendingCount === 0,
          current: pendingCount > 0,
        },
        {
          id: 'catalogue',
          label: 'Live Catalogue',
          complete: false,
          current: pendingCount === 0,
        },
        { id: 'sync', label: 'Downstream Sync', complete: false },
      ],
    },
  };
};

module.exports = {
  submitCreate,
  submitUpdate,
  findAll,
  findById,
  approve,
  reject,
  findAuditTrail,
  getDashboardSummary,
  buildHardwareSnapshot,
  computeChangedFields,
};
