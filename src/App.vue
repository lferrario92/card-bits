<script setup lang="ts">
import { ref, computed } from 'vue'
import { RouterView, useRouter, useRoute } from 'vue-router'
import BottomNav from './components/BottomNav.vue'
import FloatingBoosterBubble from './components/FloatingBoosterBubble.vue'
import { useCreditsAutoRefresh } from './composables/useCredits'
import { useDeckSync } from './composables/useDeckSync'

const router = useRouter()
const route = useRoute()

// Fetches the signed-in user's profile (credits) once at app start and keeps
// it fresh while the app stays open. Lives here so it runs no matter which
// view is mounted.
useCreditsAutoRefresh()
// Refreshes localStorage deck snapshots with the backend's current card
// values (matched by card id) — see composables/useDeckSync.ts.
useDeckSync()

const currentPath = computed(() => route.path)
// The battle view is a full-screen surface with no bottom nav; every other
// route (including the online lobby) keeps the nav visible.
const hideNav = computed(() => route.name === 'BounceCards' || route.meta.hideNav === true)
</script>

<template>
  <div class="min-h-screen flex flex-col bg-white dark:bg-gray-900">
    <!-- Mobile-first 450px column: content stays phone-width on desktop.
         No transform here — a transformed ancestor would become the
         containing block for every fixed modal/backdrop inside. -->
    <div class="w-full max-w-[450px] mx-auto flex flex-col flex-1">
      <RouterView v-slot="{ Component }">
        <component :is="Component" />
      </RouterView>
    </div>
    <BottomNav v-if="!hideNav" :current-path="currentPath" />
    <FloatingBoosterBubble />
  </div>
</template>

<style scoped>
/* Ensure the app takes full height */
#app {
  min-height: 100vh;
  min-height: 100dvh;
}
</style>