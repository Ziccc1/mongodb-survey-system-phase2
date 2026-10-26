import { registerReporting } from "./core/reporting.js";
import { registerSubmission } from "./core/submission.js";
import { registerPublication } from './core/publication.js';
import type { FaultHooks } from './core/common.js';
import { loadEditor, registerEditingRoutes } from './survey-editing.js';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import staticFiles from '@fastify/static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { MongoClient, ObjectId, MongoServerError } from 'mongodb';
import { codePointLength, normalizeUsername, credentialsSchema, createSurveySchema, surveyTextIssues } from '@survey/shared';
import type { Credentials, CreateSurvey } from '@survey/shared';
import type { Config } from './config.js';
import { validateDatabaseTarget,validatePhase2ApplicationTarget } from './config.js';
import {verifyPhase2Database} from './database/phase2-initialize.js';
import {openPhase2ApplicationContext} from './database/phase2-context.js';
import {registerLibraryRoutes,libraryEndpoints} from './core/library-routes.js';
import {registerCrossStatistics,crossEndpoints} from './core/cross-statistics-routes.js';
import {registerTemplateRoutes,templateEndpoints} from './core/template-routes.js';
import type { UserDocument, SurveyDocument } from './database/models.js';
import { verifySchema } from './database/initialize.js';
import { assertOwnedDatabaseInstance, verifyConnectedDatabaseInstance } from './database/instance-ownership.js';
import { userDto, editorDto, summaryDto } from './dto.js';
import {databaseClientOptions} from './database/credentials.js';
import { ApiError, invalid } from './errors.js';
import { hashPassword, verifyPassword, signAuth, readAuth, encodeCursor, decodeCursor, parseUniqueJson } from './security.js';

export async function buildApp(config: Config, options: { logger?: boolean; faults?: FaultHooks } = {}) {
  return buildRuntime(config,options,false);
}
export async function buildPhase2App(config:Config,options:{logger?:boolean;faults?:FaultHooks}={}) {
  return buildRuntime(config,options,true);
}
async function buildRuntime(config:Config,options:{logger?:boolean;faults?:FaultHooks},phase2:boolean) {
  if(phase2)validatePhase2ApplicationTarget(config.uri,config.dbName);else validateDatabaseTarget(config.uri, config.dbName);
  const ownedInstance = assertOwnedDatabaseInstance();
  const app = Fastify({ logger: options.logger ?? true, bodyLimit: 2097152, genReqId: () => randomUUID(), ajv: { customOptions: { removeAdditional: false, coerceTypes: false, useDefaults: false } } });
  const client = new MongoClient(config.uri, { ...databaseClientOptions(config.databaseAuth),serverSelectionTimeoutMS: 3000,monitorCommands:!!options.faults?.reportCommand });
  if(options.faults?.reportCommand)client.on('commandStarted',e=>options.faults!.reportCommand!({name:e.commandName,readConcern:e.command.readConcern,transaction:e.command.autocommit===false}));
  try {
    await client.connect();
    await verifyConnectedDatabaseInstance(client, ownedInstance);
    if(phase2)await verifyPhase2Database(client.db(config.dbName));else await verifySchema(client.db(config.dbName));
  } catch (error) {
    await client.close();
    await app.close();
    throw error;
  }
  const db = client.db(config.dbName);
  const phase2Context=phase2?await openPhase2ApplicationContext({uri:config.uri,dbName:config.dbName,databaseAuth:config.databaseAuth},options.faults):null;
  const users = db.collection<UserDocument>('users'), surveys = db.collection<SurveyDocument>('surveys');
  const dummyHash = await hashPassword(randomBytes(32).toString('hex'));
  app.addHook('onClose', async () => { await phase2Context?.close();await client.close(); });
  app.get('/app-config.js', async (_request, reply) => {
    reply.type('application/javascript').header('Cache-Control','no-store');
    return `window.__SURVEY_CONFIG__=${JSON.stringify({publicAppUrl:config.publicAppUrl ?? config.origin,...(phase2?{libraryEnabled:true}:{})}).replaceAll('<','\\u003c')};`;
  });
  await app.register(cookie);
  await app.register(rateLimit, { max: 180, timeWindow: '1 minute', errorResponseBuilder: () => ({ statusCode: 429, code: 'RATE_LIMITED', error: 'Too Many Requests', message: '请求过于频繁，请稍后重试' }) });
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_request, body, done) => {
    try { done(null, parseUniqueJson(body as string)); } catch { done(invalid()); }
  });
  app.addHook('onRequest', async (request, reply) => {
    reply.header('X-Request-Id', request.id);
    if (!request.url.startsWith('/api/v1')) return;
    reply.header('Cache-Control', 'no-store');
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) && (request.headers.origin !== config.origin || request.headers['x-csrf-guard'] !== '1')) throw new ApiError(403, 'CSRF_REJECTED', '请求来源校验失败');
    const url = new URL(request.url, config.origin), keys = [...url.searchParams.keys()];
    if (new Set(keys).size !== keys.length) throw invalid();
    const pathname=url.pathname;
    const paged = pathname === "/api/v1/surveys" || /^\/api\/v1\/surveys\/[^/]+\/versions$/.test(pathname);
    const versionPaged = /^\/api\/v1\/surveys\/[^/]+\/(responses|questions\/[^/]+\/answers)$/.test(pathname);
    const statistics = /^\/api\/v1\/surveys\/[^/]+\/(statistics|questions\/[^/]+\/statistics)$/.test(pathname);
    const extension=phase2?[...libraryEndpoints,...crossEndpoints,...templateEndpoints].find(([pattern])=>pattern.test(pathname)):undefined;
    const allowedQuery = request.method !== "GET" ? [] : extension?extension[2]:paged ? ["limit","cursor"] : versionPaged ? ["version","limit","cursor"] : statistics ? ["version"] : [];
    if (keys.some(key => !allowedQuery.includes(key))) throw invalid();
    if (['GET', 'HEAD'].includes(request.method) && (Number(request.headers['content-length'] ?? 0) > 0 || request.headers['transfer-encoding'])) throw invalid();
    if (request.url.split('?')[0] === '/api/v1/auth/logout' && (Number(request.headers['content-length'] ?? 0) > 0 || request.headers['transfer-encoding'])) throw invalid();
  });
  app.setErrorHandler((caught, request, reply) => {
    const error = caught as Error & { code?: string; statusCode?: number; validation?: unknown };
    let failure: ApiError;
    if (error instanceof ApiError) failure = error;
    else if ((error as { validation?: unknown }).validation || error.code === 'FST_ERR_CTP_INVALID_JSON_BODY' || error.code === 'FST_ERR_CTP_EMPTY_JSON_BODY') failure = invalid();
    else if (error.statusCode === 413) failure = new ApiError(413, 'PAYLOAD_TOO_LARGE', '请求内容过大');
    else if (error.statusCode === 415) failure = new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', '请使用JSON请求');
    else if (error.statusCode === 429) failure = new ApiError(429, 'RATE_LIMITED', '请求过于频繁，请稍后重试');
    else { request.log.error({ code: error.code ?? 'UNEXPECTED' }, 'Request failed'); failure = new ApiError(500, 'INTERNAL_ERROR', '服务暂时出错，请稍后重试'); }
    reply.code(failure.status).send({ error: { code: failure.code, message: failure.message, details: failure.details, traceId: request.id } });
  });
  const auth = async (request: { cookies: Record<string, string | undefined> }) => {
    const token = request.cookies.survey_auth; if (!token) throw new ApiError(401, 'AUTH_REQUIRED', '请先登录');
    let id: string | undefined;
    try { id = await readAuth(token, config); } catch (error) { throw new ApiError(401, (error as { code?: string }).code === 'ERR_JWT_EXPIRED' ? 'AUTH_EXPIRED' : 'AUTH_REQUIRED', '请重新登录'); }
    if (!id || !/^[0-9a-f]{24}$/.test(id)) throw new ApiError(401, 'AUTH_REQUIRED', '请先登录');
    const user = await users.findOne({ _id: new ObjectId(id) }); if (!user) throw new ApiError(401, 'AUTH_REQUIRED', '请先登录'); return user;
  };
  const credentials = (body: Credentials) => {
    const username = normalizeUsername(body.username);
    if (codePointLength(username) < 1 || codePointLength(username) > 50) throw invalid();
    if (codePointLength(body.password) < 8 || codePointLength(body.password) > 128) throw invalid();
    if (/[\p{Cc}\p{Cf}]/u.test(username)) throw new ApiError(422, 'USERNAME_INVALID', '用户名包含不可见控制字符');
    return { username, usernameKey: username.toLowerCase() };
  };
  app.post<{ Body: Credentials }>('/api/v1/auth/register', { schema: { body: credentialsSchema }, config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { username, usernameKey } = credentials(request.body), now = new Date();
    const user: UserDocument = { _id: new ObjectId(), schemaVersion: 1, username, usernameKey, passwordHash: await hashPassword(request.body.password), createdAt: now, updatedAt: now };
    try { await users.insertOne(user); } catch (error) { if (error instanceof MongoServerError && error.code === 11000) throw new ApiError(409, 'USERNAME_TAKEN', '用户名已被使用'); throw error; }
    return reply.code(201).send({ data: userDto(user) });
  });
  app.post<{ Body: Credentials }>('/api/v1/auth/login', { schema: { body: credentialsSchema }, config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { usernameKey } = credentials(request.body), user = await users.findOne({ usernameKey });
    const valid = await verifyPassword(request.body.password, user?.passwordHash ?? dummyHash);
    if (!valid || !user) throw new ApiError(401, 'INVALID_CREDENTIALS', '用户名或密码错误');
    reply.setCookie('survey_auth', await signAuth(user._id.toHexString(), config), { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 7200, secure: config.secure });
    return { data: userDto(user) };
  });
  app.get('/api/v1/auth/me', async request => ({ data: userDto(await auth(request)) }));
  app.post('/api/v1/auth/logout', async (request, reply) => {
    if (request.body !== undefined) throw invalid();
    reply.clearCookie('survey_auth', { path: '/', httpOnly: true, sameSite: 'lax', secure: config.secure }); return { data: null };
  });
  app.post<{ Body: CreateSurvey }>('/api/v1/surveys', { schema: { body: createSurveySchema } }, async (request, reply) => {
    const user = await auth(request), input = request.body, title = input.title.trim(), now = new Date();
    const textIssues = surveyTextIssues(input);
    if (textIssues.length) throw new ApiError(400, 'INVALID_REQUEST', textIssues[0].message, textIssues.map(({ field, reason }) => ({ field, reason })));
    let expiresAt: Date | null = null;
    if (input.expiresAt !== undefined && input.expiresAt !== null) {
      const iso = input.expiresAt;
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(iso) || !Number.isFinite(Date.parse(iso))) throw invalid();
      const day = Number(iso.slice(8, 10)), month = Number(iso.slice(5, 7)), year = Number(iso.slice(0, 4));
      if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) throw invalid();
      expiresAt = new Date(iso);
    }
    const survey: SurveyDocument = { _id: new ObjectId(), schemaVersion: phase2?3:2,...(phase2?{usageNumber:randomBytes(18).toString('base64url'),originTemplate:null}:{}), ownerId: user._id, publicId: randomBytes(16).toString('base64url'), title, description: input.description ?? '', status: 'draft', allowAnonymous: input.allowAnonymous ?? false, allowRepeat: input.allowRepeat ?? false, expiresAt, definitionVersion: 1, revision: 0, currentPublishedVersion: null, currentVersionSubmissionCount: 0, submissionCount: 0, structureLocked: false, questions: [], copiedFromId: null, firstPublishedAt: null, createdAt: now, updatedAt: now };
    await surveys.insertOne(survey); return reply.code(201).send({ data: editorDto(survey) });
  });
  app.get('/api/v1/surveys', async request => {
    const user = await auth(request), query = new URL(request.url, config.origin).searchParams;
    const rawLimit = query.get('limit') ?? '20'; if (!/^[1-9]\d*$/.test(rawLimit) || Number(rawLimit) > 100) throw invalid();
    const limit = Number(rawLimit), cursor = query.get('cursor');
    let filter: Record<string, unknown> = { ownerId: user._id };
    if (cursor !== null) {
      try {
        if (!cursor || cursor.length > 2048) throw new Error('Invalid cursor');
        const point = decodeCursor(cursor, user._id.toHexString(), config.cursorSecret), date = new Date(point.createdAt);
        filter = { ...filter, $or: [{ createdAt: { $lt: date } }, { createdAt: date, _id: { $lt: new ObjectId(point.id) } }] };
      } catch { throw new ApiError(400, 'INVALID_CURSOR', '分页游标无效，请重新加载列表'); }
    }
    const found = await surveys.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).toArray();
    const items = found.slice(0, limit), last = items.at(-1);
    return { data: { items: items.map(summaryDto), nextCursor: found.length > limit && last ? encodeCursor(user._id.toHexString(), { id: last._id.toHexString(), createdAt: last.createdAt.toISOString() }, config.cursorSecret) : null } };
  });
  app.get<{ Params: { surveyId: string } }>('/api/v1/surveys/:surveyId', async request => {
    const user = await auth(request), { surveyId } = request.params;
    if (!/^[a-fA-F0-9]{24}$/.test(surveyId)) throw invalid();
    const survey = await surveys.findOne({ _id: new ObjectId(surveyId), ownerId: user._id });
    if (!survey) throw new ApiError(404, 'NOT_FOUND', '资源不存在或不可访问');
    return { data: await loadEditor(db, survey) };
  });
  registerEditingRoutes(app, db, surveys, auth,phase2Context?async(actorId,id,expected,questions)=>{const a=phase2Context.forActor(actorId);return a.transaction(s=>a.surveys.saveQuestions(id,expected,questions,s));}:undefined);
  if(phase2Context)registerLibraryRoutes(app,phase2Context,auth,config);
  if(phase2Context)registerCrossStatistics(app,db,client,auth,config.cursorSecret,options.faults);
  if(phase2Context)registerTemplateRoutes(app,phase2Context,auth,config.cursorSecret);
  registerPublication(app, db, client, auth, config, options.faults,phase2Context?async(actorId,id,body,key)=>{const a=phase2Context.forActor(actorId);return a.transaction(s=>a.surveys.publish(id,body,key,config,s));}:undefined);
  registerSubmission(app, db, client, auth, options.faults);
  registerReporting(app, db, client, auth, config);
  app.get('/api/v1/health/live', async () => ({ data: { status: 'live' } }));
  app.get('/api/v1/health/ready', async () => {
    try { const hello = await db.admin().command({ hello: 1 }); if (!hello.isWritablePrimary || hello.setName !== 'rs0') throw new Error('Not ready'); if(phase2)await verifyPhase2Database(db);else await verifySchema(db); }
    catch { throw new ApiError(503, 'NOT_READY', '服务尚未就绪'); }
    return { data: { status: 'ready' } };
  });
  const webRoot = resolve('apps/web/dist');
  if (existsSync(webRoot)) await app.register(staticFiles, { root: webRoot, prefix: '/', wildcard: false });
  app.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith('/api/')) {
      const path = request.url.split('?')[0];
      const methods: Record<string, string[]> = { '/api/v1/auth/register': ['POST'], '/api/v1/auth/login': ['POST'], '/api/v1/auth/me': ['GET'], '/api/v1/auth/logout': ['POST'], '/api/v1/surveys': ['GET', 'POST'], '/api/v1/health/live': ['GET'], '/api/v1/health/ready': ['GET'] };
      const coreMethods: [RegExp,string[]][] = [
        [/^\/api\/v1\/surveys\/[^/]+$/,['GET','PATCH']],
        [/^\/api\/v1\/surveys\/[^/]+\/questions$/,['PUT']],
        [/^\/api\/v1\/surveys\/[^/]+\/(publish|pause|close|copy)$/,['POST']],
        [/^\/api\/v1\/surveys\/[^/]+\/(versions|responses)(\/[^/]+)?$/,['GET']],
        [/^\/api\/v1\/surveys\/[^/]+\/(statistics|questions\/[^/]+\/(statistics|answers))$/,['GET']],
        [/^\/api\/v1\/public\/surveys\/[^/]+$/,['GET']],
        [/^\/api\/v1\/public\/surveys\/[^/]+\/responses$/,['POST']],
      ];
      const allowed = methods[path] ?? (phase2?[...libraryEndpoints,...crossEndpoints,...templateEndpoints].find(([pattern])=>pattern.test(path))?.[1]:undefined) ?? coreMethods.find(([pattern])=>pattern.test(path))?.[1];
      if (allowed && !allowed.includes(request.method)) { reply.header('Allow', allowed.join(', ')); throw new ApiError(405, 'METHOD_NOT_ALLOWED', '该接口不支持此方法'); }
      throw new ApiError(404, 'NOT_FOUND', '资源不存在或不可访问');
    }
    if (existsSync(webRoot) && request.method === 'GET' && !request.url.includes('.')) return reply.sendFile('index.html');
    throw new ApiError(404, 'NOT_FOUND', '资源不存在或不可访问');
  });
  return app;
}
