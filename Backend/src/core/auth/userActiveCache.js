/**
 * Short-lived memory of "is this customer account still active".
 *
 * Both auth middlewares (Food and Taxi) used to read the user from the database on EVERY customer request just
 * to check the active flags. A single screen fires 10-20 requests, so that was 10-20 extra database round trips
 * per screen. The answer is now remembered for a few seconds; anything that blocks / deletes / restores an
 * account calls `invalidateUserActive` so the change still takes effect on the very next request.
 *
 * Food and Taxi judge "active" slightly differently (Taxi also looks at `active` / `deletedAt`), so each keeps
 * its own entry per user (`scope`).
 */
const TTL_MS = 15_000;
const MAX_ENTRIES = 5000;
const SCOPES = ['food', 'taxi'];

const entries = new Map(); // "scope:userId" -> { ok: boolean, message: string, at: number }
const keyOf = (scope, userId) => `${scope}:${String(userId)}`;

export const readUserActive = (userId, scope = 'food') => {
    const key = keyOf(scope, userId);
    const entry = entries.get(key);
    if (!entry) return null;
    if (Date.now() - entry.at > TTL_MS) {
        entries.delete(key);
        return null;
    }
    return entry;
};

export const rememberUserActive = (userId, ok, message = '', scope = 'food') => {
    if (entries.size >= MAX_ENTRIES) {
        // Drop the oldest entry (Map keeps insertion order).
        entries.delete(entries.keys().next().value);
    }
    const key = keyOf(scope, userId);
    entries.delete(key);
    entries.set(key, { ok, message, at: Date.now() });
};

export const invalidateUserActive = (userId) => {
    SCOPES.forEach((scope) => entries.delete(keyOf(scope, userId)));
};
