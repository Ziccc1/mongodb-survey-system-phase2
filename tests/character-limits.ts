import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { chromium, expect } from '@playwright/test';
import {MongoClient,testMongoOptions} from './database-client.js';
import { codePointLength, SURVEY_TEXT_LIMITS, surveyTextIssues } from '@survey/shared';
import {isolatedTestConfig,evidenceDirectory} from './runtime-environment.js';
import { initialize } from '../apps/api/src/database/initialize.js';
import { buildApp } from '../apps/api/src/app.js';

// Focused regression: no old account/version/statistics suites are rerun.
const config = isolatedTestConfig('characters','http://127.0.0.1:3102',3102), dbName = config.dbName;
const artifactDirectory=evidenceDirectory('character-limits');
const client = new MongoClient(config.uri,testMongoOptions()); await client.connect(); const db = client.db(dbName); await initialize(db);
const app = await buildApp(config, { logger: false }); await app.listen({ host: '127.0.0.1', port: config.port });
const channel = process.env.PLAYWRIGHT_CHANNEL ?? (existsSync('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe') ? 'msedge' : undefined);
const browser = await chromium.launch({ headless: true, ...(channel ? { channel } : {}) });
const context = await browser.newContext(), page = await context.newPage({ viewport: { width: 1024, height: 1000 } });
const headers = { origin: config.origin, 'x-csrf-guard': '1' }, credentials = { username: `characters_${Date.now()}`, password: `Test-${randomUUID()}` };
const failures: string[] = []; page.on('pageerror', error => failures.push(error.message));
const samples = [
  { name: 'Chinese', text: '汉'.repeat(2000) },
  { name: 'single-code-point emoji', text: '😀'.repeat(2000) },
  { name: 'Chinese + newline + emoji', text: '汉'.repeat(1998) + '\n😀' },
];
try {
  assert.equal(SURVEY_TEXT_LIMITS.description, 2000);
  assert.equal(codePointLength('汉 a\n😀'), 5);
  assert.equal(codePointLength('👨‍👩‍👧‍👦'), 7); // Preserve contract: code points, not grapheme clusters.
  assert.deepEqual(surveyTextIssues({ title: '  草稿  ', description: '' }), []);
  assert.equal((await context.request.post(`${config.origin}/api/v1/auth/register`, { headers, data: credentials })).status(), 201);
  assert.equal((await context.request.post(`${config.origin}/api/v1/auth/login`, { headers, data: credentials })).status(), 200);
  for (const sample of samples) {
    assert.equal(codePointLength(sample.text), 2000);
    const valid = await context.request.post(`${config.origin}/api/v1/surveys`, { headers, data: { title: sample.name, description: sample.text } });
    assert.equal(valid.status(), 201); assert.equal((await valid.json()).data.draftDefinition.description, sample.text);
    const before = await db.collection('surveys').countDocuments();
    const invalid = await context.request.post(`${config.origin}/api/v1/surveys`, { headers, data: { title: 'too long', description: sample.text + '汉' } });
    assert.equal(invalid.status(), 400);
    const body = await invalid.json(); assert.equal(body.error.code, 'INVALID_REQUEST');
    assert.deepEqual(body.error.details, [{ field: '/description', reason: 'TOO_LONG' }]);
    assert.match(body.error.message, /2000/); assert.equal(await db.collection('surveys').countDocuments(), before);
  }
  await page.goto(`${config.origin}/surveys/new`);
  await page.getByLabel('问卷标题', { exact: false }).fill('字符计数回归');
  const field = page.getByLabel('问卷说明', { exact: true }), create = page.getByRole('button', { name: '创建草稿', exact: true });
  await expect(page.locator('#description-count')).toHaveText('0 / 2000 个字符');
  let postCount = 0;
  page.on('request', request => { if (request.method() === 'POST' && request.url().endsWith('/api/v1/surveys')) postCount++; });
  for (const sample of samples) {
    await field.fill(sample.text); await expect(page.locator('#description-count')).toHaveText('2000 / 2000 个字符'); await expect(create).toBeEnabled();
    await field.fill(sample.text + '汉'); await expect(page.locator('#description-count')).toHaveText('2001 / 2000 个字符');
    await expect(field).toHaveAttribute('aria-invalid', 'true'); await expect(page.locator('#description-error')).toHaveText('说明已超出 1 个字符，请缩短后再创建。');
    await expect(create).toBeDisabled();
    // Even programmatic submit cannot bypass the local guard.
    await page.locator('form').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    assert.equal(postCount, 0); assert.equal(await field.inputValue(), sample.text + '汉');
  }
  await mkdir(`${artifactDirectory}`, { recursive: true });
  await page.screenshot({ path: `${artifactDirectory}/character-limit-desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 320, height: 1000 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: `${artifactDirectory}/character-limit-mobile.png`, fullPage: true });
  await field.fill('😀'.repeat(2000)); await expect(page.locator('#description-error')).toHaveCount(0); await expect(create).toBeEnabled(); await expect(field).toHaveAttribute('aria-invalid', 'false');
  await create.click(); await page.waitForURL(/\/surveys\/[0-9a-f]{24}$/);
  assert.equal(postCount, 1); await page.getByRole('heading', { name: '字符计数回归', exact: true }).waitFor();
  assert.equal((await db.collection('surveys').findOne({ title: '字符计数回归' }))?.description, '😀'.repeat(2000));
  assert.deepEqual(failures, []);
  const result = { date: new Date().toISOString(), status: 'passed', database: dbName, samples: samples.map(sample => sample.name), validCodePoints: 2000, rejectedCodePoints: 2001, bypassUiRejectedByApi: true, overLimitInputPreserved: true, overLimitUiPosts: 0, correctedUiPosts: postCount, consoleErrors: failures, retainedTestData: true };
  await writeFile(`${artifactDirectory}/character-limits.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); await app.close(); await client.close(); }
