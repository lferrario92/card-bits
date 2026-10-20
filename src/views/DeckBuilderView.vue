<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDecks } from '@/game/useDecks'
import { useCollection } from '@/game/collection'
import { cardKey } from '@/game/decks'
import type { CardTemplate } from '@/game/types'

const {
  decks,
  currentDeckId,
  currentDeck,
  getDeck,
  createDeckAndSelect,
  deleteDeck,
  renameDeck,
  selectCurrent,
  addCard,
  removeCard,
  MAX_CARDS,
  MAX_COPIES,
} = useDecks()

const { getOwnedCards } = useCollection()

const pool = computed(() => getOwnedCards())

const editingId = ref<string | null>(null)
const nameInput = ref('')

const editingDeck = computed(() => (editingId.value ? getDeck(editingId.value) : null))

const total = computed(() => editingDeck.value?.cards.length ?? 0)

const counts = computed<Record<string, number>>(() => {
  const map: Record<string, number> = {}
  const d = editingDeck.value
  if (d) for (const c of d.cards) { const k = cardKey(c); map[k] = (map[k] ?? 0) + 1 }
  return map
})

/** Deck contents grouped by card, preserving first-seen order. */
const deckGroups = computed<{ card: CardTemplate; count: number }[]>(() => {
  const d = editingDeck.value
  if (!d) return []
  const map = new Map<string, { card: CardTemplate; count: number }>()
  const order: string[] = []
  for (const c of d.cards) {
    const k = cardKey(c)
    if (!map.has(k)) {
      map.set(k, { card: c, count: 0 })
      order.push(k)
    }
    map.get(k)!.count += 1
  }
  return order.map(k => map.get(k)!)
})

function openDeck(id: string) {
  editingId.value = id
  nameInput.value = getDeck(id)?.name ?? ''
}

function backToList() {
  if (editingId.value) renameDeck(editingId.value, nameInput.value)
  editingId.value = null
}

function newDeck() {
  const deck = createDeckAndSelect()
  editingId.value = deck.id
  nameInput.value = deck.name
}

function commitName() {
  if (editingId.value) renameDeck(editingId.value, nameInput.value)
}

function confirmDelete(id: string, name: string) {
  if (window.confirm(`Delete deck "${name}"? This can't be undone.`)) {
    deleteDeck(id)
    if (editingId.value === id) editingId.value = null
  }
}

function canAdd(card: CardTemplate): boolean {
  return total.value < MAX_CARDS && (counts.value[cardKey(card)] ?? 0) < MAX_COPIES
}

function isCurrent(id: string): boolean {
  return id === currentDeckId.value
}

function typeLabel(type: string): string {
  return type === 'creature' ? 'Creature' : 'Spell'
}
</script>

<template>
  <!-- ============ LIST MODE ============ -->
  <div v-if="!editingDeck" class="min-h-screen flex flex-col">
    <header class="px-4 py-4 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40">
      <div class="flex items-center justify-between gap-3">
        <div>
          <h1 class="text-lg font-bold text-gray-900 dark:text-white">Decks</h1>
          <p class="text-xs text-gray-500 dark:text-gray-400">
            Current: <span class="font-medium text-gray-700 dark:text-gray-200">{{ currentDeck?.name ?? '—' }}</span>
          </p>
        </div>
        <button @click="newDeck"
          class="px-3 py-2 rounded-xl bg-primary text-white text-sm font-semibold shadow active:scale-[0.98] transition">
          + New Deck
        </button>
      </div>
    </header>

    <main class="flex-1 px-4 pt-4 pb-24">
      <div class="grid grid-cols-2 gap-3">
        <!-- New deck tile -->
        <button
          @click="newDeck"
          class="rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-700 aspect-[3/4] flex flex-col items-center justify-center gap-2 text-gray-400 dark:text-gray-500 hover:border-primary hover:text-primary transition">
          <span class="text-3xl">＋</span>
          <span class="text-xs font-medium">New Deck</span>
        </button>

        <div v-for="deck in decks" :key="deck.id"
          class="rounded-2xl border shadow-sm overflow-hidden flex flex-col bg-white dark:bg-gray-800"
          :class="isCurrent(deck.id) ? 'border-primary ring-2 ring-primary/40' : 'border-gray-200 dark:border-gray-700'">
          <button @click="openDeck(deck.id)" class="relative block w-full aspect-[3/4] bg-gray-100 dark:bg-gray-900">
            <img v-if="deck.cards[0]" :src="deck.cards[0].image" :alt="deck.name"
              class="absolute inset-0 w-full h-full object-cover" draggable="false" />
            <div v-else class="absolute inset-0 flex items-center justify-center text-4xl text-gray-300 dark:text-gray-700">🃏</div>

            <span v-if="isCurrent(deck.id)"
              class="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-full bg-primary text-white text-[10px] font-bold shadow">
              Current
            </span>
            <span class="absolute top-1.5 right-1.5 px-2 py-0.5 rounded-full bg-black/60 text-white text-[10px] font-bold">
              {{ deck.cards.length }}/{{ MAX_CARDS }}
            </span>
            <span class="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/60 text-white text-[10px] font-medium">
              {{ typeLabel(deck.cards[0]?.type ?? 'creature') }}
            </span>
          </button>

          <div class="p-2 flex flex-col gap-1.5">
            <p class="text-sm font-semibold text-gray-900 dark:text-white truncate" :title="deck.name">{{ deck.name }}</p>
            <div class="flex items-center gap-1">
              <button @click="openDeck(deck.id)"
                class="flex-1 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs font-semibold">
                Edit
              </button>
              <button v-if="!isCurrent(deck.id)" @click="selectCurrent(deck.id)"
                class="flex-1 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-semibold">
                Use
              </button>
              <button @click="confirmDelete(deck.id, deck.name)" title="Delete deck"
                class="w-8 py-1.5 rounded-lg bg-rose-500/10 text-rose-500 text-xs font-semibold">
                🗑
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>

  <!-- ============ EDITOR MODE ============ -->
  <div v-else class="min-h-screen flex flex-col">
    <header class="px-3 py-3 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40">
      <div class="flex items-center gap-2">
        <button @click="backToList"
          class="flex-shrink-0 w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 flex items-center justify-center border border-gray-200 dark:border-gray-700"
          title="Back to decks">←</button>

        <input v-model="nameInput" @blur="commitName" @keyup.enter="commitName"
          maxlength="28" placeholder="Deck name"
          class="flex-1 min-w-0 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary" />

        <span class="flex-shrink-0 text-xs font-bold px-2 py-1 rounded-lg"
          :class="total >= MAX_CARDS ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'">
          {{ total }}/{{ MAX_CARDS }}
        </span>
      </div>

      <div class="flex items-center gap-2 mt-2">
        <button v-if="!isCurrent(editingDeck.id)" @click="selectCurrent(editingDeck.id)"
          class="flex-1 py-2 rounded-lg bg-primary text-white text-xs font-bold active:scale-[0.98] transition">
          Use as current deck
        </button>
        <div v-else class="flex-1 py-2 rounded-lg bg-primary/10 text-primary text-xs font-bold text-center">
          ✓ Current deck
        </div>
        <button @click="renameDeck(editingDeck.id, nameInput)"
          class="px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-xs font-semibold border border-gray-200 dark:border-gray-700">
          Save name
        </button>
      </div>
    </header>

    <main class="flex-1 px-3 pt-3 pb-24 space-y-5">
      <!-- Deck contents -->
      <section>
        <div class="flex items-baseline justify-between mb-2 px-1">
          <h2 class="text-sm font-bold text-gray-900 dark:text-white">In this deck</h2>
          <span class="text-[11px] text-gray-400 dark:text-gray-500">max {{ MAX_COPIES }} copies · {{ MAX_CARDS }} cards</span>
        </div>

        <div v-if="editingDeck.cards.length === 0"
          class="rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 py-8 text-center text-xs text-gray-400 dark:text-gray-500">
          Empty deck — add cards from the library below.
        </div>

        <div v-else class="grid grid-cols-3 gap-2">
          <button v-for="g in deckGroups" :key="g.card.title" @click="removeCard(editingDeck.id, g.card)"
            class="relative rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 active:scale-[0.97] transition text-left"
            :title="`Remove one ${g.card.title}`">
            <img :src="g.card.image" :alt="g.card.title" class="w-full aspect-[3/4] object-cover" draggable="false" />
            <span class="absolute top-1 left-1 min-w-5 h-5 px-1 flex items-center justify-center rounded-full bg-indigo-600 text-white text-[10px] font-bold shadow">
              {{ g.card.manaCost }}
            </span>
            <span class="absolute top-1 right-1 min-w-5 h-5 px-1 flex items-center justify-center rounded-full bg-black/70 text-white text-[10px] font-bold shadow">
              ×{{ g.count }}
            </span>
            <span class="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 pt-3 pb-1">
              <span class="block text-[10px] font-medium text-white truncate">{{ g.card.title }}</span>
            </span>
            <span class="absolute bottom-1 right-1 w-5 h-5 flex items-center justify-center rounded-full bg-rose-500 text-white text-xs font-bold shadow">−</span>
          </button>
        </div>
      </section>

      <!-- Card library -->
      <section>
        <div class="flex items-baseline justify-between mb-2 px-1">
          <h2 class="text-sm font-bold text-gray-900 dark:text-white">Card Library</h2>
          <span class="text-[11px] text-gray-400 dark:text-gray-500">{{ pool.length }} cards</span>
        </div>

        <div class="grid grid-cols-3 gap-2">
          <button v-for="card in pool" :key="card.title" @click="addCard(editingDeck.id, card)"
            :disabled="!canAdd(card)"
            class="relative rounded-lg overflow-hidden border aspect-[3/4] transition active:scale-[0.97]"
            :class="[
              canAdd(card) ? 'border-gray-200 dark:border-gray-700' : 'border-gray-200 dark:border-gray-700 opacity-45',
              (counts[cardKey(card)] ?? 0) > 0 ? 'ring-2 ring-primary/60' : '',
            ]"
            :title="canAdd(card) ? `Add ${card.title}` : 'Limit reached'">
            <img :src="card.image" :alt="card.title"
              class="absolute inset-0 w-full h-full object-cover"
              :class="canAdd(card) ? '' : 'grayscale-[0.5]'" draggable="false" />
            <span class="absolute top-1 left-1 min-w-5 h-5 px-1 flex items-center justify-center rounded-full bg-indigo-600 text-white text-[10px] font-bold shadow">
              {{ card.manaCost }}
            </span>
            <span v-if="card.attack !== undefined"
              class="absolute top-1 left-7 min-w-5 h-5 px-1 flex items-center justify-center rounded-full bg-amber-500 text-white text-[10px] font-bold shadow">
              {{ card.attack }}
            </span>
            <span v-if="card.health !== undefined"
              class="absolute top-1 left-[3.25rem] min-w-5 h-5 px-1 flex items-center justify-center rounded-full bg-rose-600 text-white text-[10px] font-bold shadow">
              {{ card.health }}
            </span>
            <span class="absolute top-1 right-1 min-w-5 h-5 px-1 flex items-center justify-center rounded-full text-white text-[10px] font-bold shadow"
              :class="(counts[cardKey(card)] ?? 0) > 0 ? 'bg-primary' : 'bg-black/60'">
              {{ counts[cardKey(card)] ?? 0 }}/{{ MAX_COPIES }}
            </span>
            <span class="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 pt-3 pb-1">
              <span class="block text-[10px] font-medium text-white truncate">{{ card.title }}</span>
            </span>
            <span v-if="canAdd(card)"
              class="absolute bottom-1 right-1 w-5 h-5 flex items-center justify-center rounded-full bg-emerald-500 text-white text-xs font-bold shadow">＋</span>
            <span v-else
              class="absolute bottom-1 right-1 w-5 h-5 flex items-center justify-center rounded-full bg-gray-500 text-white text-xs font-bold shadow">✓</span>
          </button>
        </div>
      </section>
    </main>
  </div>
</template>
