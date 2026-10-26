<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from './api';
import { currentUser } from './session';
import {libraryEnabled} from './public-config';
const router = useRouter(), error = ref(''), busy = ref(false);
async function logout() {
  busy.value = true; error.value = '';
  try { await api('/auth/logout', 'POST'); currentUser.value = null; await router.push('/login'); }
  catch (e) { error.value = (e as Error).message; } finally { busy.value = false; }
}
</script>
<template>
  <a class="skip" href="#main">跳到主要内容</a>
  <header><div class="header-inner"><RouterLink class="brand" to="/dashboard"><span class="brand-mark" aria-hidden="true">问</span>问卷工作台</RouterLink>
    <nav aria-label="主导航" v-if="currentUser"><RouterLink to="/dashboard">首页</RouterLink><RouterLink to="/surveys">我的问卷</RouterLink><RouterLink v-if="libraryEnabled()" to="/questions">题目</RouterLink><RouterLink v-if="libraryEnabled()" to="/question-banks">题库</RouterLink><RouterLink v-if="libraryEnabled()" to="/templates">模板广场</RouterLink><span class="username">{{ currentUser.username }}</span><button class="quiet" :disabled="busy" @click="logout">{{ busy ? '退出中…' : '退出登录' }}</button></nav>
  </div></header>
  <main id="main" tabindex="-1"><p v-if="error" role="alert" class="error">{{ error }}</p><RouterView :key="$route.fullPath.split('#')[0]" /></main>
  <footer>数据库课程项目 · 问卷工作台</footer>
</template>
