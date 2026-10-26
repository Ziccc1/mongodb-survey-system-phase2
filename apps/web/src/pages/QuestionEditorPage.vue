<script setup lang="ts">
import {ref,computed,onMounted} from 'vue';
import {useRoute,useRouter,onBeforeRouteLeave} from 'vue-router';
import {newQuestion,materializeQuestion,validateQuestions,canonical} from '@survey/shared';
import type {Question,QuestionType,QuestionEditor,QuestionVersion,ResourceReceipt,Page} from '@survey/shared';
import {api,RequestError} from '../api';
import {contentOf,useOperation,queryPage} from '../library-client';
import QuestionCard from '../components/QuestionCard.vue';
import DefinitionView from '../components/DefinitionView.vue';
import DistributionGrants from '../components/DistributionGrants.vue';
import QuestionShares from '../components/QuestionShares.vue';
const route=useRoute(),router=useRouter(),id=String(route.params.questionId),shared=ref(route.query.shared==='1'),editor=ref<QuestionEditor|null>(null),editing=ref<Question>(newQuestion('text')),base=ref<string|null>(null),versions=ref<QuestionVersion[]>([]),cursor=ref<string|null>(null),selected=ref<QuestionVersion|null>(null),loading=ref(true),busy=ref(false),error=ref(''),notice=ref(''),saved=ref(''),remote=ref<QuestionEditor|null>(null),op=useOperation();
const dirty=computed(()=>!shared.value&&saved.value!==canonical({content:contentOf(editing.value),base:base.value})),issues=computed(()=>validateQuestions([editing.value]).errors);
function adopt(data:QuestionEditor){editor.value=data;if(data.draft){editing.value=materializeQuestion(data.draft.content,{required:false,jumpRules:[]},'library-edit');base.value=data.draft.baseVersionId;}saved.value=canonical({content:contentOf(editing.value),base:base.value});remote.value=null;}
async function refreshRevision(){if(shared.value)return;try{editor.value=await api<QuestionEditor>(`/questions/${id}/draft`);}catch(e){error.value=(e as Error).message;}}
const pendingKind=computed(()=>op.pending.value?.path.endsWith('/versions')?'formal':op.pending.value?.path.endsWith('/restorations')?'restore':op.pending.value?'fork':null);
const blocked=(kind:string)=>busy.value||!!pendingKind.value&&pendingKind.value!==kind;
async function history(more=false){const p=await api<Page<QuestionVersion>>(`/questions/${id}/versions`+queryPage({limit:'20',cursor:more?cursor.value??undefined:undefined}));versions.value=more?[...versions.value,...p.items]:p.items;cursor.value=p.nextCursor;if(!selected.value)selected.value=versions.value[0]??null;}
async function load(){loading.value=true;error.value='';try{if(!shared.value){try{adopt(await api<QuestionEditor>(`/questions/${id}/draft`));}catch(e){if(e instanceof RequestError&&e.status===404)shared.value=true;else throw e;}}await history();}catch(e){error.value=(e as Error).message;}finally{loading.value=false;}}
async function act(kind:'draft'|'formal'|'restore'|'fork'){
 if(blocked(kind))return;
 const submitted=canonical({content:contentOf(editing.value),base:base.value});
 busy.value=true;error.value='';notice.value='';
 try{
  if(kind==='draft'){adopt(await api<QuestionEditor>(`/questions/${id}/draft`,'PUT',{expectedRevision:editor.value!.revision,content:contentOf(editing.value),baseVersionId:base.value}));notice.value='编辑草稿已保存，未生成正式版本。';}
  else if(kind==='fork'){
   const v=selected.value!;const r=await op.run<ResourceReceipt>(`/question-versions/${v.id}/forks`,{content:shared.value?v.content:contentOf(editing.value)});await router.push(`/questions/${r.resourceId}`);
  }else{
   const r=await op.run<ResourceReceipt>(`/questions/${id}/${kind==='formal'?'versions':'restorations'}`,kind==='formal'?{expectedRevision:editor.value!.revision,expectedDraftRevision:editor.value!.draft!.revision}:{expectedRevision:editor.value!.revision,sourceVersionId:selected.value!.id});
   const fresh=await api<QuestionEditor>(`/questions/${id}/draft`);
   if(kind==='formal'&&submitted===canonical({content:contentOf(editing.value),base:base.value}))adopt(fresh);else editor.value=fresh;
   await history();selected.value=versions.value.find(v=>v.id===r.versionId)??null;
   notice.value=kind==='restore'?'已恢复为新的正式版本。原编辑草稿和中间历史全部保留；可明确选此版作为编辑基线。':'正式版本已保存。已有问卷仍使用原固定版本，需要主动替换。';
  }
 }catch(e){error.value=(e as Error).message;if(e instanceof RequestError&&e.status===409&&!shared.value)remote.value=await api<QuestionEditor>(`/questions/${id}/draft`).catch(()=>null);}
 finally{busy.value=false;}
}
function useBase(v:QuestionVersion){if(dirty.value&&!window.confirm('用所选正式版替换本地未保存内容？'))return;editing.value=materializeQuestion(v.content,{required:false,jumpRules:[]},'library-edit');base.value=v.id;notice.value=`正在基于 v${v.version} 编辑，先保存草稿再保存正式版。`;}
function changeType(event:Event){const type=(event.target as HTMLSelectElement).value as QuestionType;const title=editing.value.title;editing.value={...newQuestion(type),id:'library-edit',title};}
onBeforeRouteLeave(()=>!(dirty.value||op.pending.value)||window.confirm('有未保存编辑或未确认操作，确定离开？'));
onMounted(load);
</script>
<template><section class="library-page"><RouterLink class="back" :to="shared?'/questions?scope=shared':'/questions'">← 返回题目工作台</RouterLink><div class="page-heading"><div><h1 tabindex="-1">{{shared?'共享题目':'题目编辑与版本'}}</h1><p class="muted">{{shared?'只能读取正式版本；修改内容请派生为自己的题目。':'普通保存只更新草稿；正式保存才产生不可变版本。'}}</p></div><RouterLink :to="`/questions/${id}/usage${shared?'?shared=1':''}`">查看使用情况 →</RouterLink><RouterLink v-if="selected" :to="`/question-statistics/${id}?versionId=${selected.id}`">跨问卷题目统计 →</RouterLink></div>
<p v-if="loading" role="status" aria-busy="true">正在读取题目…</p><p v-if="error" class="error" role="alert">{{error}} <button v-if="loading||!editor&&!shared" class="quiet" @click="load">重新读取</button></p><p v-if="notice" class="saved" role="status">{{notice}}</p><p v-if="op.pending.value" role="status">操作结果尚未确认。再次点击原操作按钮会使用原请求和原key确认。</p>
<section v-if="remote" class="conflict panel"><h2>服务器版本已变化，本地内容保留</h2><p>服务器修订 {{remote.revision}}，草稿题干：{{remote.draft?.content.title}}。请比较后继续。</p><button class="secondary" :disabled="busy||!!op.pending.value" @click="editor=remote;remote=null">已比较，采用新修订并保留本地输入</button></section>
<div v-if="!loading" class="library-layout"><section v-if="editor&&!shared" class="panel"><h2>编辑草稿</h2><p v-if="editor.origin" class="muted">{{editor.origin.kind==='fork'?'派生题：来源限制随后续版本保留。':'历史导入题：原始来源未记录。'}}</p><p class="muted">编辑基线：{{base?(versions.find(v=>v.id===base)?`v${versions.find(v=>v.id===base)!.version}`:'较早正式版'):'无正式父版'}} · {{dirty?'有未保存修改':'草稿内容已保存'}}</p>
<fieldset :disabled="busy||!!op.pending.value"><label for="library-type">题型</label><select id="library-type" :value="editing.type" @change="changeType"><option value="single">单选题</option><option value="multiple">多选题</option><option value="text">文本题</option><option value="number">数字题</option></select><QuestionCard :question="editing" :index="0" :questions="[editing]" content-only /></fieldset><ul v-if="issues.length" class="error"><li v-for="i in issues" :key="i.field+i.code">{{i.message}}</li></ul>
<div class="editor-actions"><button class="secondary" :disabled="busy||!!op.pending.value||issues.length>0" @click="act('draft')">保存编辑草稿</button><button class="primary" :disabled="blocked('formal')||dirty||!editor.draft||!!remote" @click="act('formal')">{{pendingKind==='formal'?'重试原正式保存':'保存正式版本'}}</button><button v-if="selected" class="quiet" :disabled="blocked('fork')||issues.length>0" @click="act('fork')">派生为独立新题</button></div><small>必答、题序、跳转在各问卷中单独设置。</small></section>
<section class="panel"><h2>正式版本历史</h2><p v-if="!versions.length">还没有正式版本。先保存编辑草稿，再点击“保存正式版本”。</p><ul class="library-rows"><li v-for="v in versions" :key="v.id"><button class="quiet" :aria-pressed="selected?.id===v.id" :disabled="busy||!!op.pending.value" @click="selected=v">v{{v.version}} · {{v.content.title}}</button><span class="muted">{{v.operation==='restore'?'恢复生成':v.operation==='fork'?'派生首版':v.operation==='legacyImport'?'历史导入':'正式保存'}}{{v.parentVersionId?` · 父版 ${versions.find(p=>p.id===v.parentVersionId)?.version??'较早版本'}`:' · 无同题父版'}}</span></li></ul><button v-if="cursor" class="secondary" :disabled="busy||!!op.pending.value" @click="history(true)">更多历史版本</button>
<template v-if="selected"><h3>v{{selected.version}} · 固定内容</h3><DefinitionView :definition="{title:selected.content.title,description:'',questions:[materializeQuestion(selected.content,{required:false,jumpRules:[]},'preview')]}"/><div class="editor-actions"><button v-if="!shared" class="secondary" :disabled="busy||!!op.pending.value" @click="useBase(selected)">以此版编辑草稿</button><button v-if="!shared" class="quiet" :disabled="blocked('restore')||!!remote" @click="act('restore')">恢复此版为新正式版本</button><button v-if="shared" class="primary" :disabled="blocked('fork')" @click="act('fork')">派生并保存为自己的正式 v1</button></div><p v-if="!shared" class="muted">恢复会新增版本号，不覆盖当前编辑草稿。</p></template></section></div>
<QuestionShares v-if="editor&&!shared&&!loading" :question-id="id" :revision="editor.revision" :disabled="busy||!!op.pending.value" @changed="refreshRevision"/>
<DistributionGrants v-if="editor&&!shared&&!loading&&selected" :question-id="id" :revision="editor.revision" :version-id="selected.id" :disabled="busy||!!op.pending.value" @changed="refreshRevision"/>
</section></template>
