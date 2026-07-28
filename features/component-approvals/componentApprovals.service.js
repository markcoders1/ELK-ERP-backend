const Component = require('../components/component.model');
const componentService = require('../components/component.service');
const ChangeRequest = require('../hardware-approvals/changeRequest.model');
const AuditLog = require('../hardware-approvals/auditLog.model');
const notificationService = require('../hardware-approvals/notification.service');
const syncService = require('../hardware-approvals/sync.service');
const AppError = require('../../utils/AppError');
const {
  HTTP_STATUS,
  ENTITY_TYPES,
  CHANGE_REQUEST_ACTIONS,
  CHANGE_REQUEST_STATUS,
  AUDIT_DECISIONS,
  SYNC_STATUS,
  COMPONENT_AUDIT_ACTIONS,
} = require('../../config/constants');
const { toPersistedChangedFields } = require('../../shared/bomDiff');

const USER_SELECT = 'name email role';

/** Business-friendly BOM change list (shared engine). */
const computeChangedFields = (before, after) => toPersistedChangedFields(before, after);

const assertNoPendingConflict = async ({ componentId = null, componentCode = null }) => {
  const filter = {
    entityType: ENTITY_TYPES.COMPONENT,
    status: CHANGE_REQUEST_STATUS.PENDING,
  };

  if (componentId) {
    filter.componentId = componentId;
  } else if (componentCode) {
    filter['snapshotAfter.header.componentCode'] = componentService.normalizeCode(componentCode);
  } else {
    return;
  }

  const existing = await ChangeRequest.findOne(filter).lean();
  if (existing) {
    throw new AppError(
      'A pending approval request already exists for this component',
      HTTP_STATUS.CONFLICT
    );
  }
};

const populateRequestQuery = (query) =>
  query
    .populate('submittedBy', USER_SELECT)
    .populate('approvedBy', USER_SELECT)
    .populate('rejectedBy', USER_SELECT);

const buildCreateSnapshot = (payload) => {
  const header = componentService.buildHeaderPayload(payload.header || payload);
  const sections = Array.isArray(payload.sections)
    ? payload.sections.map((section, idx) => ({
        sectionType: String(section.sectionType || '').toUpperCase(),
        name: section.name || section.sectionType,
        sortOrder: section.sortOrder ?? idx,
        meta: section.meta || {},
        items: (section.items || []).map((item, itemIdx) =>
          componentService.normalizeItemInput(
            item,
            String(section.sectionType || '').toUpperCase(),
            itemIdx
          )
        ),
      }))
    : componentService.DEFAULT_SECTIONS.map((s) => ({ ...s, items: [], meta: {} }));

  return { header, sections };
};

const mergeSectionUpdate = (fullSnapshot, sectionType, itemsPayload, sectionMeta = {}) => {
  const type = String(sectionType).toUpperCase();
  const sections = (fullSnapshot.sections || []).map((section) => {
    if (section.sectionType !== type) return section;
    return {
      ...section,
      name: sectionMeta.name || section.name,
      meta: sectionMeta.meta !== undefined ? sectionMeta.meta : section.meta,
      items: (itemsPayload || []).map((item, idx) =>
        componentService.normalizeItemInput(item, type, idx)
      ),
    };
  });

  if (!sections.some((s) => s.sectionType === type)) {
    sections.push({
      sectionType: type,
      name: sectionMeta.name || type,
      sortOrder: sections.length,
      meta: sectionMeta.meta || {},
      items: (itemsPayload || []).map((item, idx) =>
        componentService.normalizeItemInput(item, type, idx)
      ),
    });
  }

  return {
    header: fullSnapshot.header,
    sections,
  };
};

const submitCreate = async (payload, user) => {
  const snapshotAfter = buildCreateSnapshot(payload);
  const code = snapshotAfter.header.componentCode;

  const existing = await componentService.findLiveByCode(code);
  if (existing) {
    throw new AppError('Component code already exists', HTTP_STATUS.CONFLICT);
  }

  await assertNoPendingConflict({ componentCode: code });

  const changedFields = computeChangedFields(null, snapshotAfter);

  const request = await ChangeRequest.create({
    entityType: ENTITY_TYPES.COMPONENT,
    componentId: null,
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

  await AuditLog.create({
    entityType: ENTITY_TYPES.COMPONENT,
    changeRequestId: request._id,
    componentCode: code,
    action: COMPONENT_AUDIT_ACTIONS.COMPONENT_SUBMITTED,
    decision: null,
    changedFields,
    submittedBy: user.id,
    decidedBy: user.id,
    reason: null,
    snapshotBefore: null,
    snapshotAfter,
  });

  await notificationService.notifyReviewersOfSubmission({
    changeRequest: request,
    submitter: user,
  });

  const populated = await populateRequestQuery(ChangeRequest.findById(request._id)).lean();
  return ChangeRequest.toSafeObjectFromLean(populated);
};

const submitUpdate = async (componentId, payload, user) => {
  const live = await Component.findOne({
    _id: componentId,
    deletedAt: null,
    versionStatus: 'APPROVED',
  });
  if (!live) {
    throw new AppError('Component not found', HTTP_STATUS.NOT_FOUND);
  }

  await assertNoPendingConflict({ componentId });

  const snapshotBefore = await componentService.buildFullSnapshot(componentId);
  let snapshotAfter;

  if (payload.sectionType && payload.items !== undefined) {
    snapshotAfter = mergeSectionUpdate(
      {
        header: componentService.buildHeaderPayload(payload.header || {}, {
          existing: live,
        }),
        sections: snapshotBefore.sections,
      },
      payload.sectionType,
      payload.items,
      { name: payload.sectionName, meta: payload.sectionMeta }
    );
    // Keep header from before unless header patch provided
    if (payload.header) {
      snapshotAfter.header = componentService.buildHeaderPayload(payload.header, {
        existing: live,
      });
      snapshotAfter.header.componentCode = live.componentCode;
    } else {
      snapshotAfter.header = snapshotBefore.header;
    }
  } else {
    snapshotAfter = {
      header: {
        ...componentService.buildHeaderPayload(payload.header || payload, {
          existing: live,
        }),
        componentCode: live.componentCode,
      },
      sections:
        payload.sections !== undefined
          ? buildCreateSnapshot({ header: {}, sections: payload.sections }).sections
          : snapshotBefore.sections,
    };
  }

  const changedFields = computeChangedFields(snapshotBefore, snapshotAfter);
  if (changedFields.length === 0) {
    throw new AppError('No changes detected', HTTP_STATUS.BAD_REQUEST);
  }

  const request = await ChangeRequest.create({
    entityType: ENTITY_TYPES.COMPONENT,
    componentId: live._id,
    hardwareId: null,
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

  await AuditLog.create({
    entityType: ENTITY_TYPES.COMPONENT,
    changeRequestId: request._id,
    componentId: live._id,
    componentCode: live.componentCode,
    action: COMPONENT_AUDIT_ACTIONS.COMPONENT_SUBMITTED,
    decision: null,
    changedFields,
    submittedBy: user.id,
    decidedBy: user.id,
    reason: null,
    snapshotBefore,
    snapshotAfter,
  });

  await notificationService.notifyReviewersOfSubmission({
    changeRequest: request,
    submitter: user,
  });

  const populated = await populateRequestQuery(ChangeRequest.findById(request._id)).lean();
  return ChangeRequest.toSafeObjectFromLean(populated);
};

const createAuditEntry = async ({
  changeRequest,
  decision,
  decidedBy,
  reason = null,
  componentId = null,
}) => {
  const componentCode =
    changeRequest.snapshotAfter?.header?.componentCode ||
    changeRequest.snapshotBefore?.header?.componentCode ||
    'UNKNOWN';

  await AuditLog.create({
    entityType: ENTITY_TYPES.COMPONENT,
    changeRequestId: changeRequest._id,
    componentId,
    componentCode,
    hardwareId: null,
    stockCode: null,
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

  if (!request || request.entityType !== ENTITY_TYPES.COMPONENT) {
    throw new AppError('Change request not found', HTTP_STATUS.NOT_FOUND);
  }

  if (request.status !== CHANGE_REQUEST_STATUS.PENDING) {
    throw new AppError('Only pending requests can be approved', HTTP_STATUS.BAD_REQUEST);
  }

  const snapshot = request.snapshotAfter;
  let applied = null;

  if (request.action === CHANGE_REQUEST_ACTIONS.CREATE) {
    applied = await componentService.create(snapshot, request.submittedBy);
  } else if (request.action === CHANGE_REQUEST_ACTIONS.UPDATE) {
    if (!request.componentId) {
      throw new AppError('Update request is missing componentId', HTTP_STATUS.BAD_REQUEST);
    }
    applied = await componentService.update(
      request.componentId.toString(),
      snapshot,
      request.submittedBy
    );
  } else {
    throw new AppError('Unsupported change request action', HTTP_STATUS.BAD_REQUEST);
  }

  const syncResult = await syncService.trigger({
    changeRequestId: request._id.toString(),
    stockCode: snapshot.header?.componentCode,
    entityType: request.entityType,
  });

  request.status = CHANGE_REQUEST_STATUS.APPROVED;
  request.approvedBy = user.id;
  request.reviewedAt = new Date();
  request.syncStatus = syncResult.syncStatus;
  request.syncLogs = syncResult.syncLogs;
  if (request.action === CHANGE_REQUEST_ACTIONS.CREATE && applied?.id) {
    request.componentId = applied.id;
  }
  await request.save();

  await createAuditEntry({
    changeRequest: request,
    decision: AUDIT_DECISIONS.APPROVED,
    decidedBy: user.id,
    componentId: request.componentId,
  });

  await notificationService.notifySubmitterOfDecision({
    changeRequest: request,
    decision: AUDIT_DECISIONS.APPROVED,
    decidedByName: user.name,
  });

  const populated = await populateRequestQuery(ChangeRequest.findById(request._id)).lean();
  return ChangeRequest.toSafeObjectFromLean(populated);
};

const reject = async (id, { reason }, user) => {
  const trimmedReason = reason?.trim?.() || '';
  if (!trimmedReason) {
    throw new AppError('Rejection reason is required', HTTP_STATUS.BAD_REQUEST);
  }

  const request = await ChangeRequest.findById(id);

  if (!request || request.entityType !== ENTITY_TYPES.COMPONENT) {
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
    componentId: request.componentId,
  });

  await notificationService.notifySubmitterOfDecision({
    changeRequest: request,
    decision: AUDIT_DECISIONS.REJECTED,
    reason: trimmedReason,
    decidedByName: user.name,
  });

  const populated = await populateRequestQuery(ChangeRequest.findById(request._id)).lean();
  return ChangeRequest.toSafeObjectFromLean(populated);
};

module.exports = {
  submitCreate,
  submitUpdate,
  approve,
  reject,
  buildCreateSnapshot,
  mergeSectionUpdate,
  computeChangedFields,
};
