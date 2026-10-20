<script setup lang="ts">
import { ref, onUnmounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useOnlineMatch } from '@/composables/useOnlineMatch'
import { useAuth } from '@/composables/useAuth'

const router = useRouter()
const { displayName, isAuthenticated } = useAuth()
const { match, role, waiting, error, createMatch, joinMatch, teardown } = useOnlineMatch()

const mode = ref<'menu' | 'hosting' | 'joining'>('menu')
const joinCode = ref('')

const shareCode = computed(() => match.value?.code ?? '')

function enterBattle() {
  const code = match.value?.code
  if (!code || !role.value) return
  teardown()
  router.push({ name: 'BounceCards', query: { code, role: role.value } })
}

async function startHosting() {
  mode.value = 'hosting'
  const row = await createMatch(() => {
    // Opponent joined: jump straight into the battle.
    enterBattle()
  })
  if (!row) mode.value = 'menu'
}

async function submitJoin() {
  const row = await joinMatch(joinCode.value)
  if (row) enterBattle()
}

function back() {
  teardown()
  if (mode.value === 'menu') router.push('/enemies')
  else {
    mode.value = 'menu'
    match.value = null
    error.value = ''
  }
}

onUnmounted(teardown)
</script>

<template>
  <div class="min-h-screen">
    <header class="px-4 pt-5 pb-4 flex items-center gap-3">
      <button @click="back"
        class="flex-shrink-0 w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 flex items-center justify-center border border-gray-200 dark:border-gray-700"
        aria-label="Back">←</button>
      <div>
        <h1 class="text-xl font-bold text-gray-900 dark:text-white">Play a friend</h1>
        <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Head-to-head card battle.</p>
      </div>
    </header>

    <main class="px-4 pb-28 space-y-4">
      <div v-if="!isAuthenticated"
        class="rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 p-4">
        <p class="text-sm text-amber-800 dark:text-amber-200">Sign in to play online.</p>
        <router-link to="/login?redirect=/online"
          class="mt-2 inline-block px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-bold">Sign in</router-link>
      </div>

      <template v-else>
        <!-- Menu -->
        <template v-if="mode === 'menu'">
          <button @click="startHosting"
            class="w-full text-left rounded-2xl border-2 border-emerald-200 dark:border-emerald-900/60 bg-white dark:bg-gray-800 p-4 shadow-sm active:scale-[0.99] transition hover:border-emerald-400">
            <div class="flex items-center gap-3">
              <span class="flex items-center justify-center w-10 h-10 rounded-full bg-emerald-500 text-white text-lg font-bold">＋</span>
              <div>
                <h2 class="text-base font-bold text-gray-900 dark:text-white">Create a match</h2>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Get a code to share with a friend.</p>
              </div>
            </div>
          </button>

          <div class="rounded-2xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
            <div class="flex items-center gap-3 mb-3">
              <span class="flex items-center justify-center w-10 h-10 rounded-full bg-indigo-500 text-white text-lg font-bold">→</span>
              <div>
                <h2 class="text-base font-bold text-gray-900 dark:text-white">Join a match</h2>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Enter the code your friend shared.</p>
              </div>
            </div>
            <div class="flex gap-2">
              <input v-model="joinCode" @keyup.enter="submitJoin" maxlength="6"
                placeholder="CODE"
                class="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white text-sm font-mono uppercase tracking-[0.3em] text-center placeholder:tracking-normal placeholder:font-sans focus:outline-none focus:ring-2 focus:ring-primary" />
              <button @click="submitJoin" :disabled="joinCode.trim().length < 4"
                class="flex-shrink-0 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-bold disabled:opacity-40 active:scale-[0.98] transition">
                Join
              </button>
            </div>
          </div>
        </template>

        <!-- Hosting: show the code, wait for opponent -->
        <template v-else-if="mode === 'hosting'">
          <div class="rounded-2xl border-2 border-emerald-200 dark:border-emerald-900/60 bg-white dark:bg-gray-800 p-6 shadow-sm text-center">
            <p class="text-xs font-semibold text-gray-500 dark:text-gray-400">Share this code</p>
            <p class="mt-2 text-4xl font-mono font-bold tracking-[0.3em] text-gray-900 dark:text-white">{{ shareCode }}</p>
            <div v-if="waiting" class="mt-4 flex items-center justify-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
              <span class="w-3.5 h-3.5 rounded-full border-2 border-emerald-400/40 border-t-emerald-500 animate-spin" />
              Waiting for your opponent…
            </div>
            <p class="mt-3 text-[11px] text-gray-400 dark:text-gray-500">Playing as {{ displayName }}</p>
          </div>

          <button @click="back"
            class="w-full px-4 py-2.5 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm font-bold">Cancel</button>
        </template>

        <p v-if="error" class="text-sm text-rose-600 dark:text-rose-400 text-center">{{ error }}</p>
      </template>
    </main>
  </div>
</template>
