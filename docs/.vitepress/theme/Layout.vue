<script setup lang="ts">
import { useData } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import LandingPage from './LandingPage.vue';

const { frontmatter } = useData();
</script>

<template>
  <LandingPage v-if="frontmatter.layout === 'landing'" />
  <DefaultTheme.Layout v-else>
    <template #not-found>
      <main class="custom-not-found">
        <p>404 / SIGNAL LOST</p>
        <h1>This frame does not exist.</h1>
        <a href="/node-ffmpeg/">Return to node-ffmpeg</a>
      </main>
    </template>
  </DefaultTheme.Layout>
</template>
