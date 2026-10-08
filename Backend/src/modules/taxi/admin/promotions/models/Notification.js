import mongoose from 'mongoose';
import { NOTIFICATION_RETENTION_SECONDS } from '../../../../../core/notifications/retention.js';

// "Particular persons" broadcast: the admin picks specific riders / drivers instead of an audience.
const recipientSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ['user', 'driver'], required: true },
    id: { type: mongoose.Schema.Types.ObjectId, required: true },
    label: { type: String, default: '', trim: true },
    subLabel: { type: String, default: '', trim: true },
  },
  { _id: false },
);

const notificationSchema = new mongoose.Schema(
  {
    service_location_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiServiceLocation',
      // A particular-persons broadcast is not tied to a service area.
      required() {
        return this.send_to !== 'custom';
      },
      index: true,
    },
    service_location_name: {
      type: String,
      default: '',
      trim: true,
    },
    send_to: {
      type: String,
      enum: ['all', 'drivers', 'users', 'custom'],
      default: 'all',
      trim: true,
      index: true,
    },
    recipients: {
      type: [recipientSchema],
      default: [],
    },
    push_title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    image: {
      type: String,
      default: '',
      trim: true,
    },
    status: {
      type: String,
      enum: ['sent', 'draft'],
      default: 'sent',
      index: true,
    },
    sent_at: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true },
);

notificationSchema.index({ service_location_id: 1, send_to: 1, createdAt: -1 });
// Gone from the database 3 days after it was sent (riders' and drivers' inbox).
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: NOTIFICATION_RETENTION_SECONDS });

export const Notification =
  mongoose.models.TaxiNotification || mongoose.model('TaxiNotification', notificationSchema);
