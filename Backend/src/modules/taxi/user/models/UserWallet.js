import { FoodUserWallet, ensureSharedUserWallet } from '../../../food/user/models/userWallet.model.js';

/**
 * Taxi uses the same shared user wallet collection: `user_wallets`.
 * One balance for food + taxi.
 */
export const UserWallet = FoodUserWallet;
export { ensureSharedUserWallet };

export default UserWallet;
