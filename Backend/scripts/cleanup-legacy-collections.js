/**
 * Drops MongoDB collections that no current Mongoose model uses any more (left over from the
 * old Taxi project or from features that were removed, e.g. Rental / Airport / Service Center).
 *
 * Safety rules:
 *  - a collection is only a candidate if NO model registered by the current code maps to it
 *    (Food, core and Taxi models are all scanned) — so live collections can never match;
 *  - dry run by default; nothing is touched without --confirm;
 *  - every document is written to backups/legacy-collections-<timestamp>/<name>.json BEFORE the drop;
 *  - non-empty collections are skipped unless --include-nonempty is passed (their data is backed up too).
 *
 * Never calls mongoose.connect() (that would auto-create every registered collection).
 *
 * Usage (from the Backend folder):
 *   node scripts/cleanup-legacy-collections.js                      # dry run
 *   node scripts/cleanup-legacy-collections.js --confirm            # drop empty orphans
 *   node scripts/cleanup-legacy-collections.js --confirm --include-nonempty
 */
import dns from 'dns';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import mongoose from 'mongoose';
import { config } from '../src/config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');
const srcRoot = path.join(backendRoot, 'src');

const CONFIRM = process.argv.includes('--confirm');
const INCLUDE_NONEMPTY = process.argv.includes('--include-nonempty');

// Extra guard on top of "no model uses it": never drop these names, whatever happens.
const NEVER_DROP = new Set(['users', 'admins', 'payments', 'transactions', 'refunds', 'settlements']);
const isNeverDrop = (name) => NEVER_DROP.has(name) || name.startsWith('food_') || name.startsWith('system.');

const walk = (dir, out = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
};

const isModelFile = (file) => {
  const normalized = file.split(path.sep).join('/');
  if (!/mongoose\.model\(|\bmodel\(\s*['"]/.test(fs.readFileSync(file, 'utf8'))) return false;
  return /\/models\//.test(normalized) || /\.model\.js$/.test(normalized);
};

const run = async () => {
  for (const file of walk(srcRoot).filter(isModelFile)) {
    await import(pathToFileURL(file).href);
  }

  const registered = new Set(mongoose.modelNames().map((name) => mongoose.model(name).collection.name));
  if (registered.size < 50) {
    throw new Error(`Only ${registered.size} model collections were discovered — refusing to continue (model scan looks incomplete).`);
  }

  const dnsServers = String(config.mongodbDnsServers || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (dnsServers.length) {
    try { dns.setServers(dnsServers); } catch { /* ignore */ }
  }

  const client = new mongoose.mongo.MongoClient(config.mongodbUri, { serverSelectionTimeoutMS: 30000 });
  await client.connect();
  const db = client.db();

  const existing = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name).sort();
  const orphans = existing.filter((name) => !registered.has(name) && !isNeverDrop(name));

  console.log(`Database: ${db.databaseName}`);
  console.log(`Collections in DB: ${existing.length} | used by current models: ${registered.size} | orphaned: ${orphans.length}`);

  const backupDir = path.join(backendRoot, 'backups', `legacy-collections-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  let dropped = 0;

  for (const name of orphans) {
    const collection = db.collection(name);
    const count = await collection.estimatedDocumentCount();
    const droppable = count === 0 || INCLUDE_NONEMPTY;
    console.log(`  ${droppable ? (CONFIRM ? 'DROP ' : 'would drop') : 'SKIP (has data)'}  ${name}  docs=${count}`);

    if (!CONFIRM || !droppable) continue;

    if (count > 0) {
      fs.mkdirSync(backupDir, { recursive: true });
      const docs = await collection.find({}).toArray();
      fs.writeFileSync(path.join(backupDir, `${name}.json`), JSON.stringify(docs, null, 2));
      console.log(`     backed up ${docs.length} document(s) -> ${path.relative(backendRoot, path.join(backupDir, `${name}.json`))}`);
    }

    await collection.drop();
    dropped += 1;
  }

  await client.close();
  console.log(CONFIRM ? `\nDropped ${dropped} collection(s).` : '\nDry run only. Re-run with --confirm to drop the ones marked "would drop".');
};

run().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
