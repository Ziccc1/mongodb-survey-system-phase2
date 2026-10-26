<script setup lang="ts">
import {ref,onMounted,watch} from 'vue';
import {useRouter,onBeforeRouteLeave} from 'vue-router';
import type {Editor,ResourceReceipt,VersionSummary} from '@survey/shared';
import {api} from '../api';
import {useOperation} from '../library-client';
import {useVersions} from '../reporting-client';
const props=defineProps<{surveyId:string;disabled?:boolean}>(),router=useRouter(),versions=useVersions(props.surveyId),selected=ref<number|null>(null),revision=ref<number|null>(null),busy=ref(false),error=ref(''),op=useOperation();
const emit=defineEmits<{locked:[value:boolean]}>();
watch(()=>busy.value||!!op.pending.value,value=>emit('locked',value),{immediate:true});
async function load(){try{await versions.load();selected.value=versions.items.value[0]?.publishedVersion??null;revision.value=(await api<Editor>(`/surveys/${props.surveyId}`)).revision;}catch(e){error.value=(e as Error).message;}}
async function create(){if(!selected.value||revision.value===null||busy.value||props.disabled)return;busy.value=true;error.value='';try{const r=await op.run<ResourceReceipt>('/templates',{surveyId:props.surveyId,publishedVersion:selected.value,expectedSurveyRevision:revision.value});await router.push(`/templates/${r.resourceId}`);}catch(e){error.value=(e as Error).message;}finally{busy.value=false;}}
onBeforeRouteLeave(()=>!op.pending.value||window.confirm('模板创建结果尚未确认，确定离开？'));
onMounted(load);
</script>
<template><section class="panel"><h2>发布为公开结构模板</h2><p class="muted">明确选择已有发布版，模板固定其结构。仅有私人共享不足以公开；每位上游作者需给当前发布者具体版本的公开授权。</p><p v-if="error" class="error" role="alert">{{error}} <button v-if="!op.pending.value" class="quiet" @click="load">刷新发布版与修订</button></p><fieldset :disabled="busy||disabled||!!op.pending.value"><label for="template-release">源问卷发布版</label><select id="template-release" v-model="selected"><option v-for="v in versions.items.value" :key="v.publishedVersion" :value="v.publishedVersion">发布 v{{v.publishedVersion}}</option></select><button v-if="versions.cursor.value" class="quiet" @click="versions.load(true)">更多发布版</button></fieldset><p v-if="op.pending.value" role="status">创建结果未知，只能确认原请求；不能切换发布版。</p><button class="secondary" :disabled="busy||disabled||!selected||revision===null" @click="create">{{op.pending.value?'确认原模板创建':'创建固定公开模板'}}</button></section></template>
