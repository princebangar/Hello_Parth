import mongoose from 'mongoose';
import { NOTIFICATION_RETENTION_SECONDS } from './../retention.js';

const notificationSchema = new mongoose.Schema(
    {
        ownerType: {
            type: String,
            enum: ['USER', 'RESTAURANT', 'DELIVERY_PARTNER'],
            required: true,
            index: true
        },
        ownerId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            index: true
        },
        title: {
            type: String,
            required: true,
            trim: true
        },
        message: {
            type: String,
            required: true,
            trim: true
        },
        link: {
            type: String,
            default: '',
            trim: true
        },
        category: {
            type: String,
            default: 'broadcast',
            trim: true
        },
        source: {
            type: String,
            enum: ['ADMIN_BROADCAST', 'FSSAI_EXPIRY'],
            default: 'ADMIN_BROADCAST',
            index: true
        },
        broadcastId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'BroadcastNotification',
            default: null,
            index: true
        },
        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: {}
        },
        isRead: {
            type: Boolean,
            default: false,
            index: true
        },
        readAt: {
            type: Date,
            default: null
        },
        dismissedAt: {
            type: Date,
            default: null,
            index: true
        }
    },
    {
        collection: 'food_notifications',
        timestamps: true
    }
);

notificationSchema.index({ ownerType: 1, ownerId: 1, createdAt: -1 });
// Food user / restaurant / delivery inbox: gone from the database 3 days after it was created.
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: NOTIFICATION_RETENTION_SECONDS });
notificationSchema.index({ ownerType: 1, ownerId: 1, isRead: 1, dismissedAt: 1 });
// One copy of a broadcast per owner. Only broadcast rows take part: the old index was "unique + sparse", but a compound
// sparse index still includes every row that has ownerType/ownerId, so the 2nd non-broadcast message to the same
// restaurant / rider (broadcastId null) failed with a duplicate-key error and was silently lost (dining / category
// approval notices, etc.).
const BROADCAST_INDEX = 'broadcastId_ownerType_ownerId_unique';
notificationSchema.index(
    { broadcastId: 1, ownerType: 1, ownerId: 1 },
    { name: BROADCAST_INDEX, unique: true, partialFilterExpression: { broadcastId: { $type: 'objectId' } } }
);

export const FoodNotification = mongoose.model('FoodNotification', notificationSchema);

// Run once after connecting: replace the old broken unique index with the partial one.
export async function fixNotificationIndexes() {
    try {
        const coll = FoodNotification.collection;
        const indexes = await coll.indexes().catch(() => []);
        const old = indexes.find((i) => i.name === 'broadcastId_1_ownerType_1_ownerId_1' && !i.partialFilterExpression);
        if (old) await coll.dropIndex(old.name);
        if (!indexes.some((i) => i.name === BROADCAST_INDEX) || old) {
            await coll.createIndex(
                { broadcastId: 1, ownerType: 1, ownerId: 1 },
                { name: BROADCAST_INDEX, unique: true, partialFilterExpression: { broadcastId: { $type: 'objectId' } } }
            );
        }
    } catch (error) {
        console.error('[notifications] index fix failed:', error?.message || error);
    }
}
