import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'node:path';
export default defineConfig(({mode}) => {
  const env=loadEnv(mode,resolve(import.meta.dirname,'../..'),'');
  const publicAppUrl=env.PUBLIC_APP_URL || env.APP_ORIGIN;
  if(!publicAppUrl || new URL(publicAppUrl).origin!==publicAppUrl || !/^https?:/.test(publicAppUrl) || publicAppUrl!==env.APP_ORIGIN) throw Error('Configure PUBLIC_APP_URL = APP_ORIGIN');
  const runtime={publicAppUrl,...(mode==='phase2'?{libraryEnabled:true}:{})}; // Explicit feature whitelist; no server secrets.
  return {plugins:[vue(),{name:'public-runtime-config',configureServer(server){server.middlewares.use('/app-config.js',(_req,res)=>{res.setHeader('Content-Type','application/javascript');res.setHeader('Cache-Control','no-store');res.end(`window.__SURVEY_CONFIG__=${JSON.stringify(runtime).replaceAll('<','\\u003c')};`);});}}],
    server:{host:env.WEB_HOST || 'localhost',port:Number(new URL(publicAppUrl).port || (publicAppUrl.startsWith('https:')?443:80)),strictPort:true,proxy:{'/api':`http://127.0.0.1:${env.API_PORT || 3200}`}},preview:{port:Number(new URL(publicAppUrl).port || 5200)}};
});
