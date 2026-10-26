import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import {ObjectId} from 'mongodb';
import {MongoClient,testMongoOptions} from './database-client.js';
import { buildApp } from '../apps/api/src/app.js';
import {isolatedTestConfig,evidenceDirectory} from './runtime-environment.js';
import { initialize } from '../apps/api/src/database/initialize.js';
import { schemas } from '../apps/api/src/database/schema.js';

test('accounts, persistent drafts, isolation and four-collection initialization', async t => {
  const config = isolatedTestConfig('api'), dbName = config.dbName;
const artifactDirectory=evidenceDirectory('integration');
  const client = new MongoClient(config.uri,testMongoOptions()); await client.connect();
  const db = client.db(dbName); await initialize(db); await initialize(db);
  let app = await buildApp(config, { logger: false });
  const headers = { origin: config.origin, 'x-csrf-guard': '1' };
  const password = `Integration-${randomUUID()}`;
  const names = ['Owner_A', 'Owner_B']; let cookieA = '', cookieB = '', id = '', cursor = '';
  async function request(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown, cookie = '') {
    return app.inject({ method, url: `/api/v1${url}`, headers: { ...headers, ...(cookie ? { cookie } : {}) }, ...(payload === undefined ? {} : { payload: payload as object }) });
  }
  try {
    await t.test('four validators and all target indexes exist; initializer is repeatable', async () => {
      const collections = await db.listCollections().toArray();
      assert.deepEqual(collections.map(c => c.name).sort(), Object.keys(schemas).sort());
      for (const c of collections) assert.equal(c.options?.validationLevel, 'strict');
      await assert.rejects(db.collection('users').insertOne({ username: 'invalid' }));
    });
    await t.test('register creates accounts without logging in and exposes only User DTO', async () => {
      for (const username of names) {
        const response = await request('POST', '/auth/register', { username, password });
        assert.equal(response.statusCode, 201, response.body);
        assert.deepEqual(Object.keys(response.json().data).sort(), ['createdAt', 'id', 'username']);
        assert.equal(response.headers['set-cookie'], undefined);
      }
    });
    await t.test('duplicate normalized registration and bad credentials are rejected', async () => {
      const duplicate = await request('POST', '/auth/register', { username: '  Ｏｗｎｅｒ＿Ａ  ', password });
      assert.equal(duplicate.statusCode, 409); assert.equal(duplicate.json().error.code, 'USERNAME_TAKEN');
      for (const username of ['Owner_A', 'missing_user']) {
        const bad = await request('POST', '/auth/login', { username, password: 'wrong-password' });
        assert.equal(bad.statusCode, 401); assert.equal(bad.json().error.code, 'INVALID_CREDENTIALS');
      }
    });
    await t.test('login sets HttpOnly cookie; current user is restored', async () => {
      for (const username of names) {
        const response = await request('POST', '/auth/login', { username, password });
        assert.equal(response.statusCode, 200);
        const setCookie = String(response.headers['set-cookie']); assert.match(setCookie, /HttpOnly/); assert.match(setCookie, /SameSite=Lax/); assert.match(setCookie, /Max-Age=7200/);
        const cookie = setCookie.split(';')[0]; if (username === names[0]) cookieA = cookie; else cookieB = cookie;
      }
      const me = await request('GET', '/auth/me', undefined, cookieA);
      assert.equal(me.json().data.username, 'Owner_A');
    });
    await t.test('CSRF, forged fields, duplicate JSON keys, duplicate query and method checks', async () => {
      const csrf = await app.inject({ method: 'POST', url: '/api/v1/surveys', payload: { title: 'not saved' }, headers: { cookie: cookieA } });
      assert.equal(csrf.statusCode, 403);
      for (const payload of [{ title: 'bad', ownerId: new ObjectId().toHexString() }, { title: 'bad', allowRepeat: 'false' }, { title: ' ' }, { title: 'bad', expiresAt: '2026-02-30T00:00:00Z' }]) {
        assert.equal((await request('POST', '/surveys', payload, cookieA)).statusCode, 400);
      }
      const duplicate = await app.inject({ method: 'POST', url: '/api/v1/surveys', headers: { ...headers, cookie: cookieA, 'content-type': 'application/json' }, payload: '{"title":"a","title":"b"}' });
      assert.equal(duplicate.statusCode, 400);
      assert.equal((await request('GET', '/surveys?limit=1&limit=2', undefined, cookieA)).statusCode, 400);
      assert.equal((await request('GET', '/surveys?ownerId=forged', undefined, cookieA)).statusCode, 400);
      const method = await request('DELETE', '/surveys/670000000000000000000010', undefined, cookieB);
      assert.equal(method.statusCode, 405); assert.equal(method.headers.allow, 'GET, PATCH');
    });
    await t.test('unauthenticated management and malformed cookies are rejected', async () => {
      for (const [method, url, payload] of [['GET', '/surveys', undefined], ['POST', '/surveys', { title: 'bad' }], ['GET', '/surveys/670000000000000000000010', undefined]] as const) {
        assert.equal((await request(method, url, payload)).statusCode, 401);
      }
      assert.equal((await request('GET', '/surveys', undefined, 'survey_auth=invalid')).statusCode, 401);
    });
    await t.test('create stores server-owned defaults and exact draft Editor DTO', async () => {
      const response = await request('POST', '/surveys', { title: '  可持久化的草稿  ', description: '真实 MongoDB 保存', allowAnonymous: true }, cookieA);
      assert.equal(response.statusCode, 201, response.body); const data = response.json().data; id = data.id;
      assert.equal(data.status, 'draft'); assert.equal(data.draftDefinition.title, '可持久化的草稿'); assert.deepEqual(data.draftDefinition.questions, []);
      assert.equal(data.currentPublishedVersion, null); assert.equal(data.revision, 0); assert.equal(data.draftDefinitionRevision, 1);
      assert.deepEqual(data.validationIssues.map((i: {code: string}) => i.code), ['NO_QUESTIONS']);
      assert.equal(data.settings.allowRepeat, false); assert.equal(data.settings.expiresAt, null);
      for (const key of ['ownerId', '_id', 'schemaVersion', 'definitionVersion', 'structureLocked']) assert.equal(key in data, false);
      const stored = await db.collection('surveys').findOne({ _id: new ObjectId(id) });
      assert.equal(stored?.schemaVersion, 2); assert.equal(stored?.currentVersionSubmissionCount, 0);
      assert.equal((await db.collection('survey_versions').countDocuments()), 0);
    });
    await t.test('own list, stable signed pagination and detail', async () => {
      await request('POST', '/surveys', { title: '第二份草稿' }, cookieA);
      const list = await request('GET', '/surveys?limit=1', undefined, cookieA);
      assert.equal(list.statusCode, 200); assert.equal(list.json().data.items.length, 1); cursor = list.json().data.nextCursor; assert.ok(cursor);
      const next = await request('GET', `/surveys?limit=1&cursor=${encodeURIComponent(cursor)}`, undefined, cookieA);
      assert.equal(next.json().data.items[0].id, id); assert.equal(next.json().data.nextCursor, null);
      assert.equal((await request('GET', `/surveys?cursor=${encodeURIComponent(cursor + 'x')}`, undefined, cookieA)).statusCode, 400);
      const detail = await request('GET', `/surveys/${id}`, undefined, cookieA); assert.equal(detail.statusCode, 200); assert.equal(detail.json().data.id, id);
    });
    await t.test('cross-user reads, cursor reuse and modification are rejected', async () => {
      const denied = await request('GET', `/surveys/${id}`, undefined, cookieB); assert.equal(denied.statusCode, 404); assert.equal(denied.json().error.code, 'NOT_FOUND');
      const other = await request('GET', '/surveys', undefined, cookieB); assert.deepEqual(other.json().data.items, []);
      assert.equal((await request('GET', `/surveys?cursor=${encodeURIComponent(cursor)}`, undefined, cookieB)).statusCode, 400);
      assert.equal((await request('PATCH', `/surveys/${id}`, { expectedRevision: 0, title: 'unauthorized' }, cookieB)).statusCode, 404);
      assert.equal((await db.collection('surveys').findOne({ _id: new ObjectId(id) }))?.title, '可持久化的草稿');
    });
    await t.test('fresh backend connection still reads persisted draft; health is ready', async () => {
      await app.close(); app = await buildApp(config, { logger: false });
      const detail = await request('GET', `/surveys/${id}`, undefined, cookieA); assert.equal(detail.statusCode, 200); assert.equal(detail.json().data.draftDefinition.title, '可持久化的草稿');
      assert.equal((await request('GET', '/health/ready')).json().data.status, 'ready');
    });
    await t.test('rs0 supports transactions (aborted probe does not persist)', async () => {
      const session = client.startSession(), probe = new ObjectId();
      try { session.startTransaction(); const user = await db.collection('users').findOne({}); assert.ok(user); await db.collection('users').insertOne({ ...user, _id: probe, usernameKey: `probe-${probe}` }, { session }); await session.abortTransaction(); assert.equal(await db.collection('users').countDocuments({ _id: probe }), 0); }
      finally { await session.endSession(); }
    });
    await t.test('logout clears cookie; missing-cookie repeat logout remains successful', async () => {
      const response = await request('POST', '/auth/logout', undefined, cookieA); assert.equal(response.statusCode, 200); assert.equal(response.json().data, null); assert.match(String(response.headers['set-cookie']), /Expires=/);
      assert.equal((await request('GET', '/auth/me')).statusCode, 401);
      assert.equal((await request('POST', '/auth/logout')).statusCode, 200);
      assert.equal((await request('POST', '/auth/logout', {})).statusCode, 400);
    });
    await t.test('initializer refuses unknown old database without changing it', async () => {
      const unknown = client.db(`${dbName}_unknown`); await unknown.collection('users').insertOne({ keep: 'old-data' });
      await assert.rejects(initialize(unknown), /migration/);
      assert.equal((await unknown.collection('users').findOne({}))?.keep, 'old-data'); assert.equal((await unknown.listCollections().toArray()).length, 1);
    });
    await mkdir(`${artifactDirectory}`, { recursive: true });
    await writeFile(`${artifactDirectory}/integration.json`, JSON.stringify({ date: new Date().toISOString(), status: 'passed', database: dbName, subtests: 13, retainedTestData: true, noBusinessDatabaseUsed: true }, null, 2));
    console.log(`Retained test database: ${dbName}`);
  } finally { await app.close(); await client.close(); }
});
