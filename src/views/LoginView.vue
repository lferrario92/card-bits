<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'

const route = useRoute()
const router = useRouter()
const { signIn, signUp, busy, authError } = useAuth()

const mode = ref<'signin' | 'signup'>('signin')
const emailInput = ref('')
const passwordInput = ref('')
const displayNameInput = ref('')
const confirmationSent = ref(false)

const isSignIn = computed(() => mode.value === 'signin')

function switchMode(next: 'signin' | 'signup') {
  mode.value = next
  confirmationSent.value = false
}

const canSubmit = computed(() => {
  const validEmail = /\S+@\S+\.\S+/.test(emailInput.value)
  const validPassword = passwordInput.value.length >= 6
  const validName = isSignIn.value || displayNameInput.value.trim().length >= 2
  return validEmail && validPassword && validName
})

function redirectTarget(): string {
  const q = route.query.redirect
  return typeof q === 'string' && q.startsWith('/') && !q.startsWith('//') ? q : '/'
}

async function submit() {
  if (busy.value || !canSubmit.value) return

  if (isSignIn.value) {
    const ok = await signIn(emailInput.value.trim(), passwordInput.value)
    if (ok) await router.replace(redirectTarget())
    return
  }

  const result = await signUp(emailInput.value.trim(), passwordInput.value, displayNameInput.value.trim())
  if (!result.ok) return
  if (result.needsConfirmation) {
    confirmationSent.value = true
    return
  }
  await router.replace(redirectTarget())
}
</script>

<template>
  <div class="fixed inset-0 z-50 overflow-y-auto bg-slate-950 flex items-center justify-center px-4 py-8">
    <!-- Ambient backdrop -->
    <div class="pointer-events-none fixed inset-0" aria-hidden="true">
      <div class="absolute -top-24 -left-16 w-72 h-72 rounded-full bg-indigo-600/30 blur-3xl"></div>
      <div class="absolute top-1/3 -right-20 w-80 h-80 rounded-full bg-fuchsia-600/25 blur-3xl"></div>
      <div class="absolute -bottom-24 left-1/4 w-72 h-72 rounded-full bg-emerald-600/20 blur-3xl"></div>
    </div>

    <div class="relative w-full max-w-sm">
      <!-- Brand -->
      <div class="text-center mb-5">
        <div class="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-600 shadow-xl flex items-center justify-center text-3xl">
          🃏
        </div>
        <h1 class="mt-3 text-2xl font-bold text-white">Cards</h1>
        <p class="text-sm text-white/60 mt-0.5">Sign in to build decks and battle.</p>
      </div>

      <div class="rounded-3xl border border-white/10 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl shadow-2xl p-5">
        <!-- Mode switch -->
        <div class="grid grid-cols-2 gap-1 p-1 rounded-xl bg-black/5 dark:bg-white/5 mb-5">
          <button
            type="button"
            @click="switchMode('signin')"
            :class="['py-2 text-sm font-semibold rounded-lg transition-colors', isSignIn ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow' : 'text-gray-500 dark:text-gray-400']">
            Sign in
          </button>
          <button
            type="button"
            @click="switchMode('signup')"
            :class="['py-2 text-sm font-semibold rounded-lg transition-colors', !isSignIn ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow' : 'text-gray-500 dark:text-gray-400']">
            Create account
          </button>
        </div>

        <!-- Confirmation notice -->
        <div v-if="confirmationSent" class="rounded-xl border border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-900/30 p-4 text-center">
          <div class="text-2xl">✉️</div>
          <p class="mt-2 text-sm font-semibold text-emerald-800 dark:text-emerald-200">Check your inbox</p>
          <p class="text-xs text-emerald-700 dark:text-emerald-300 mt-1">
            We sent a confirmation link to <span class="font-semibold">{{ emailInput }}</span>. Click it, then sign in here.
          </p>
        </div>

        <form v-else class="space-y-3" @submit.prevent="submit">
          <div>
            <label for="login-name" class="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Display name</label>
            <input
              id="login-name"
              v-model="displayNameInput"
              type="text"
              autocomplete="nickname"
              placeholder="e.g. GoblinSlayer"
              :class="['w-full rounded-xl border px-3 py-3 text-sm bg-white dark:bg-gray-800 outline-none focus:ring-2 focus:ring-primary/60', isSignIn ? 'hidden' : 'block border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400']" />
          </div>

          <div>
            <label for="login-email" class="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Email</label>
            <input
              id="login-email"
              v-model="emailInput"
              type="email"
              autocomplete="email"
              required
              placeholder="you@example.com"
              class="w-full rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-3 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-primary/60" />
          </div>

          <div>
            <label for="login-password" class="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Password</label>
            <input
              id="login-password"
              v-model="passwordInput"
              type="password"
              :autocomplete="isSignIn ? 'current-password' : 'new-password'"
              required
              minlength="6"
              placeholder="At least 6 characters"
              class="w-full rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-3 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-primary/60" />
          </div>

          <p v-if="authError" class="rounded-xl bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800 px-3 py-2.5 text-xs font-medium text-rose-700 dark:text-rose-300">
            {{ authError }}
          </p>

          <button
            type="submit"
            :disabled="busy || !canSubmit"
            class="w-full py-3 rounded-xl bg-primary text-white text-sm font-bold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99] transition flex items-center justify-center gap-2">
            <span v-if="busy" class="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
            <span>{{ busy ? 'Please wait…' : isSignIn ? 'Sign in' : 'Create account' }}</span>
          </button>

          <p class="text-center text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed pt-1">
            {{ isSignIn ? 'No account yet? Use “Create account” above.' : 'Password must be at least 6 characters.' }}
          </p>
        </form>
      </div>
    </div>
  </div>
</template>
