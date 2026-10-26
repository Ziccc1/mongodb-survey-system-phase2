import {loadPhase2Config} from './config.js';
import {buildPhase2App} from './app.js';
const config=loadPhase2Config(),app=await buildPhase2App(config);
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,async()=>{await app.close();process.exit(0);});
try{await app.listen({host:config.host,port:config.port});}catch(error){app.log.error({message:(error as Error).message},'P2 startup failed');await app.close();process.exit(1);}
