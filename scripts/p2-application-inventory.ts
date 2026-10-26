import {MongoClient,BSON} from 'mongodb';
import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {assertOwnedDatabaseInstance,verifyConnectedDatabaseInstance} from '../apps/api/src/database/instance-ownership.js';
const owned=assertOwnedDatabaseInstance(),client=new MongoClient('mongodb://localhost:27019/?replicaSet=rs0',{promoteLongs:false});
try{
 await client.connect();await verifyConnectedDatabaseInstance(client,owned);
 const result:Record<string,unknown>={at:new Date().toISOString(),owned};
 for(const name of ['project2_app_v1','project2_app_v2']){
  const db=client.db(name),rows=[];
  for(const c of await db.listCollections({},{nameOnly:false}).toArray()){
   const docs=await db.collection(c.name).find().sort({_id:1}).toArray();
   const digest=createHash('sha256');for(const d of docs)digest.update(BSON.serialize(d));
   rows.push({name:c.name,options:c.options,indexes:await db.collection(c.name).indexes(),count:docs.length,sha256:digest.digest('hex')});
  }
  result[name]=rows.sort((a,b)=>a.name.localeCompare(b.name));
 }
 const destination=process.argv[2];if(!destination||!/^docs\/phase2\/evidence\/P2-(009|010)-(applications-before|applications-after)\.json$/.test(destination))throw Error('Dedicated public summary path required');
 writeFileSync(destination,JSON.stringify(result,null,2));console.log(JSON.stringify({destination,counts:Object.fromEntries(['project2_app_v1','project2_app_v2'].map(n=>[n,(result[n] as {name:string;count:number}[]).map(x=>({name:x.name,count:x.count}))]))}));
}finally{await client.close();}
