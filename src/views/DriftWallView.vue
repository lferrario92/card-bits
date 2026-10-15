<script setup lang="ts">
import DriftWall from '@/components/vue-bits/DriftWall.vue'
import { ref, onMounted, onUnmounted } from 'vue'

const items = ref([
  { image: 'https://picsum.photos/id/1015/600/400', title: 'Mountain View' },
  { image: 'https://picsum.photos/id/1025/600/400', title: 'Ocean Sunset' },
  { image: 'https://picsum.photos/id/1039/600/400', title: 'Forest Path' },
  { image: 'https://picsum.photos/id/1043/600/400', title: 'Desert Dunes' },
  { image: 'https://picsum.photos/id/1050/600/400', title: 'City Lights' },
  { image: 'https://picsum.photos/id/1062/600/400', title: 'Lake Reflection' },
  { image: 'https://picsum.photos/id/1069/600/400', title: 'Northern Lights' },
  { image: 'https://picsum.photos/id/1074/600/400', title: 'Waterfall' },
  { image: 'https://picsum.photos/id/1080/600/400', title: 'Canyon' },
  { image: 'https://picsum.photos/id/1084/600/400', title: 'Meadow' },
  { image: 'https://picsum.photos/id/106/600/400', title: 'Volcano' },
  { image: 'https://picsum.photos/id/110/600/400', title: 'Glacier' },
  { image: 'https://picsum.photos/id/133/600/400', title: 'Rainforest' },
  { image: 'https://picsum.photos/id/164/600/400', title: 'Coral Reef' },
])

// Enough columns to cover the viewport width at any size
const columns = ref(6)
function updateColumns() {
  const unit = 200 + 18
  columns.value = Math.max(5, Math.ceil((window.innerWidth * 1.4) / unit))
}

onMounted(() => {
  updateColumns()
  window.addEventListener('resize', updateColumns)
})

onUnmounted(() => {
  window.removeEventListener('resize', updateColumns)
})
</script>

<template>
  <div class="relative min-h-screen overflow-hidden bg-[#060010]">
    <!-- Full-screen animated background (no interaction) -->
    <div class="fixed inset-0 z-0 pointer-events-none" aria-hidden="true">
      <DriftWall
        :items="items"
        :columns="columns"
        :tile-width="200"
        :tile-height="132"
        :gap="18"
        :speed="46"
        :lift="64"
        :parallax="0"
        :pause-on-hover="false"
        :interactive="false"
        class="w-full h-full"
      />
    </div>

    <!-- Foreground content -->
    <div class="relative z-10 min-h-screen flex flex-col">
      <header class="px-4 py-8 text-center">
        <h1 class="text-3xl font-bold text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]">Drift Wall</h1>
        <p class="text-sm text-white/70 mt-1 drop-shadow-[0_1px_6px_rgba(0,0,0,0.8)]">
          Endless drifting tile wall — background, no interaction
        </p>
      </header>

      <main class="flex-1 px-4 pb-28 flex items-end justify-center">
        <div class="max-w-md w-full mb-4 bg-black/40 backdrop-blur-md rounded-2xl p-4 border border-white/10 shadow-xl">
          <h2 class="text-base font-semibold text-white mb-2">Ambient Background</h2>
          <p class="text-sm text-white/70">
            The wall drifts continuously and ignores all pointer input — no hover, no clicks, no tilt.
            It simply plays behind the content as a living backdrop.
          </p>
        </div>
      </main>
    </div>
  </div>
</template>