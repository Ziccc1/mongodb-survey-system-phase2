<script setup lang="ts">
import { computed, watch, nextTick, onMounted, onBeforeUnmount, ref } from 'vue';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
import { canonical, newQuestion, normalizeQuestions, validateQuestions, surveyTextIssues, QUESTION_LABELS } from '@survey/shared';
import type { Editor, CreateSurvey, Question, QuestionType, SaveResult } from '@survey/shared';
import { api, RequestError } from '../api';
import MetadataEditor from '../components/MetadataEditor.vue';
import QuestionCard from '../components/QuestionCard.vue';
import PublicationPanel from '../components/PublicationPanel.vue';
import UiIcon from '../components/UiIcon.vue';
import SurveyQuestionSources from '../components/SurveyQuestionSources.vue';
import {libraryEnabled} from '../public-config';
import type {InstanceSource} from '@survey/shared';
const sources=ref<InstanceSource[]>([]),sourceLocked=ref(false);
const selectedQuestion=ref('');
const publicationLocked = ref(false);
const route = useRoute(), router = useRouter(), survey = ref<Editor | null>(null), metadata = ref<CreateSurvey>({ title: '' }), questions = ref<Question[]>([]);
const loading = ref(true), busy = ref(false), error = ref(''), notice = ref(''), blocked = ref(false), remote = ref<Editor | null>(null);
const baselineMetadata = ref(''), baselineQuestions = ref('');
const metadataKey = (input: CreateSurvey) => canonical({ ...input, title: input.title.trim() });
const questionKey = (input: Question[]) => { try { return canonical(normalizeQuestions(input)); } catch { return canonical(input); } };
const metadataDirty = computed(() => metadataKey(metadata.value) !== baselineMetadata.value);
const questionsDirty = computed(() => questionKey(questions.value) !== baselineQuestions.value);
const dirty = computed(() => !!survey.value && (metadataDirty.value || questionsDirty.value));
const checks = computed(() => validateQuestions(questions.value));
const issues = computed(() => questionsDirty.value ? checks.value.validationIssues : survey.value?.validationIssues ?? []);
const editable = computed(() => !!survey.value && ['draft', 'paused'].includes(survey.value.status));
const url = computed(() => `/surveys/${route.params.surveyId}`);
const metaFrom = (data: Editor): CreateSurvey => ({ title: data.draftDefinition.title, description: data.draftDefinition.description, ...data.settings });
function adopt(data: Editor) {
  survey.value = data; metadata.value = structuredClone(metaFrom(data)); questions.value = JSON.parse(JSON.stringify(data.draftDefinition.questions));
  baselineMetadata.value = metadataKey(metadata.value); baselineQuestions.value = questionKey(questions.value); blocked.value = false; remote.value = null; sourceLocked.value=false;
}
async function load() {
  loading.value = true; error.value = '';
  try { const data=await api<Editor>(url.value);if(libraryEnabled())sources.value=(await api<{items:InstanceSource[]}>(url.value+'/question-sources')).items;adopt(data); }
  catch (e) { if (e instanceof RequestError && e.status === 401) await router.push('/login'); else error.value = (e as Error).message; }
  finally { loading.value = false; }
}
async function openPublication() {
  try { await router.push(`${url.value}/publication`); }
  catch { await load(); error.value = '发布已成功，但页面跳转失败。请通过“发布与收集”入口查看分享链接。'; }
}
async function inspectRemote() {
  try { remote.value = await api<Editor>(url.value); } catch (e) { error.value = `本地编辑已保留，读取服务器版本失败：${(e as Error).message}`; }
}
async function save(section: 'metadata' | 'questions') {
  if (!survey.value || busy.value || blocked.value || publicationLocked.value || sourceLocked.value) return;
  if (section === 'questions' && checks.value.errors.length) return;
  if (section === 'metadata' && surveyTextIssues(metadata.value).length) return;
  busy.value = true; error.value = ''; notice.value = '';
  try {
    const patch: Record<string, unknown> = { expectedRevision: survey.value.revision };
    const original = metaFrom(survey.value);
    for (const key of ['title', 'description', 'allowAnonymous', 'allowRepeat', 'expiresAt'] as const) {
      const value = key === 'title' ? metadata.value.title.trim() : metadata.value[key];
      if (canonical(value) !== canonical(original[key])) patch[key] = value;
    }
    if (Object.keys(patch).length === 1) patch.expiresAt = metadata.value.expiresAt ?? null;
    const data = await api<SaveResult>(section === 'metadata' ? url.value : `${url.value}/questions`, section === 'metadata' ? 'PATCH' : 'PUT', section === 'metadata' ? patch : { questions: questions.value, expectedRevision: survey.value.revision });
    Object.assign(survey.value, data);
    if (section === 'metadata') { survey.value.draftDefinition.title = metadata.value.title.trim(); survey.value.draftDefinition.description = metadata.value.description ?? ''; survey.value.settings = { allowAnonymous: metadata.value.allowAnonymous ?? false, allowRepeat: metadata.value.allowRepeat ?? false, expiresAt: metadata.value.expiresAt ?? null }; baselineMetadata.value = metadataKey(metadata.value); }
    else { survey.value.draftDefinition.questions = structuredClone(questions.value.map(q => JSON.parse(JSON.stringify(q)))); baselineQuestions.value = questionKey(questions.value); }
    notice.value = section === 'metadata' ? '基本信息已保存。' : '题目已保存，刷新后可以恢复。';
  } catch (e) {
    error.value = (e as Error).message;
    if (e instanceof RequestError && e.status === 401) { /* Keep local content visible instead of navigating away. */ error.value = '登录已失效，本地编辑仍保留。请在另一个标签页重新登录后再保存。'; }
    else if (e instanceof RequestError && ['EDIT_CONFLICT', 'SURVEY_STATE_CONFLICT', 'POLICY_LOCKED'].includes(e.code)) { blocked.value = true; await inspectRemote(); }
    else if (!(e instanceof RequestError) || e.status >= 500) { blocked.value = true; error.value = '保存结果尚未确认，本地编辑已保留。请先核对服务器版本。'; await inspectRemote(); }
  } finally { busy.value = false; }
}
function keepLocal() {
  if (!remote.value) return;
  const data = remote.value;
  survey.value = data; baselineMetadata.value = metadataKey(metaFrom(data)); baselineQuestions.value = questionKey(data.draftDefinition.questions);
  remote.value = null; blocked.value = false; error.value = ''; notice.value = '本地编辑已保留，并采用服务器最新修订号。请确认差异后分别保存，保存题目会整体替换服务器题目。';
}
function useRemote() { if (remote.value && window.confirm('放弃本地未保存的编辑，采用服务器版本？')) { adopt(remote.value); error.value = ''; notice.value = '已采用服务器版本。'; } }
async function add(type: QuestionType) {
  if (questions.value.length >= 100) return;
  const question = newQuestion(type); questions.value.push(question); selectedQuestion.value=question.id;
  await nextTick(); const input = document.getElementById(`title-${question.id}`); input?.focus({preventScroll:true}); input?.scrollIntoView({block:"center",behavior:"auto"});
}
watch(()=>questions.value.map(q=>q.id),ids=>{if(!ids.includes(selectedQuestion.value))selectedQuestion.value=ids[0]??'';});
async function selectQuestion(id:string){selectedQuestion.value=id;await nextTick();const input=document.getElementById(`title-${id}`) as HTMLTextAreaElement|null;const target=input&&!input.disabled&&!input.matches(':disabled')?input:document.getElementById(`heading-${id}`);target?.focus({preventScroll:true});target?.scrollIntoView({block:'center',behavior:'auto'});}
async function openSettings(){const el=document.getElementById('editor-settings') as HTMLDetailsElement|null;if(el){el.open=true;await nextTick();el.scrollIntoView({block:'start'});el.querySelector<HTMLElement>('input:not(:disabled)')?.focus({preventScroll:true});}}
function showAdd(){document.querySelector('.add-question-area')?.scrollIntoView({block:'center',behavior:'auto'});}
function move(index: number, delta: number) { const [question] = questions.value.splice(index, 1); questions.value.splice(index + delta, 0, question); }
function beforeUnload(event: BeforeUnloadEvent) { if (dirty.value || sourceLocked.value) { event.preventDefault(); event.returnValue = ''; } }
onBeforeRouteLeave(() => (!dirty.value&&!sourceLocked.value) || window.confirm(sourceLocked.value?'题目操作尚未确认，离开会丢失原请求重试信息。确定离开？':'有未保存的编辑，确定离开？'));
onMounted(() => { window.addEventListener('beforeunload', beforeUnload); load(); });
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload));
</script>
<template><section class="editor-page"><RouterLink class="back" to="/surveys">← 返回我的问卷</RouterLink><p v-if="loading" class="panel" role="status" aria-busy="true">正在读取问卷…</p>
  <p v-if="error" class="error" role="alert">{{ error }} <button v-if="!survey" class="quiet" @click="load">重新加载</button></p>
  <template v-if="survey && !loading"><div class="page-heading"><div><h1 tabindex="-1">{{ survey.draftDefinition.title }}</h1><p class="muted">基本信息和题目分别保存，不会自动保存。</p></div><div class="editor-actions"><RouterLink v-if="survey.currentPublishedVersion !== null" class="button secondary" :to="`${url}/publication`">发布与收集</RouterLink><span class="badge">{{ survey.status === 'draft' ? '未发布草稿' : survey.status === 'paused' ? '已暂停' : survey.status === 'published' ? '收集中' : '已关闭' }}</span></div></div>
  <p v-if="notice" class="saved" role="status">{{ notice }}</p>
  <section v-if="blocked" class="conflict panel" aria-labelledby="conflict-heading"><h2 id="conflict-heading">先比较服务器版本，本地编辑已保留</h2><p>不会自动覆盖或重试保存。请比较后选择如何继续。</p><template v-if="remote"><p>服务器修订 {{ remote.revision }}；{{ remote.draftDefinition.title }}，共 {{ remote.draftDefinition.questions.length }} 题。</p><details><summary>查看服务器内容</summary><pre>{{ JSON.stringify({ metadata: metaFrom(remote), questions: remote.draftDefinition.questions }, null, 2) }}</pre></details><div class="editor-actions"><button type="button" class="secondary" @click="keepLocal">已比较，保留本地并采用最新修订号</button><button type="button" class="quiet" @click="useRemote">放弃本地并采用服务器版本</button></div></template><button v-else class="secondary" @click="inspectRemote">重新读取服务器版本</button></section>
  <div class="editor-layout"><aside class="question-outline"><div class="outline-heading"><UiIcon name="layers" :size="18"/><h2>题目目录</h2><span>{{questions.length}}</span></div><button type="button" class="outline-settings" @click="openSettings"><UiIcon name="edit" :size="16"/>基本信息与填写设置</button><p v-if="!questions.length" class="outline-empty">题目添加后，将在这里显示。</p><ol><li v-for="(q,i) in questions" :key="q.id"><button type="button" :aria-label="`第${i+1}题：${q.title||'未命名题目'}`" :aria-current="selectedQuestion===q.id?'true':undefined" @click="selectQuestion(q.id)"><span class="outline-number">{{i+1}}</span><span class="outline-title">{{q.title||'未命名题目'}}<small>{{QUESTION_LABELS[q.type]}}</small></span><UiIcon :name="q.type" :size="16"/></button></li></ol><button class="outline-add" type="button" :disabled="!editable" @click="showAdd"><UiIcon name="plus" :size="16"/>添加题目</button><p class="outline-help">点击目录直达题目。修改后请手动保存。</p></aside><div class="editor-canvas">
  <details id="editor-settings" class="editor-settings" :open="questions.length===0"><summary><span><UiIcon name="edit" :size="18"/>基本信息与填写设置</span><small>{{metadataDirty?'有未保存修改':'展开修改标题、说明和填写策略'}}</small></summary><MetadataEditor :model="metadata" :survey="survey" :busy="busy || publicationLocked || sourceLocked" :blocked="blocked" :dirty="metadataDirty" @save="save('metadata')" /></details>
  <section class="question-section"><h2>题目 <span class="muted">{{ questions.length }} / 100</span></h2><p v-if="!editable" class="muted">当前状态不能编辑题目。可前往“发布与收集”暂停收集，再返回修改。</p>
    <div v-if="checks.errors.length" class="error" role="alert"><strong>请先修复配置再保存题目</strong><ul><li v-for="item in checks.errors" :key="`${item.field}-${item.code}`">{{ item.message }}</li></ul></div>
    <div v-if="issues.length" class="definition-issues" aria-live="polite"><h3>草稿待完善</h3><p>以下问题允许保留在草稿中，发布前需要完善。</p><ul><li v-for="item in issues" :key="`${item.field}-${item.code}`">{{ item.message }}</li></ul></div>
    <SurveyQuestionSources v-if="libraryEnabled()" :survey="survey" :dirty="dirty" @changed="load" @sources="sources=$event" @locked="sourceLocked=$event"/><fieldset class="plain-fieldset" :disabled="busy || publicationLocked || sourceLocked || !editable">
      <QuestionCard :class="{'is-current':selectedQuestion===question.id}" @focusin="selectedQuestion=question.id" v-for="(question, index) in questions" :key="question.id" :question="question" :index="index" :questions="questions" :content-locked="libraryEnabled() && sources.some(s=>s.instanceId===question.id)" @move="move(index, $event)" @remove="questions.splice(index, 1)" />
      <div class="add-question-area"><h3>{{ questions.length ? "继续添加题目" : "添加第一道题" }}</h3><p class="muted">选择题型，添加后直接编辑题干。修改后请手动保存。</p><div class="editor-actions add-questions"><button v-for="item in (['single', 'multiple', 'text', 'number'] as const)" :key="item" type="button" class="secondary" :disabled="questions.length >= 100" @click="add(item)">添加{{ { single: '单选题', multiple: '多选题', text: '文本题', number: '数字题' }[item] }}</button></div></div>
    </fieldset>

  </section></div><aside class="editor-side"><section class="save-panel"><div class="save-panel-heading"><UiIcon name="check" :size="18"/><h2>保存编辑</h2></div><p>基本信息和题目分别保存；保存草稿不会生成发布版本。</p>    <div class="editor-save-bar"><span class="muted">{{ questionsDirty ? '有未保存的题目修改' : '题目已保存' }} · 修订 {{ survey.revision }}</span><button class="primary" :disabled="busy || publicationLocked || sourceLocked || blocked || !editable || checks.errors.length > 0" @click="save('questions')">{{ busy ? '保存中…' : '保存题目' }}</button></div></section><PublicationPanel :survey="survey" :dirty="dirty" :disabled="sourceLocked||busy||blocked" @changed="load" @published="openPublication" @locked="publicationLocked = $event" /></aside></div></template>
</section></template>
