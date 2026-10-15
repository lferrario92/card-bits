<script setup lang="ts">
import Balatro from '@/components/vue-bits/Balatro.vue'
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <header class="px-4 py-6 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40">
      <h1 class="text-2xl font-bold text-center text-gray-900 dark:text-white">Balatro Background</h1>
    </header>
    <main class="flex-1 relative">
      <Balatro class="absolute inset-0" />
      <div class="relative z-10 p-6 max-w-4xl mx-auto">
        <div class="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-gray-200 dark:border-gray-700">
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Interactive WebGL Shader</h2>
          <p class="text-gray-600 dark:text-gray-300 mb-4">
            The Balatro component renders a customizable pixel-painted shader background with mouse interaction.
            Move your mouse around to see the effect respond to your cursor position.
          </p>
          <div class="grid gap-4 md:grid-cols-2">
            <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <h3 class="font-medium text-gray-900 dark:text-white mb-2">Features</h3>
              <ul class="text-sm text-gray-600 dark:text-gray-300 space-y-1">
                <li>• Custom WebGL fragment shader</li>
                <li>• Mouse interaction support</li>
                <li>• Configurable colors & parameters</li>
                <li>• Responsive canvas sizing</li>
              </ul>
            </div>
            <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <h3 class="font-medium text-gray-900 dark:text-white mb-2">Props</h3>
              <ul class="text-sm text-gray-600 dark:text-gray-300 space-y-1">
                <li>• spinRotation, spinSpeed</li>
                <li>• color1, color2, color3</li>
                <li>• contrast, lighting</li>
                <li>• isRotate, mouseInteraction</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
main {
  min-height: calc(100vh - 60px);
  min-height: calc(100dvh - 60px);
}
</style>