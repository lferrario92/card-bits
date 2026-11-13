<script setup lang="ts">
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { useCredits } from '@/composables/useCredits'
import { useBoosterBubble } from '@/composables/useBoosterBubble'

const router = useRouter()
const route = useRoute()
const { isAuthenticated } = useAuth()
const { openableBoosters } = useCredits()
const { suppressed } = useBoosterBubble()

/** Views where the floating bubble belongs. */
const BUBBLE_ROUTES = new Set(['/', '/drift-wall', '/profile', '/decks'])

const visible = computed(() => {
  if (!isAuthenticated.value) return false
  if (suppressed.value) return false
  // No affordable booster → nothing to open from here; the bubble would
  // only ever show a gray 0. (The market stays reachable via the bottom
  // nav's "Boosters" link.) Also hides while the balance is still loading.
  if (openableBoosters.value <= 0) return false
  return BUBBLE_ROUTES.has(route.path)
})

function openBoosters() {
  void router.push({ name: 'CardSwap' })
}
</script>

<template>
  <!-- The shell spans the window but is capped to the same 450px column as
       the views (mx-auto centers a fixed element whose edges are pinned), so
       the bubble hugs the column's right edge at any desktop width.
       Outer wrapper only carries position + idle float; the button inside
       owns hover/active transforms so the two never fight over `transform`. -->
  <div
    v-if="visible"
    class="fixed inset-x-0 mx-auto max-w-[450px] z-[45] pointer-events-none bubble-float"
    style="bottom: calc(5rem + env(safe-area-inset-bottom))"
  >
    <div class="flex justify-end pr-4">
      <button
        type="button"
        @click="openBoosters"
        aria-label="Open boosters"
        class="pointer-events-auto relative block w-16 h-16 rounded-full shadow-xl ring-2 ring-white dark:ring-gray-700 transition-transform duration-150 hover:scale-105 active:scale-90 focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/60"
      >
        <span class="absolute inset-0 rounded-full overflow-hidden bg-[#151a22]">
          <img
            src="/booster_pack.jpg"
            alt=""
            draggable="false"
            class="w-full h-full object-contain"
          />
        </span>

        <!-- Openable-booster count: floor(credits / 5000), max 4. The bubble
             only renders above 0, so the badge is always the active color. -->
        <span
          class="absolute -top-1 -right-1 min-w-[22px] h-[22px] px-1 rounded-full border-2 border-white dark:border-gray-900 bg-rose-500 text-white text-[11px] font-bold leading-none flex items-center justify-center shadow"
          aria-hidden="true"
        >
          {{ openableBoosters }}
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped>
@keyframes bubble-float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-5px);
  }
}

.bubble-float {
  animation: bubble-float 3s ease-in-out infinite;
}

@media (prefers-reduced-motion: reduce) {
  .bubble-float {
    animation: none;
  }
}
</style>
