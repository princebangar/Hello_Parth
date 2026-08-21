import mongoose from 'mongoose';

/**
 * Shared user wallet for Food + Taxi (one balance per userId).
 * Collection: user_wallets
 *
 * Accepts both food txn shape (type/description) and taxi shape (kind/title).
 */
const walletTransactionSchema = new mongoose.Schema(
    {
        // Food style
        type: {
            type: String,
            enum: ['addition', 'deduction', 'refund', 'credit', 'debit'],
            required: false,
        },
        description: { type: String, default: '' },
        status: { type: String, default: 'Completed' },
        metadata: { type: Object, default: {} },
        razorpayOrderId: { type: String, default: null },
        razorpayPaymentId: { type: String, default: null },
        razorpaySignature: { type: String, default: null },

        // Taxi style
        kind: {
            type: String,
            enum: ['credit', 'debit'],
            required: false,
        },
        title: { type: String, default: '', trim: true },
        counterpartyPhone: { type: String, default: '', trim: true },
        provider: { type: String, default: '', trim: true },
        providerOrderId: { type: String, default: '', trim: true },
        providerPaymentId: { type: String, default: '', trim: true },
        referenceKey: { type: String, default: '', trim: true },

        amount: { type: Number, required: true },
    },
    { timestamps: true }
);

const userWalletSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true, index: true },
        balance: { type: Number, default: 0, min: 0 },
        referralEarnings: { type: Number, default: 0 },
        refundWallet: { type: Number, default: 0, min: 0 },
        transactions: { type: [walletTransactionSchema], default: [] },
    },
    { collection: 'user_wallets', timestamps: true }
);

export const FoodUserWallet =
    mongoose.models.FoodUserWallet || mongoose.model('FoodUserWallet', userWalletSchema);

/** Alias — shared user wallet (food + taxi). */
export const UserWallet = FoodUserWallet;

/** Ensure shared `user_wallets` doc exists for this user. */
export const ensureSharedUserWallet = async (userId) => {
    if (!userId || !mongoose.Types.ObjectId.isValid(String(userId))) return null;
    const oid = new mongoose.Types.ObjectId(String(userId));

    const existing = await FoodUserWallet.findOne({ userId: oid });
    if (existing) return existing;

    return FoodUserWallet.create({
        userId: oid,
        balance: 0,
        refundWallet: 0,
        referralEarnings: 0,
        transactions: [],
    });
};
