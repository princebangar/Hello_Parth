/**
 * Drop Hello Parth's old food-only Mongo collections.
 * NEVER drops taxi/identity collections: users, admins, taxidrivers, taxi*.
 *
 * Usage (from Backend folder):
 *   node scripts/drop-old-food-collections.js --dry-run
 *   node scripts/drop-old-food-collections.js --confirm
 */
import mongoose from 'mongoose';
import { config } from '../src/config/env.js';

const PROTECTED = new Set([
  'users',
  'admins',
  'taxidrivers',
  'payments',
  'transactions',
  'refunds',
  'settlements',
]);

const isProtected = (name) => {
  const n = String(name || '');
  if (PROTECTED.has(n)) return true;
  if (n.startsWith('taxi')) return true;
  if (n.startsWith('Taxi')) return true;
  return false;
};

const isFoodCollection = (name) => {
  const n = String(name || '');
  if (isProtected(n)) return false;
  return n.startsWith('food_') || n === 'delivery_selfie_logs' || n === 'account_deletions';
};

const dryRun = process.argv.includes('--dry-run') || !process.argv.includes('--confirm');

const run = async () => {
  const uri = config.mongodbUri || process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error('Missing Mongo URI');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const collections = await mongoose.connection.db.listCollections().toArray();
  const names = collections.map((c) => c.name).sort();

  console.log('All collections:', names.join(', '));
  const toDrop = names.filter(isFoodCollection);
  const kept = names.filter((n) => !toDrop.includes(n));

  console.log('\nKEEP (taxi/identity/other):', kept.join(', ') || '(none)');
  console.log('\nDROP (food-only):', toDrop.join(', ') || '(none)');

  if (dryRun) {
    console.log('\nDry run only. Re-run with --confirm to drop.');
    await mongoose.disconnect();
    return;
  }

  for (const name of toDrop) {
    if (isProtected(name)) {
      console.warn('SKIP protected', name);
      continue;
    }
    await mongoose.connection.db.collection(name).drop();
    console.log('Dropped', name);
  }

  await mongoose.disconnect();
  console.log('Done.');
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
