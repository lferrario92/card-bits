<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth, type MatchStats } from '@/composables/useAuth'

const router = useRouter()
const { displayName, initials, email, memberSince, busy, authError, signOut, updateDisplayName, fetchStats } =
  useAuth()

const stats = ref<MatchStats>({ wins: 0, losses: 0, draws: 0, matches: 0 })
const loading = ref(false)
const editing = ref(false)
const nameDraft = ref('')
const savedFlash = ref(false)
const loadError = ref('')

async function loadStats() {
  loading.value = true
  loadError.value = ''
  const result = await fetchStats()
  stats.value = result
  loading.value = false
}

onMounted(loadStats)

const winRate = computed(() =>
  stats.value.matches > 0 ? Math.round((stats.value.wins / stats.value.matches) * 100) : 0
)

const joinedLabel = computed(() => {
  if (!memberSince.value) return ''
  const d = new Date(memberSince.value)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
})

function startEdit() {
  nameDraft.value = displayName.value
  editing.value = true
  savedFlash.value = false
}

async function saveName() {
  const ok = await updateDisplayName(nameDraft.value)
  if (ok) {
    editing.value = false
    savedFlash.value = true
    window.setTimeout(() => (savedFlash.value = false), 2200)
  }
}

async function onSignOut() {
  await signOut()
  router.replace('/login')
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-950">
    <header class="sticky top-0 z-40 px-4 py-4 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700">
      <h1 class="text-xl font-bold text-center text-gray-900 dark:text-white">Profile</h1>
    </header>

    <main class="px-4 pt-6 pb-28 max-w-md mx-auto space-y-4">
      <!-- Identity card -->
      <section class="rounded-3xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm p-5">
        <div class="flex items-center gap-4">
          <div class="shrink-0 w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-600 text-white text-xl font-bold flex items-center justify-center shadow-lg">
            {{ initials }}
          </div>
          <div class="min-w-0 flex-1">
            <template v-if="!editing">
              <div class="flex items-center gap-2">
                <p class="min-w-0 truncate text-lg font-bold text-gray-900 dark:text-white">{{ displayName }}</p>
                <button @click="startEdit"
                  class="shrink-0 text-[11px] font-bold px-2 py-1 rounded-lg bg-primary/10 text-primary">
                  Edit
                </button>
              </div>
            </template>
            <template v-else>
              <div class="flex items-center gap-2">
                <input v-model="nameDraft" type="text" maxlength="24" placeholder="Display name"
                  class="min-w-0 flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-primary/60" />
                <button @click="saveName"
                  class="shrink-0 text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-emerald-500 text-white">Save</button>
                <button @click="editing = false"
                  class="shrink-0 text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200">✕</button>
              </div>
            </template>

            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400 truncate">{{ email }}</p>
            <p v-if="joinedLabel" class="text-xs text-gray-400 dark:text-gray-500">Member since {{ joinedLabel }}</p>
          </div>
        </div>

        <p v-if="savedFlash" class="mt-3 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          Display name updated.
        </p>
        <p v-if="authError" class="mt-3 text-xs font-semibold text-rose-600 dark:text-rose-400">
          {{ authError }}
        </p>
      </section>

      <!-- Match record -->
      <section class="rounded-3xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm p-5">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-sm font-bold text-gray-900 dark:text-white">PvP Record</h2>
          <button @click="loadStats" class="text-[11px] font-bold text-primary">Refresh</button>
        </div>

        <p v-if="loadError" class="text-xs font-semibold text-rose-600 dark:text-rose-400 mb-3">{{ loadError }}</p>

        <div class="grid grid-cols-4 gap-2 text-center">
          <div class="rounded-2xl bg-emerald-50 dark:bg-emerald-900/25 py-3">
            <div class="text-xl font-bold text-emerald-600 dark:text-emerald-300">{{ stats.wins }}</div>
            <div class="text-[10px] font-semibold uppercase tracking-wide text-emerald-700/70 dark:text-emerald-300/70">Wins</div>
          </div>
          <div class="rounded-2xl bg-rose-50 dark:bg-rose-900/25 py-3">
            <div class="text-xl font-bold text-rose-600 dark:text-rose-300">{{ stats.losses }}</div>
            <div class="text-[10px] font-semibold uppercase tracking-wide text-rose-700/70 dark:text-rose-300/70">Losses</div>
          </div>
          <div class="rounded-2xl bg-gray-100 dark:bg-gray-800 py-3">
            <div class="text-xl font-bold text-gray-600 dark:text-gray-300">{{ stats.draws }}</div>
            <div class="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Draws</div>
          </div>
          <div class="rounded-2xl bg-indigo-50 dark:bg-indigo-900/25 py-3">
            <div class="text-xl font-bold text-indigo-600 dark:text-indigo-300">{{ stats.matches }}</div>
            <div class="text-[10px] font-semibold uppercase tracking-wide text-indigo-700/70 dark:text-indigo-300/70">Total</div>
          </div>
        </div>

        <div class="mt-4">
          <div class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
            <span>Win rate</span>
            <span class="font-bold text-gray-800 dark:text-gray-200">{{ winRate }}%</span>
          </div>
          <div class="h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
            <div class="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all duration-500"
              :style="{ width: winRate + '%' }" />
          </div>
        </div>

        <p v-if="loading" class="mt-3 text-center text-xs text-gray-400 dark:text-gray-500">Loading record…</p>
        <p v-else-if="stats.matches === 0" class="mt-3 text-center text-xs text-gray-400 dark:text-gray-500">
          No finished PvP matches yet — create one from the Fight screen.
        </p>
      </section>

      <!-- Session -->
      <section class="rounded-3xl border border-rose-200 dark:border-rose-900/60 bg-white dark:bg-gray-900 shadow-sm p-5">
        <button @click="onSignOut" :disabled="busy"
          class="w-full py-3 rounded-xl bg-rose-500 text-white text-sm font-bold shadow disabled:opacity-50 active:scale-[0.99] transition flex items-center justify-center gap-2">
          <span v-if="busy" class="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
          <span>{{ busy ? 'Signing out…' : 'Sign out' }}</span>
        </button>
      </section>
    </main>
  </div>
</template>
