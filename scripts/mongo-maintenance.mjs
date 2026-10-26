import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {MongoClient} from 'mongodb';
export function maintenanceMongoOptions(){
 const file=resolve('.local/security/admin.json');
 if(!existsSync(file))return {};
 const value=JSON.parse(readFileSync(file,'utf8'));
 if(value.authSource!=='admin'||typeof value.password!=='string'||value.password.length<32||value.username!=='project2_administrator')throw Error('Invalid private P2 maintenance credentials');
 return {auth:{username:value.username,password:value.password},authSource:'admin'};
}
if(process.argv[2]==='shutdown'){
 const client=new MongoClient('mongodb://localhost:27019/admin?directConnection=true',{...maintenanceMongoOptions(),serverSelectionTimeoutMS:5000});
 try{await client.connect();const options=await client.db('admin').command({getCmdLineOpts:1});if(options.parsed.net.port!==27019||resolve(options.parsed.storage.dbPath)!==resolve('.local/mongodb-phase2-rs0'))throw Error('Wrong P2 instance');
  try{await client.db('admin').command({shutdown:1});}catch(e){if(!/closed|ECONNRESET|connection.*ended/i.test(e.message))throw e;}
 }finally{await client.close();}
}
