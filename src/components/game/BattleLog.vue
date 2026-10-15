<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'

const props = defineProps<{
  entries: string[]
}>()

const scrollRef = ref<HTMLElement | null>(null)

watch(
  () => props.entries.length,
  async () => {
    await nextTick()
    const el = scrollRef.value
    if (el) el.scrollTop = el.scrollHeight
  }
)
</script>

<template>
  <div ref="scrollRef" class="h-20 overflow-y-auto no-scrollbar rounded-lg bg-gray-100 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 px-2.5 py-1.5 space-y-0.5">
    <p v-for="(entry, i) in entries" :key="i" class="text-[11px] leading-snug text-gray-600 dark:text-gray-300">
      <span class="text-gray-400 dark:text-gray-500">›</span> {{ entry }}
    </p>
    <p v-if="entries.length === 0" class="text-[11px] text-gray-400 dark:text-gray-500">Battle log will appear here…</p>
  </div>
</template>

<style scoped>
.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { scrollbar-width: none; }
</style>
