import { getPageCache, setPageCache, userScopedCacheKey } from './pageCache.js';

/**
 * Wallet data, fetched the moment a finger / pointer lands on the wallet icon - before the click has even finished and
 * before the wallet screen's code has loaded. The wallet screens read the same cache, so the balance is already there
 * when the screen opens (they still refresh it quietly afterwards).
 *
 * The cache keys and shapes are the ones the two wallet screens use:
 *   Food  -> "food_wallet"  = the wallet object            (modules/Food/pages/user/Wallet.jsx)
 *   Taxi  -> "taxi_wallet"  = { balance, currency, recentTransactions }  (modules/Taxi/modules/user/pages/Wallet.jsx)
 */
const MIN_GAP_MS = 15 * 1000;
const lastAt = { food: 0, taxi: 0 };
const inflight = { food: null, taxi: null };

const run = (vertical, load) => {
  if (inflight[vertical]) return inflight[vertical];
  if (Date.now() - lastAt[vertical] < MIN_GAP_MS && getPageCache(userScopedCacheKey(`${vertical}_wallet`))) {
    return Promise.resolve();
  }
  inflight[vertical] = load()
    .then(() => {
      lastAt[vertical] = Date.now();
    })
    .catch(() => {})
    .finally(() => {
      inflight[vertical] = null;
    });
  return inflight[vertical];
};

export function prefetchWallet(vertical) {
  if (vertical === 'taxi') {
    return run('taxi', async () => {
      const { userAuthService } = await import('../../modules/Taxi/modules/user/services/authService.js');
      const response = await userAuthService.getWallet();
      const data = response?.data || {};
      setPageCache(userScopedCacheKey('taxi_wallet'), {
        balance: Number(data.balance || 0),
        currency: data.currency || 'INR',
        recentTransactions: Array.isArray(data.recentTransactions) ? data.recentTransactions : [],
      });
    });
  }

  return run('food', async () => {
    const { userAPI } = await import('../../services/api/index.js');
    const response = await userAPI.getWallet();
    const wallet = response?.data?.data?.wallet || response?.data?.wallet;
    if (wallet) setPageCache(userScopedCacheKey('food_wallet'), wallet);
  });
}
