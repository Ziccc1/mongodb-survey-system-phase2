import type { Db } from 'mongodb';
import { baselineRegistry } from './schema-registry.js';
const { schemas, indexSpecs } = baselineRegistry;
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  return JSON.stringify(value);
}
export async function verifySchema(db: Db, allowMissing = false) {
  const existing = await db.listCollections({}, { nameOnly: false }).toArray();
  for (const collection of existing) {
    if (!(collection.name in schemas)) throw new Error('Unknown collection: reviewed migration required');
    const expected = schemas[collection.name as keyof typeof schemas];
    if (stable(collection.options?.validator) !== stable({ $jsonSchema: expected }) || collection.options?.validationLevel !== 'strict' || collection.options?.validationAction !== 'error') throw new Error('Existing validator mismatch: reviewed migration required');
  }
  if (!allowMissing && existing.length !== 4) throw new Error('Four initialized collections required');
  for (const [name, specs] of Object.entries(indexSpecs)) {
    if (!existing.some(c => c.name === name)) continue;
    const indexes = await db.collection(name).indexes();
    for (const spec of specs) {
      const actual = indexes.find(index => index.name === spec.name);
      if (!actual && allowMissing) continue;
      if (!actual || JSON.stringify(actual.key) !== JSON.stringify(spec.key) || !!actual.unique !== !!spec.unique || stable(actual.partialFilterExpression) !== stable(spec.partialFilterExpression)) throw new Error('Index mismatch or missing; reviewed initialization required');
    }
    if (indexes.some(index => index.name !== '_id_' && !specs.some(spec => spec.name === index.name))) throw new Error('Unknown index requires review');
  }
}
export async function initialize(db: Db) {
  const hello = await db.admin().command({ hello: 1 });
  if (hello.setName !== 'rs0' || !hello.isWritablePrimary) throw new Error('Local rs0 primary required');
  // Validate every existing collection before any write. Never collMod, drop or migrate data.
  await verifySchema(db, true);
  const existing = await db.listCollections({}, { nameOnly: true }).toArray();
  for (const [name, schema] of Object.entries(schemas)) {
    if (!existing.some(c => c.name === name)) await db.createCollection(name, { validator: { $jsonSchema: schema }, validationLevel: 'strict', validationAction: 'error' });
    for (const { key, ...options } of indexSpecs[name]) await db.collection(name).createIndex(key, options);
  }
  await verifySchema(db);
}
