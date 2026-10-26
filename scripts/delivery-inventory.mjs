import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync,lstatSync} from 'node:fs';
import {resolve,join,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {MongoClient,BSON} from 'mongodb';
import {maintenanceMongoOptions} from './mongo-maintenance.mjs';
const root=resolve('docs/testing/phase2-runs/delivery-20261025'),before=JSON.parse(readFileSync('.local/security/pre-auth-application.bson.json','utf8'));
const client=new MongoClient('mongodb://localhost:27019/?replicaSet=rs0',{...maintenanceMongoOptions(),promoteLongs:false});await client.connect();
try{
 const db=client.db('project2_app_v2'),checks=[],counts=[],id=d=>String(d._id);
 for(const row of before.rows){const docs=await db.collection(row.name).find().sort({_id:1}).toArray(),map=new Map(docs.map(d=>[id(d),Buffer.from(BSON.serialize(d)).toString('base64')]));
  const differences=row.documents.map(x=>({id:id(BSON.deserialize(Buffer.from(x,'base64'))),bytes:x})).filter(x=>map.get(x.id)!==x.bytes);assert.equal(differences.length,0,'Pre-existing data changed: '+row.name);
  counts.push({collection:row.name,before:row.documents.length,after:docs.length,oldDocumentsPreserved:true,added:docs.length-row.documents.length,indexes:(await db.collection(row.name).indexes()).length});
 }checks.push({name:'Every pre-authentication application document remains byte-identical',pass:true});
 const qa=await db.collection('surveys').findOne({_id:new BSON.ObjectId('6add675ac62b15cb7bd796a1')});assert(qa&&qa.submissionCount===0&&qa.currentVersionSubmissionCount===0&&qa.expiresAt.getTime()<Date.now());checks.push({name:'Only zero-response expiry regression survey added',pass:true});
 const original=resolve('../project1/.local/mongodb-rs0-v2'),migration=JSON.parse(readFileSync(resolve(root,'real-p1-migration.json'),'utf8'));
 const expected=JSON.parse(readFileSync(resolve('.local/w07',migration.runId,'source-files.json'),'utf8'));
 function files(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>{const p=join(dir,e.name);assert(!lstatSync(p).isSymbolicLink());return e.isDirectory()?files(p):[p];});}
 const actual=files(original).map(p=>({path:relative(original,p),sha256:createHash('sha256').update(readFileSync(p)).digest('hex')})).sort((a,b)=>a.path.localeCompare(b.path));assert.deepEqual(actual,expected);checks.push({name:'Real P1 original directory remains unchanged through final delivery',pass:true,files:actual.length});
 const selected=['6adcc529ba826d37d9e2d205','6adcc6e9ba826d37d9e2d229','6adcc770ba826d37d9e2d236','6adcd02bba826d37d9e2d259','6adcd50dba826d37d9e2d27f','6adcd577ba826d37d9e2d28f','6adcc924ba826d37d9e2d24f','6adcd88aba826d37d9e2d2b2'];
 const responses=await db.collection('responses').countDocuments({surveyId:{$in:selected.map(x=>new BSON.ObjectId(x))}});assert.equal(responses,17);checks.push({name:'Original eight manual acceptance surveys still contain exactly 17 responses',pass:true});
 const result={status:'passed',at:new Date().toISOString(),database:'project2_app_v2',counts,checks,selectedResponses:responses,qaSurveyId:String(qa._id),qaDeadline:qa.expiresAt.toISOString()};writeFileSync(resolve(root,'preservation-final.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({status:result.status,checks:checks.length,selectedResponses:responses,collections:counts.length}));
}finally{await client.close();}
