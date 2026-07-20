const Notification = require('./notification.model');
const User = require('../auth/user.model');
const { ROLES, NOTIFICATION_TYPES, ENTITY_TYPES } = require('../../config/constants');

const createNotification = async ({
  userId,
  type,
  title,
  message,
  changeRequestId = null,
  entityType = ENTITY_TYPES.HARDWARE,
  meta = null,
}) => {
  if (!userId) return null;

  const doc = await Notification.create({
    userId,
    type,
    title,
    message,
    changeRequestId,
    entityType,
    meta,
  });

  return Notification.toSafeObjectFromLean(doc.toObject());
};

const notifyReviewersOfSubmission = async ({ changeRequest, submitter }) => {
  const reviewers = await User.find({
    role: { $in: [ROLES.ADMINISTRATOR, ROLES.MANAGER] },
    isActive: true,
  })
    .select('_id')
    .lean();

  const stockCode = changeRequest.snapshotAfter?.stockCode || '—';
  const title = 'New approval submitted';
  const message = `${submitter?.name || 'A user'} submitted a ${changeRequest.action} request for ${stockCode}.`;

  await Promise.all(
    reviewers
      .filter((user) => user._id.toString() !== submitter?.id)
      .map((user) =>
        createNotification({
          userId: user._id,
          type: NOTIFICATION_TYPES.APPROVAL_SUBMITTED,
          title,
          message,
          changeRequestId: changeRequest._id || changeRequest.id,
          meta: {
            action: changeRequest.action,
            stockCode,
          },
        })
      )
  );
};

const notifySubmitterOfDecision = async ({
  changeRequest,
  decision,
  reason = null,
  decidedByName = null,
}) => {
  const stockCode = changeRequest.snapshotAfter?.stockCode || changeRequest.snapshotBefore?.stockCode || '—';
  const isApproved = decision === 'APPROVED';

  await createNotification({
    userId: changeRequest.submittedBy,
    type: isApproved ? NOTIFICATION_TYPES.APPROVAL_APPROVED : NOTIFICATION_TYPES.APPROVAL_REJECTED,
    title: isApproved ? 'Request approved' : 'Request rejected',
    message: isApproved
      ? `Your ${changeRequest.action} request for ${stockCode} was approved${decidedByName ? ` by ${decidedByName}` : ''}.`
      : `Your ${changeRequest.action} request for ${stockCode} was rejected${decidedByName ? ` by ${decidedByName}` : ''}.${reason ? ` Reason: ${reason}` : ''}`,
    changeRequestId: changeRequest._id || changeRequest.id,
    meta: {
      decision,
      reason,
      stockCode,
      action: changeRequest.action,
    },
  });
};

const listForUser = async (userId, { limit = 20 } = {}) => {
  const items = await Notification.find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return items.map(Notification.toSafeObjectFromLean);
};

const markRead = async (notificationId, userId) => {
  const item = await Notification.findOneAndUpdate(
    { _id: notificationId, userId },
    { isRead: true },
    { new: true }
  ).lean();

  return item ? Notification.toSafeObjectFromLean(item) : null;
};

module.exports = {
  createNotification,
  notifyReviewersOfSubmission,
  notifySubmitterOfDecision,
  listForUser,
  markRead,
};
