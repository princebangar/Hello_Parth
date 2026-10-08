/**
 * How long an inbox notification lives in the database (all four apps: Food user / restaurant / delivery partner and
 * Taxi rider / driver). MongoDB's TTL monitor deletes the document by itself ~1 minute after it turns this old.
 */
export const NOTIFICATION_RETENTION_DAYS = 3;
export const NOTIFICATION_RETENTION_SECONDS = NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60;
