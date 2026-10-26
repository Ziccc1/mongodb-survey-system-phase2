<script setup lang="ts">
import {ref,onMounted} from 'vue';
import {useRoute,useRouter} from 'vue-router';
import type {Page,LibraryQuestionSummary,ResourceReceipt} from '@survey/shared';
import {api} from '../api';
import {useOperation,queryPage} from '../library-client';
const route=useRoute(),router=useRouter(),scope=ref(route.query.scope==='shared'?'shared':'own'),rows=ref<LibraryQuestionSummary[]>([]),cursor=ref<string|null>(null),loading=ref(false),error=ref(''),busy=ref(false),title=ref('新题目'),op=useOperation();
async function load(more=false){loading.value=true;error.value='';try{const page=await api<Page<LibraryQuestionSummary>>('/questions'+queryPage({scope:scope.value,limit:'20',cursor:more?cursor.value??undefined:undefined}));rows.value=more?[...rows.value,...page.items]:page.items;cursor.value=page.nextCursor;}catch(e){error.value=(e as Error).message;}finally{loading.value=false;}}
async function create(){busy.value=true;error.value='';try{const result=await op.run<ResourceReceipt>('/questions',{content:{type:'text',title:title.value,validation:{}}});await router.push(`/questions/${result.resourceId}`);}catch(e){error.value=(e as Error).message;}finally{busy.value=false;}}
onMounted(()=>load());
</script>
<template><section class="narrow"><div class="page-heading"><div><h1 tabindex="-1">题目工作台</h1><p class="muted">先编辑草稿，再明确保存正式版本。问卷始终使用你选定的版本。</p></div><RouterLink to="/question-banks">管理题库 →</RouterLink></div>
<div class="editor-actions"><button :disabled="busy||!!op.pending.value" :aria-pressed="scope==='own'" class="secondary" @click="scope='own';load()">我的题目</button><button :disabled="busy||!!op.pending.value" :aria-pressed="scope==='shared'" class="secondary" @click="scope='shared';load()">共享给我</button></div>
<form v-if="scope==='own'" class="panel library-create" @submit.prevent="create"><label for="new-library-title">新题目题干</label><input id="new-library-title" v-model="title" :disabled="busy||!!op.pending.value"><button class="primary" :disabled="busy||!title.trim()">{{op.pending.value?'重试原创建':'创建题目草稿'}}</button><small>创建后可选择单选、多选、文本或数字题。</small></form>
<p v-if="error" role="alert" class="error">{{error}} <button class="quiet" @click="load()">重新读取</button></p><p v-if="loading" aria-busy="true" role="status">正在读取题目…</p>
<p v-if="!loading&&!rows.length&&!error" class="panel">{{scope==='own'?'还没有题目，可以先创建一个草稿。':'暂时没有有效共享题。作者共享给你的正式题目会显示在这里。'}}</p>
<ul class="survey-list"><li v-for="q in rows" :key="q.id"><RouterLink class="survey-row" :to="`/questions/${q.id}${scope==='shared'?'?shared=1':''}`"><span><strong>{{q.title}}</strong><small>{{q.ownerUsername}} · {{q.latestVersion===null?'尚无正式版':`最新正式 v${q.latestVersion}`}}</small></span><span>查看题目 →</span></RouterLink></li></ul><button v-if="cursor" class="secondary" :disabled="loading" @click="load(true)">加载更多题目</button>
</section></template>
