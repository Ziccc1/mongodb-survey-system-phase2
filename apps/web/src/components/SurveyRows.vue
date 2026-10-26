<script setup lang="ts">
import {onMounted,onUnmounted,ref} from 'vue';
import type {SurveySummary} from '@survey/shared';
import UiIcon from './UiIcon.vue';
defineProps<{items:SurveySummary[];compact?:boolean}>();
const now=ref(Date.now());
let clock:ReturnType<typeof setInterval>|undefined;
onMounted(()=>{clock=setInterval(()=>{now.value=Date.now();},1000);});
onUnmounted(()=>{if(clock)clearInterval(clock);});
const expired=(item:SurveySummary)=>item.status==='published'&&!!item.expiresAt&&new Date(item.expiresAt).getTime()<=now.value;
const statusLabels={draft:'草稿',published:'收集中',paused:'已暂停',closed:'已关闭'};
const format=(value:string)=>new Date(value).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Shanghai'});
</script>
<template><div class="managed-surveys" :class="{'is-compact':compact}"><div class="survey-columns" aria-hidden="true"><span>问卷名称</span><span>状态</span><span>创建时间</span><span>累计答卷</span><span>操作</span></div><ul class="survey-list"><li v-for="item in items" :key="item.id"><RouterLink :to="`/surveys/${item.id}`" class="survey-row"><span class="survey-identity"><span class="document-tile"><UiIcon name="document" :size="22"/></span><span class="survey-name"><strong>{{item.title}}</strong><small>{{item.currentPublishedVersion===null?'尚未发布':`当前版本 v${item.currentPublishedVersion}`}}</small></span></span><span class="badge" :data-status="expired(item)?'expired':item.status">{{expired(item)?'已截止':statusLabels[item.status]}}</span><time :datetime="item.createdAt">{{format(item.createdAt)}}</time><span class="row-response">{{item.cumulativeResponseCount}} <small>份</small></span><span class="row-action">管理问卷 <UiIcon name="arrow" :size="16"/></span></RouterLink></li></ul></div></template>
