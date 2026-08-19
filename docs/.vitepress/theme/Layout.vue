<script setup lang="ts">
import { useData } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import LandingPage from './LandingPage.vue';

const { frontmatter } = useData();
</script>

<template>
  <LandingPage v-if="frontmatter.layout === 'landing'" />
  <DefaultTheme.Layout v-else />
</template>
