<script setup lang="ts">
import DriftWall from '@/components/vue-bits/DriftWall.vue'
import { ref, onMounted, onUnmounted } from 'vue'

// Collection of local images from assets/local_cards
const allImages = [
  '/assets/local_cards/base2025/Mauritus.jpg',
  '/assets/local_cards/base2025/casual_plapla.jpeg',
  '/assets/local_cards/base2025/certificado_90mil.webp',
  '/assets/local_cards/base2025/como_dijo.jpg',
  '/assets/local_cards/base2025/cratinus.png',
  '/assets/local_cards/base2025/fuiste_denegado.webp',
  '/assets/local_cards/base2025/galbo_frasco.webp',
  '/assets/local_cards/base2025/giant_santerk.jpg',
  '/assets/local_cards/base2025/gino_amazed.webp',
  '/assets/local_cards/base2025/gino_carry_galbo.webp',
  '/assets/local_cards/base2025/gino_excelente.webp',
  '/assets/local_cards/base2025/gino_face.webp',
  '/assets/local_cards/base2025/gino_king.webp',
  '/assets/local_cards/base2025/gino_lobas.webp',
  '/assets/local_cards/base2025/glass_posta.jpg',
  '/assets/local_cards/base2025/golden_gwen.jpg',
  '/assets/local_cards/base2025/happy_folks.jpg',
  '/assets/local_cards/base2025/hentai.webp',
  '/assets/local_cards/base2025/invalid_santerk.webp',
  '/assets/local_cards/base2025/kevin_campeon.jpg',
  '/assets/local_cards/base2025/kevin_momia.webp',
  '/assets/local_cards/base2025/kevin_pool.jpg',
  '/assets/local_cards/base2025/manuk.jpg',
  '/assets/local_cards/base2025/marca_de_agua.webp',
  '/assets/local_cards/base2025/martin_sleep.webp',
  '/assets/local_cards/base2025/mas_90mil.webp',
  '/assets/local_cards/base2025/menos_90mil.webp',
  '/assets/local_cards/base2025/pajero.jpg',
  '/assets/local_cards/base2025/parece_arti.jpg',
  '/assets/local_cards/base2025/perdi_cartitas.webp',
  '/assets/local_cards/base2025/permitime_confirmar.webp',
  '/assets/local_cards/base2025/permitime_denegar.webp',
  '/assets/local_cards/base2025/permitime_dudar.webp',
  '/assets/local_cards/base2025/podria_ser_sticker.webp',
  '/assets/local_cards/base2025/posta_crema.webp',
  '/assets/local_cards/base2025/posta_cucharita.jpg',
  '/assets/local_cards/base2025/pringles.png',
  '/assets/local_cards/base2025/que_gracioso.jpg',
  '/assets/local_cards/base2025/regular_size_chizitos.jpg',
  '/assets/local_cards/base2025/sanguche_seco.webp',
  '/assets/local_cards/base2025/santerk_dragon.jpg',
  '/assets/local_cards/base2025/santerk_drunk.jpg',
  '/assets/local_cards/base2025/tranquilos_pregunte.webp',
  '/assets/local_cards/base2025/turno2.jpg',
  '/assets/local_cards/base2025/unamuno.jpg',
  '/assets/local_cards/base2025/wayne_rosarinos.webp',
  '/assets/local_cards/base2025/weakling.webp',
  '/assets/local_cards/base2025/wheel_tortuga.webp',
  '/assets/local_cards/base2026/garlick_boga.jpeg',
  '/assets/local_cards/base2026/shuffle_gino.jpeg',
  '/assets/local_cards/gordona/contento.jpg',
  '/assets/local_cards/kelano/kelano_vino.webp',
  '/assets/local_cards/leyendas/frutillas.jpg',
  '/assets/local_cards/base.jpg',
]

// Function to get random 40 images
function getRandomImages(count: number, imageList: string[]) {
  const shuffled = [...imageList].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, count)
}

const items = ref(
  getRandomImages(40, allImages).map(image => ({
    image,
    title: image.split('/').pop() || 'Image'
  }))
)

// Enough columns to cover the viewport width at any size
const columns = ref(6)
const tutorialModalOpen = ref(false)

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
        <h1 class="text-3xl font-bold text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]">Big Combat</h1>
        <p class="text-sm text-white/70 mt-1 drop-shadow-[0_1px_6px_rgba(0,0,0,0.8)]">
          El tcg con el que Gino soñó
        </p>
      </header>

      <main class="flex-1 px-4 pb-28 flex items-end justify-center">
        <div class="max-w-md w-full mb-4 bg-black/40 backdrop-blur-md rounded-2xl p-4 border border-white/10 shadow-xl">
          <h2 class="text-base font-semibold text-white mb-2">Que estoy viendo?</h2>
          <p class="text-sm text-white/70">
            Este es un tcg con cosas de otros, cosas propias y cosas que no sé de donde saqué.
            Para saber más:
          </p>
          <button
            @click="tutorialModalOpen = true"
            class="mt-3 w-full bg-white/10 hover:bg-white/20 text-white text-sm font-medium py-2 px-4 rounded-lg transition"
          >
            Tutorial
          </button>
        </div>
      </main>
    </div>

    <!-- Tutorial Modal -->
    <div v-if="tutorialModalOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" @click="tutorialModalOpen = false">
      <div class="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full mx-4 overflow-hidden shadow-2xl" @click.stop>
        <div class="p-6">
          <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-4">Tutorial</h3>
          <p class="text-gray-700 dark:text-gray-300">vos te pensas que voy a hacer un tutorial de como funciona esto?</p>
        </div>
        <div class="px-6 pb-6">
          <button
            @click="tutorialModalOpen = false"
            class="w-full bg-red-500/80 hover:bg-primary/90 text-white font-medium py-2 px-4 rounded-lg transition"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  </div>
</template>