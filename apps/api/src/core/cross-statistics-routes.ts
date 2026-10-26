import type {FastifyInstance} from 'fastify';
import type {Db,MongoClient} from 'mongodb';
import type {Auth,FaultHooks} from './common.js';
import {CrossStatisticsService} from './cross-statistics.js';
export const crossEndpoints:[RegExp,string[],string[]][]=[
 [/^\/api\/v1\/question-statistics\/[^/]+\/versions\/[^/]+$/,['GET'],['surveyIds','boundaries']],
 [/^\/api\/v1\/question-statistics\/[^/]+\/versions\/[^/]+\/(answers|distribution)$/,['GET'],['surveyIds','limit','cursor']],
];
export function registerCrossStatistics(app:FastifyInstance,db:Db,client:MongoClient,auth:Auth,secret:string,faults:FaultHooks={}){
 for(const [suffix,kind] of [['','summary'],['/answers','answers'],['/distribution','distribution']] as const)app.get<{Params:{questionId:string;versionId:string}}>(`/api/v1/question-statistics/:questionId/versions/:versionId${suffix}`,async r=>{
  const user=await auth(r);return {data:await new CrossStatisticsService(db,client,user._id,secret,faults).query(r.params.questionId,r.params.versionId,r.url,kind)};
 });
}
