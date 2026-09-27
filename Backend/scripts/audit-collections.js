/**
 * READ-ONLY audit: compares the collections that the current code registers
 * (Food + Taxi + core models) with the collections that actually exist in Mongo.
 *
 * It never calls mongoose.connect() (that would auto-create every registered
 * model's collection); it only lists collections through a plain MongoClient.
 *
 * Usage (from Backend folder):
 *   node scripts/audit-collections.js
 *   node scripts/audit-collections.js --json     # machine-readable output
 */
import dns from 'dns';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import mongoose from 'mongoose';
import { config } from '../src/config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(__dirname, '..', 'src');
const asJson = process.argv.includes('--json');

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
  const modelFiles = walk(srcRoot).filter(isModelFile);
  const importErrors = [];
  for (const file of modelFiles) {
    try {
      await import(pathToFileURL(file).href);
    } catch (error) {
      importErrors.push({ file: path.relative(srcRoot, file), error: error.message });
    }
  }

  const registered = new Map();
  for (const modelName of mongoose.modelNames()) {
    registered.set(mongoose.model(modelName).collection.name, modelName);
  }

  const dnsServers = String(config.mongodbDnsServers || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (dnsServers.length) {
    try { dns.setServers(dnsServers); } catch { /* ignore */ }
  }

  const client = new mongoose.mongo.MongoClient(config.mongodbUri, { serverSelectionTimeoutMS: 30000 });
  await client.connect();
  const db = client.db();

  const existing = (await db.listCollections({}, { nameOnly: true }).toArray())
    .map((c) => c.name)
    .filter((name) => !name.startsWith('system.'))
    .sort();

  const rows = [];
  for (const name of existing) {
    rows.push({
      name,
      docs: await db.collection(name).estimatedDocumentCount(),
      model: registered.get(name) || null,
    });
  }
  const missing = [...registered.keys()].filter((name) => !existing.includes(name)).sort();

  // Index drift: indexes that exist in Mongo but are not declared by the current schema
  // (left over from an older schema — a stale UNIQUE one silently blocks inserts), and
  // indexes the schema declares that Mongo does not have yet.
  const keyOf = (key) => JSON.stringify(Object.entries(key || {}));
  const indexDrift = [];
  for (const row of rows.filter((r) => r.model)) {
    const model = mongoose.model(row.model);
    const wanted = new Map(model.schema.indexes().map(([fields, options]) => [keyOf(fields), options || {}]));
    const actual = (await db.collection(row.name).indexes()).filter((idx) => idx.name !== '_id_');
    const actualKeys = new Set(actual.map((idx) => keyOf(idx.key)));
    const extra = actual.filter((idx) => !wanted.has(keyOf(idx.key)));
    const notYetBuilt = [...wanted.keys()].filter((k) => !actualKeys.has(k));
    if (extra.length || notYetBuilt.length) {
      indexDrift.push({
        collection: row.name,
        model: row.model,
        staleInDb: extra.map((idx) => ({ name: idx.name, key: idx.key, unique: Boolean(idx.unique) })),
        missingInDb: notYetBuilt.map((k) => JSON.parse(k)),
      });
    }
  }
  await client.close();

  const result = {
    database: db.databaseName,
    modelFilesScanned: modelFiles.length,
    importErrors,
    inUse: rows.filter((r) => r.model),
    orphaned: rows.filter((r) => !r.model),
    registeredButNotCreatedYet: missing.map((name) => ({ name, model: registered.get(name) })),
    indexDrift,
  };

  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const print = (title, list, fmt) => {
    console.log(`\n=== ${title} (${list.length}) ===`);
    list.forEach((item) => console.log(fmt(item)));
  };

  console.log(`Database: ${result.database} | model files scanned: ${result.modelFilesScanned}`);
  if (importErrors.length) print('IMPORT ERRORS', importErrors, (e) => `  ${e.file}: ${e.error}`);
  print('IN USE by current code', result.inUse, (r) => `  ${r.name.padEnd(46)} docs=${String(r.docs).padEnd(7)} <- ${r.model}`);
  print('ORPHANED (exists in DB, no current model uses it)', result.orphaned, (r) => `  ${r.name.padEnd(46)} docs=${r.docs}`);
  print('REGISTERED but not created yet (empty / never written)', result.registeredButNotCreatedYet, (r) => `  ${r.name.padEnd(46)} <- ${r.model}`);
  print('INDEX DRIFT (stale = in DB only, missing = schema only)', result.indexDrift, (d) =>
    `  ${d.collection}\n` +
    d.staleInDb.map((i) => `      STALE   ${i.unique ? 'UNIQUE ' : ''}${i.name} ${JSON.stringify(i.key)}`).join('\n') +
    (d.staleInDb.length && d.missingInDb.length ? '\n' : '') +
    d.missingInDb.map((k) => `      MISSING ${JSON.stringify(Object.fromEntries(k))}`).join('\n'));
};

run().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
