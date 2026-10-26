<script setup lang="ts">
import {ref,watch,computed} from 'vue';
import type {Editor,InstanceSource,UpdateNotice,QuestionVersion,Question} from '@survey/shared';
import {materializeQuestion} from '@survey/shared';
import {api,RequestError} from '../api';
import {useOperation} from '../library-client';
import QuestionPicker from './QuestionPicker.vue';
import TemplateInstanceFork from './TemplateInstanceFork.vue';
import RuleEditor from './RuleEditor.vue';
const props=defineProps<{survey:Editor;dirty:boolean}>(),emit=defineEmits<{changed:[];sources:[items:InstanceSource[]];locked:[value:boolean]}>(),sources=ref<InstanceSource[]>([]),updates=ref<UpdateNotice[]>([]),busy=ref(false),error=ref(''),notice=ref(''),mode=ref<'attach'|'replace'|null>(null),instanceId=ref(''),choice=ref<QuestionVersion|null>(null),required=ref(false),review=ref(false),reviewQuestion=ref<Question|null>(null),op=useOperation(),forkSource=ref<InstanceSource|null>(null),childLocked=ref(false);
const editable=computed(()=>['draft','paused'].includes(props.survey.status)),unbound=computed(()=>props.survey.draftDefinition.questions.filter(q=>!sources.value.some(s=>s.instanceId===q.id))),source=computed(()=>sources.value.find(s=>s.instanceId===instanceId.value));
async function load(){error.value='';try{const path=`/surveys/${props.survey.id}`,s=await api<{revision:number;items:InstanceSource[]}>(path+'/question-sources'),u=await api<{revision:number;items:UpdateNotice[]}>(path+'/question-updates');if(s.revision!==props.survey.revision||u.revision!==props.survey.revision){error.value='问卷已变化，请刷新并比较服务器版本。';return;}sources.value=s.items;updates.value=u.items;emit('sources',s.items);}catch(e){error.value=(e as Error).message;}}
function open(kind:'attach'|'replace',id=''){mode.value=kind;instanceId.value=id;choice.value=null;review.value=false;reviewQuestion.value=null;error.value='';}
function selected(v:QuestionVersion|null){choice.value=v;review.value=false;reviewQuestion.value=null;}
function pendingPath(kind:'attach'|'replace'|'formalize',id=instanceId.value){const root=`/surveys/${props.survey.id}`;return kind==='formalize'?`${root}/questions/${id}/formalization`:kind==='replace'?`${root}/questions/${id}/replacement`:`${root}/question-references`;}
const blocked=(kind:'attach'|'replace'|'formalize',id=instanceId.value)=>!!op.pending.value&&op.pending.value.path!==pendingPath(kind,id);
async function perform(kind:'attach'|'replace'|'formalize',id=instanceId.value){
 if(busy.value||props.dirty||!editable.value||blocked(kind,id))return;busy.value=true;error.value='';notice.value='';
 try{
  const path=`/surveys/${props.survey.id}`,expectedRevision=props.survey.revision;
  await op.run(kind==='formalize'?`${path}/questions/${id}/formalization`:kind==='replace'?`${path}/questions/${id}/replacement`:`${path}/question-references`,kind==='formalize'?{expectedRevision}:kind==='replace'?{expectedRevision,questionVersionId:choice.value!.id,...(review.value?{reviewedJumpRules:reviewQuestion.value?.jumpRules??[]}:{})}:{expectedRevision,questionVersionId:choice.value!.id,position:props.survey.draftDefinition.questions.length,required:required.value});
  notice.value=kind==='formalize'?'此题已明确保存为正式题目，实例及配置保持不变。':kind==='replace'?'已采用所选正式版，请检查规则并重新发布。':'已插入固定正式版本。';mode.value=null;emit('changed');
 }catch(e){
  error.value=(e as Error).message;
  if(e instanceof RequestError&&e.code==='RULE_REVIEW_REQUIRED'&&choice.value){
   const old=props.survey.draftDefinition.questions.find(q=>q.id===id)!;review.value=true;reviewQuestion.value=materializeQuestion(choice.value.content,{required:old.required,jumpRules:[]},id);
  }
 }finally{busy.value=false;}
}
watch(()=>props.survey.revision,load,{immediate:true});
watch(()=>busy.value||!!op.pending.value||childLocked.value||!!forkSource.value,value=>emit('locked',value),{immediate:true});
</script>
<template><section class="panel survey-sources"><h2>正式题目与引用</h2><p class="muted">先保存普通编辑，再逐题明确保存正式版，或从我的题目、共享题及题库选用。发布只检查，不会自动生成题版本。</p><p v-if="dirty" role="status">请先保存本地基本信息与题目，再进行正式保存或选用。</p><p v-if="!editable" class="muted">当前状态不可变更。收集中需先暂停；已关闭问卷不能重新开放。</p><p v-if="error" class="error" role="alert">{{error}}</p><p v-if="notice" class="saved" role="status">{{notice}}</p><p v-if="op.pending.value" role="status">操作结果尚未确认，请使用原操作按钮重试确认；其他编辑暂时锁定。</p>
<ul v-if="unbound.length" class="library-rows"><li v-for="q in unbound" :key="q.id"><span>{{q.title}} · 尚未正式保存</span><button class="secondary" :disabled="busy||!!forkSource||dirty||!editable||blocked('formalize',q.id)" @click="perform('formalize',q.id)">{{op.pending.value?'重试原操作':'保存为正式题目'}}</button></li></ul>
<ul v-if="sources.length" class="library-rows"><li v-for="s in sources" :key="s.instanceId"><div><strong>{{survey.draftDefinition.questions.find(q=>q.id===s.instanceId)?.title}}</strong><small>正式 v{{s.questionVersion}} · {{s.rights==='owner'?'本人题目':s.rights==='share'?'有效共享':s.rights==='retained'?'共享已撤销，保留本实例原版':'模板固定版本'}}</small><RouterLink :to="`/question-statistics/${s.questionId}?versionId=${s.questionVersionId}`">统计本人问卷中的此版</RouterLink><RouterLink v-if="s.rights==='owner'||s.rights==='share'" :to="`/questions/${s.questionId}${s.rights==='share'?'?shared=1':''}`">{{s.rights==='owner'?'编辑题目及正式版本':'查看正式历史或派生'}}</RouterLink></div><div><span v-if="s.hasAccessibleUpdate" class="badge">有可用新版</span><button v-if="s.rights==='owner'||s.rights==='share'" class="quiet" :disabled="busy||!!forkSource||dirty||!editable||!!op.pending.value" @click="open('replace',s.instanceId)">选择版本替换</button><button v-if="s.rights==='template'" class="secondary" :disabled="busy||dirty||!editable||!!op.pending.value||!!forkSource" @click="forkSource=s">修改并派生自己的题目</button></div></li></ul>
<TemplateInstanceFork v-if="forkSource" :survey="survey" :source="forkSource" @locked="childLocked=$event" @cancel="forkSource=null;childLocked=false" @done="forkSource=null;childLocked=false;emit('changed')"/>
<button class="secondary" :disabled="busy||!!forkSource||dirty||!editable||!!op.pending.value" @click="open('attach')">从题目或题库选用</button>
<section v-if="mode" class="panel"><div class="page-heading"><h3>{{mode==='attach'?'选用明确正式版本':'主动替换固定版本'}}</h3><button class="quiet" :disabled="busy||!!forkSource||!!op.pending.value" @click="mode=null">取消</button></div><QuestionPicker :key="mode+instanceId" :initial-question-id="mode==='replace'?source?.questionId:undefined" :disabled="busy||!!forkSource||!!op.pending.value" @selected="selected"/><label v-if="mode==='attach'" class="check"><input v-model="required" type="checkbox" :disabled="busy||!!forkSource||!!op.pending.value">插入后设为必答</label>
<section v-if="review&&reviewQuestion" class="definition-issues"><h3>明确审查替换后的跳转规则</h3><p>原规则与新题型不兼容。请重新配置；确认空规则列表表示移除原跳转。必答、位置和实例ID保持。</p><fieldset :disabled="busy||!!forkSource||!!op.pending.value"><RuleEditor v-if="reviewQuestion.type!=='text'" :question="reviewQuestion" :questions="survey.draftDefinition.questions.map(q=>q.id===instanceId?reviewQuestion!:q)"/><p v-else>文本题不支持跳转。确认后移除原跳转规则。</p></fieldset></section>
<button class="primary" :disabled="busy||!!forkSource||!choice||dirty||!editable||blocked(mode!)" @click="perform(mode!)">{{op.pending.value?'重试原操作':review?'确认规则并替换':mode==='attach'?'确认插入选中版本':'确认替换为选中版本'}}</button></section>
</section></template>
