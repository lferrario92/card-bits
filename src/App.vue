<script setup lang="ts">
import { ref, computed } from 'vue'
import { RouterView, useRouter, useRoute } from 'vue-router'
import BottomNav from './components/BottomNav.vue'

const router = useRouter()
const route = useRoute()

const currentPath = computed(() => route.path)
// The card battle view is a full-screen game surface with no bottom nav.
const hideNav = computed(() => route.name === 'BounceCards')
</script>

<template>
  <div class="min-h-screen flex flex-col bg-white dark:bg-gray-900">
    <RouterView v-slot="{ Component }">
      <component :is="Component" />
    </RouterView>
    <BottomNav v-if="!hideNav" :current-path="currentPath" />
  </div>
</template>

<style scoped>
/* Ensure the app takes full height */
#app {
  min-height: 100vh;
  min-height: 100dvh;
}
</style>