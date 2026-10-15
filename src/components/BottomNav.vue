<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'

interface Props {
  currentPath: string
}

const props = defineProps<Props>()
const router = useRouter()

const navItems = [
  { path: '/balatro', label: 'Balatro', icon: '♠' },
  { path: '/bounce-cards', label: 'Bounce', icon: '◉' },
  { path: '/card-swap', label: 'Swap', icon: '🔄' },
  { path: '/stack-market', label: 'Stack', icon: '📚' },
  { path: '/drift-wall', label: 'Drift', icon: '≋' },
]

const isActive = (path: string) => props.currentPath === path

const navigate = (path: string) => {
  router.push(path)
}
</script>

<template>
  <nav class="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 safe-area-bottom z-50" aria-label="Main navigation">
    <div class="flex justify-around items-center h-16">
      <button
        v-for="item in navItems"
        :key="item.path"
        @click="navigate(item.path)"
        :class="[
          'flex flex-col items-center gap-1 px-4 py-2 transition-colors',
          isActive(item.path)
            ? 'text-primary'
            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
        ]"
        :aria-current="isActive(item.path) ? 'page' : undefined"
      >
        <span class="text-2xl" aria-hidden="true">{{ item.icon }}</span>
        <span class="text-xs font-medium">{{ item.label }}</span>
        <div v-if="isActive(item.path)" class="w-full h-0.5 bg-primary rounded-full mt-1" aria-hidden="true" />
      </button>
    </div>
  </nav>
</template>

<style scoped>
/* Hide scrollbar for webkit browsers on the nav */
nav::-webkit-scrollbar {
  display: none;
}
</style>