import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { chromium } from '@playwright/test';
import {MongoClient,testMongoOptions} from './database-client.js';
import { buildApp } from '../apps/api/src/app.js';
import {isolatedTestConfig,evidenceDirectory} from './runtime-environment.js';
import { initialize } from '../apps/api/src/database/initialize.js';

const config = isolatedTestConfig('browser','http://127.0.0.1:3101',3101), dbName = config.dbName;
const artifactDirectory=evidenceDirectory('browser');
const client = new MongoClient(config.uri,testMongoOptions()); await client.connect(); await initialize(client.db(dbName));
const app = await buildApp(config, { logger: false }); await app.listen({ port: config.port, host: '127.0.0.1' });
const channel = process.env.PLAYWRIGHT_CHANNEL ?? (existsSync('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe') ? 'msedge' : undefined);
const browser = await chromium.launch({ headless: true, ...(channel ? { channel } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const consoleErrors: string[] = []; page.on('pageerror', error => consoleErrors.push(error.message));
const password = `Browser-${randomUUID()}`, username = `browser_${Date.now()}`, title = '校园自习空间使用调查';
const baseUrl = config.origin;
try {
  await page.goto(`${baseUrl}/surveys`); await page.waitForURL(/\/login(?:\?next=.*)?$/);
  await page.getByRole('link', { name: '注册账号', exact: true }).click();
  await page.getByLabel('用户名', { exact: true }).fill(username); await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: '创建账号', exact: true }).click(); await page.waitForURL(/\/login\?registered=1(?:&next=.*)?$/);
  await page.getByLabel('用户名', { exact: true }).fill(username); await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: '登录', exact: true }).click(); await page.waitForURL('**/surveys');
  await page.getByRole('heading', { name: '还没有问卷' }).waitFor();
  await page.getByRole('link', { name: '创建问卷', exact: true }).click();
  await page.getByLabel('问卷标题', { exact: false }).fill(title);
  await page.getByLabel('问卷说明', { exact: true }).fill('了解同学们的自习空间需求。');
  await page.getByLabel('允许填写者选择匿名').check();
  await page.getByRole('button', { name: '创建草稿', exact: true }).click();
  await page.waitForURL(/\/surveys\/[0-9a-f]{24}$/); const detailUrl = page.url();
  await page.getByRole('heading', { name: title, exact: true }).waitFor();
  await page.reload(); await page.getByRole('heading', { name: title, exact: true }).waitFor();
  await mkdir(`${artifactDirectory}`, { recursive: true });
  await page.screenshot({ path: `${artifactDirectory}/draft-desktop.png`, fullPage: true });
  await page.getByRole('link', { name: '← 返回我的问卷', exact: true }).click();
  await page.getByRole('link', { name: new RegExp(title) }).waitFor();
  await page.reload(); await page.getByRole('link', { name: new RegExp(title) }).waitFor();
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `overflow at ${width}`);
  }
  await page.setViewportSize({ width: 320, height: 900 });
  await page.screenshot({ path: `${artifactDirectory}/list-mobile.png`, fullPage: true });
  await page.keyboard.press('Tab'); assert.ok(await page.evaluate(() => document.activeElement?.tagName !== 'BODY'));
  assert.equal(await page.getByRole('button', { name: /复制问卷|断点恢复|自动保存/ }).count(), 0);
  await page.getByRole('button', { name: '退出登录', exact: true }).click(); await page.waitForURL(/\/login(?:\?next=.*)?$/);
  await page.goto(detailUrl); await page.waitForURL(/\/login(?:\?next=.*)?$/);
  await page.getByLabel('用户名', { exact: true }).fill(username); await page.getByLabel('密码', { exact: true }).fill('wrong-password');
  await page.getByRole('button', { name: '登录', exact: true }).click(); await page.getByRole('alert').filter({ hasText: '用户名或密码错误' }).waitFor();
  assert.deepEqual(consoleErrors, []);
  await writeFile(`${artifactDirectory}/browser.json`, JSON.stringify({ date: new Date().toISOString(), status: 'passed', database: dbName, journey: 'register → login → create → detail → refresh → list → refresh → logout → denied protected page', responsiveWidths: [320, 768, 1024, 1440], consoleErrors, retainedTestData: true }, null, 2));
  console.log(`Browser workflow passed; retained database: ${dbName}`);
} finally { await browser.close(); await app.close(); await client.close(); }
