/**
 * Creates every collection (and every declared index) that the current Food + Taxi + core models define but
 * that does not exist in Mongo yet. Mongoose normally creates a collection the first time its model is used, so
 * a few collections only appear after some admin / app flow has touched them (account deletions, admin panel
 * state, restaurant menus...). Running this once makes the database complete up front.
 *
 * Never drops or changes anything that exists: it only adds missing collections and missing indexes.
 * The dry run only reads (plain MongoClient) — it does not open a mongoose connection, because that alone would
 * auto-create every registered model's collection.
 *
 * Usage (from Backend/):
 *   npm run db:ensure-collections -- --dry-run   # list what would be created
 *   npm run db:ensure-collections                # create the missing collections + indexes
 *   MONGODB_URI=<other db> npm run db:ensure-collections
 */
import dns from 'dns';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import mongoose from 'mongoose';
import { config } from '../src/config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(__dirname, '..', 'src');
const dryRun = process.argv.includes('--dry-run');

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

const keyOf = (key) => JSON.stringify(Object.entries(key || {}));

/** name -> Set of index keys, for every collection that exists right now. */
const readState = async (db) => {
  const names = (await db.listCollections({}, { nameOnly: true }).toArray())
    .map((c) => c.name)
    .filter((name) => !name.startsWith('system.'));
  const state = new Map();
  for (const name of names) {
    const indexes = await db.collection(name).indexes();
    state.set(name, new Set(indexes.map((idx) => keyOf(idx.key))));
  }
  return state;
};

const run = async () => {
  const importErrors = [];
  for (const file of walk(srcRoot).filter(isModelFile)) {
    try {
      await import(pathToFileURL(file).href);
    } catch (error) {
      importErrors.push({ file: path.relative(srcRoot, file), error: error.message });
    }
  }

  const dnsServers = String(config.mongodbDnsServers || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (dnsServers.length) {
    try { dns.setServers(dnsServers); } catch { /* ignore */ }
  }

  const models = mongoose.modelNames().sort().map((name) => mongoose.model(name));

  const client = new mongoose.mongo.MongoClient(config.mongodbUri, { serverSelectionTimeoutMS: 30000 });
  await client.connect();
  const before = await readState(client.db());
  console.log(`Database: ${client.db().databaseName}${dryRun ? '  (dry run - nothing is written)' : ''}`);
  await client.close();

  const wantedIndexes = (model) => model.schema.indexes().map(([fields]) => keyOf(fields));
  const problems = [];
  const createdCollections = [];
  const addedIndexes = [];

  if (dryRun) {
    for (const model of models) {
      const collection = model.collection.name;
      if (!before.has(collection)) {
        createdCollections.push(`${collection}  <- ${model.modelName}`);
      }
      const present = before.get(collection) || new Set();
      const missing = wantedIndexes(model).filter((key) => !present.has(key));
      if (missing.length) addedIndexes.push(`${collection}: ${missing.length} index(es)`);
    }
  } else {
    await mongoose.connect(config.mongodbUri, { serverSelectionTimeoutMS: 30000 });
    for (const model of models) {
      const collection = model.collection.name;
      try {
        if (!before.has(collection)) {
          await model.createCollection();
          createdCollections.push(`${collection}  <- ${model.modelName}`);
        }
      } catch (error) {
        problems.push(`create ${collection}: ${error.message}`);
        continue;
      }

      const present = before.get(collection) || new Set();
      const missing = wantedIndexes(model).filter((key) => !present.has(key));
      if (missing.length === 0) continue;

      try {
        await model.createIndexes();
        addedIndexes.push(`${collection}: ${missing.length} index(es)`);
      } catch (error) {
        problems.push(`indexes ${collection}: ${error.message}`);
      }
    }
  }

  console.log(`\nCollections ${dryRun ? 'that would be created' : 'created'} (${createdCollections.length})`);
  createdCollections.forEach((line) => console.log(`  + ${line}`));
  console.log(`\nIndexes ${dryRun ? 'that would be added' : 'added'} on ${addedIndexes.length} collection(s)`);
  addedIndexes.forEach((line) => console.log(`  + ${line}`));

  if (importErrors.length) {
    console.log(`\nModel files that could not be imported (${importErrors.length}):`);
    importErrors.forEach((item) => console.log(`  ! ${item.file}: ${item.error}`));
  }
  if (problems.length) {
    console.log(`\nProblems (${problems.length}):`);
    problems.forEach((line) => console.log(`  ! ${line}`));
    process.exitCode = 1;
  }

  if (createdCollections.length === 0 && addedIndexes.length === 0 && problems.length === 0) {
    console.log('\nNothing to do - every registered collection and index already exists.');
  }
};

run()
  .catch((error) => {
    console.error('ensure-collections failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });
