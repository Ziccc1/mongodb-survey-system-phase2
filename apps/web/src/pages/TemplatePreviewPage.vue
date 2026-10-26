<script setup lang="ts">
import {ref,onMounted} from 'vue';
import {useRoute,useRouter,onBeforeRouteLeave} from 'vue-router';
import type {TemplatePreview,TemplateSummary,TemplateAdoption,Page} from '@survey/shared';
import {api} from '../api';
import {useOperation,queryPage} from '../library-client';
import DefinitionView from '../components/DefinitionView.vue';
const route=useRoute(),router=useRouter(),id=String(route.params.templateId),template=ref<TemplatePreview|null>(null),mine=ref(false),title=ref(''),busy=ref(false),error=ref(''),op=useOperation();
async function load(){busy.value=true;error.value='';try{template.value=await api<TemplatePreview>(`/templates/${id}`);title.value=template.value.title;let cursor:string|null=null;do{const p:Page<TemplateSummary>=await api('/templates'+queryPage({scope:'mine',limit:'100',cursor:cursor??undefined}));mine.value=p.items.some(t=>t.id===id);cursor=p.nextCursor;}while(cursor&&!mine.value);}catch(e){error.value=(e as Error).message;}finally{busy.value=false;}}
async function adopt(){if(!template.value||busy.value)return;busy.value=true;error.value='';try{const r=await op.run<TemplateAdoption>(`/templates/${id}/adoptions`,{expectedTemplateRevision:template.value.revision,...(title.value.trim()===template.value.title?{}:{title:title.value})});await router.push(`/surveys/${r.surveyId}`);}catch(e){error.value=(e as Error).message;}finally{busy.value=false;}}
onBeforeRouteLeave(()=>!op.pending.value||window.confirm('选用结果尚未确认，确定离开？请保留原请求确认。'));
onMounted(load);
</script>
<template><section class="library-page"><RouterLink class="back" to="/templates">← 返回模板广场</RouterLink><h1 tabindex="-1">固定模板预览</h1><p class="muted">选用只包含此结构中的具体版本，不授予源题其他版本或他人问卷权限。选用后的匿名、重复和截止设置从默认值开始。</p><p v-if="error" class="error" role="alert">{{error}} <button v-if="!op.pending.value" class="quiet" @click="load">重新读取模板</button></p><p v-if="busy" role="status" aria-busy="true">正在核对或保存…</p><template v-if="template"><p v-if="!template.eligible||template.status!=='listed'" class="saved" role="status">此模板当前不可新选用。已经生成的问卷继续保留。</p><h2>{{template.title}}</h2><DefinitionView :definition="{title:template.title,description:template.description,questions:template.questions}"/><form class="panel template-adoption" @submit.prevent="adopt"><h2>生成我的新问卷</h2><label for="adoption-title">新问卷标题</label><input id="adoption-title" v-model="title" :disabled="busy||!!op.pending.value"><p v-if="op.pending.value" role="status">结果尚未确认，只能用原请求和原key重试本次选用。</p><button class="primary" :disabled="busy||!title.trim()||!template.eligible||template.status!=='listed'">{{op.pending.value?'确认原选用结果':'选用并生成我的草稿'}}</button></form><RouterLink v-if="mine" to="/templates?scope=mine">管理我的模板上下架 →</RouterLink></template></section></template>

<style scoped>
.template-adoption button{margin-top:16px}
</style>
