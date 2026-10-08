import mongoose from 'mongoose';
import { NOTIFICATION_RETENTION_SECONDS } from '../../../../../core/notifications/retention.js';

// A Taxi broadcast is ONE shared document for every rider / driver it is addressed to, so "clear" cannot delete it.
// This row says "this person cleared that broadcast": the lists leave it out for them, on every device and after the
// app is reopened. The row goes away with the same TTL as the broadcast itself.
const notificationDismissalSchema = new mongoose.Schema(
  {
    recipientRole: { type: String, enum: ['user', 'driver'], required: true },
    recipientId: { type: mongoose.Schema.Types.ObjectId, required: true },
    notificationId: { type: mongoose.Schema.Types.ObjectId, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

notificationDismissalSchema.index({ recipientRole: 1, recipientId: 1, notificationId: 1 }, { unique: true });
notificationDismissalSchema.index({ createdAt: 1 }, { expireAfterSeconds: NOTIFICATION_RETENTION_SECONDS });

export const NotificationDismissal =
  mongoose.models.TaxiNotificationDismissal || mongoose.model('TaxiNotificationDismissal', notificationDismissalSchema);

export const getDismissedNotificationIds = async (recipientRole, recipientId) =>
  NotificationDismissal.find({ recipientRole, recipientId }).distinct('notificationId');

/** Marks broadcasts as cleared for one person (ids that are not real ObjectIds - local-only items - are skipped). */
export const dismissNotifications = async (recipientRole, recipientId, notificationIds = []) => {
  const ids = [...new Set(notificationIds.map((id) => String(id || '').trim()))].filter((id) => mongoose.isValidObjectId(id));
  if (ids.length === 0) return 0;
  await NotificationDismissal.bulkWrite(
    ids.map((id) => ({
      updateOne: {
        filter: { recipientRole, recipientId, notificationId: id },
        update: { $setOnInsert: { recipientRole, recipientId, notificationId: id } },
        upsert: true,
      },
    })),
    { ordered: false },
  );
  return ids.length;
};
