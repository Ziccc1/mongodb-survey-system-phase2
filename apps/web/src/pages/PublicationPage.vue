<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import type { Editor } from '@survey/shared';
import { api } from '../api';
import PublicationPanel from '../components/PublicationPanel.vue';
import TemplatePublisher from '../components/TemplatePublisher.vue';
import {libraryEnabled} from '../public-config';
import UiIcon from '../components/UiIcon.vue';

const route = useRoute();
const survey = ref<Editor | null>(null);
const loading = ref(true), error = ref(''), locked = ref(false), templateLocked = ref(false);
const expired = computed(() => !!survey.value?.settings.expiresAt && new Date(survey.value.settings.expiresAt).getTime() <= Date.now());
const collecting = computed(() => survey.value?.status === 'published' && !expired.value);
const heading = computed(() => {
  if (!survey.value || survey.value.currentPublishedVersion === null) return '问卷尚未发布';
  if (survey.value.status === 'closed') return '问卷已关闭';
  if (survey.value.status === 'paused') return '收集已暂停';
  if (expired.value) return '问卷已截止';
  return '发布成功';
});
const description = computed(() => collecting.value
  ? '问卷已准备就绪，复制下方链接即可分享。填写者需要登录后作答。'
  : survey.value?.status === 'paused'
    ? '当前不接收新答卷。可返回编辑页修改，完成后重新发布，分享链接保持不变。'
    : survey.value?.status === 'closed'
      ? '已停止接收新答卷，历史答卷和统计结果仍可查看。'
      : expired.value ? '已到收集截止时间，当前不再接收新答卷。' : '请返回编辑页完成题目配置后发布。');
const status = computed(() => collecting.value ? '收集中' : survey.value?.status === 'closed' ? '已关闭' : survey.value?.status === 'paused' ? '已暂停' : expired.value ? '已截止' : '草稿');
const deadline = computed(() => survey.value?.settings.expiresAt
  ? new Date(survey.value.settings.expiresAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '未设置');

async function load() {
  loading.value = true; error.value = '';
  try { survey.value = await api<Editor>(`/surveys/${route.params.surveyId}`); }
  catch (e) { error.value = (e as Error).message; }
  finally {
    loading.value = false;
    await nextTick();
    document.getElementById('publication-heading')?.focus({ preventScroll: true });
  }
}
onMounted(() => { window.scrollTo({ top: 0, behavior: 'instant' }); load(); });
</script>

<template>
  <section class="publication-page">
    <div class="publication-nav">
      <RouterLink :to="`/surveys/${route.params.surveyId}`">← 返回编辑页</RouterLink>
      <RouterLink to="/surveys">我的问卷</RouterLink>
    </div>
    <p v-if="loading" class="panel" role="status" aria-busy="true">正在读取发布状态…</p>
    <div v-else-if="error" class="error" role="alert">{{ error }} <button class="quiet" @click="load">重新加载</button></div>
    <template v-else-if="survey">
      <div class="publication-heading" :class="{ 'is-collecting': collecting }">
        <span class="publication-symbol" aria-hidden="true"><UiIcon :name="collecting ? 'check' : 'document'" :size="28" /></span>
        <div><p class="eyebrow">问卷发布与收集</p><h1 id="publication-heading" tabindex="-1">{{ heading }}</h1><p>{{ description }}</p></div>
        <span class="badge">{{ status }}</span>
      </div>
      <div class="publication-content">
        <PublicationPanel v-if="survey.currentPublishedVersion !== null" :survey="survey" :dirty="false" :disabled="templateLocked" @changed="load" @published="load" @locked="locked = $event" />
        <div v-else class="panel"><h2>完成配置后即可发布</h2><p class="muted">此问卷还没有正式发布版本，暂时不能分发填写链接。</p><RouterLink class="button primary" :to="`/surveys/${survey.id}`">返回编辑问卷</RouterLink></div>
        <aside class="panel publication-summary" aria-labelledby="publication-summary-heading">
          <h2 id="publication-summary-heading">问卷概况</h2>
          <p class="publication-title">{{ survey.draftDefinition.title }}</p>
          <dl>
            <div><dt>当前发布版本</dt><dd>{{ survey.currentPublishedVersion === null ? '尚未发布' : `v${survey.currentPublishedVersion}` }}</dd></div>
            <div><dt>累计答卷</dt><dd>{{ survey.cumulativeResponseCount }} 份</dd></div>
            <div><dt>当前版本答卷</dt><dd>{{ survey.currentVersionResponseCount }} 份</dd></div>
            <div><dt>截止时间</dt><dd>{{ deadline }}</dd></div>
            <div><dt>匿名填写</dt><dd>{{ survey.settings.allowAnonymous ? '允许' : '不允许' }}</dd></div>
            <div><dt>重复填写</dt><dd>{{ survey.settings.allowRepeat ? '允许' : '不允许' }}</dd></div>
          </dl>
          <p class="publication-hint">{{ locked ? '正在确认操作结果，请保持当前页面。' : '需要修改题目时，先暂停收集，再返回编辑页。重新发布后链接保持不变。' }}</p>
        </aside>
      </div>
      <TemplatePublisher v-if="libraryEnabled()&&survey.currentPublishedVersion!==null" :survey-id="survey.id" :disabled="locked" @locked="templateLocked=$event"/>
    </template>
  </section>
</template>

<style scoped>
.publication-page { max-width: 1100px; margin: 0 auto; }
.publication-nav { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 24px; font-size: 13px; }
.publication-heading { display: flex; align-items: center; gap: 20px; padding: 28px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; margin-bottom: 24px; }
.publication-heading.is-collecting { background: #eef5ff; border-color: #cddff4; }
.publication-symbol { width: 56px; height: 56px; display: grid; place-items: center; flex-shrink: 0; background: white; border: 1px solid var(--border); border-radius: 50%; color: var(--accent); }
.publication-heading h1 { font-size: 28px; margin-bottom: 8px; }
.publication-heading .eyebrow { margin-bottom: 8px; }
.publication-heading p:last-child { margin: 0; color: var(--muted); font-size: 13px; }
.publication-heading>.badge { margin-left: auto; }
.publication-content { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(260px, 1fr); gap: 24px; align-items: start; }
.publication-content :deep(.publication-panel) { margin: 0; padding: 28px; min-width: 0; }
.publication-content :deep(.publication-panel .editor-actions) { flex-wrap: wrap; }
.publication-content :deep(.publication-panel input[readonly]) { font-size: 14px; }
.publication-content :deep(.copy-link) { margin-top: 12px; }
.publication-summary { padding: 24px; }
.publication-summary h2 { font-size: 16px; }
.publication-title { font-weight: 600; overflow-wrap: anywhere; padding-bottom: 16px; border-bottom: 1px solid var(--border); }
.publication-summary dl { margin: 0; font-size: 13px; }
.publication-summary dl>div { display: flex; justify-content: space-between; gap: 16px; padding: 8px 0; }
.publication-summary dt { color: var(--muted); flex-shrink: 0; }
.publication-summary dd { margin: 0; text-align: right; overflow-wrap: anywhere; }
.publication-hint { margin: 20px 0 0; padding: 12px; background: #fff8df; color: #65552d; border-radius: 8px; font-size: 12px; }
@media (max-width: 900px) { .publication-content { grid-template-columns: 1fr; } .publication-heading { align-items: flex-start; flex-wrap: wrap; } }
</style>
