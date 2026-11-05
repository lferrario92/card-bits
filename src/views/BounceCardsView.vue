<script setup lang="ts">
import BounceCards, { type CardData } from '@/components/vue-bits/BounceCards.vue'
import HealthBar from '@/components/game/HealthBar.vue'
import CreatureTile from '@/components/game/CreatureTile.vue'
import BattleOverlay from '@/components/game/BattleOverlay.vue'
import BattleLog from '@/components/game/BattleLog.vue'
import { createAiController, useOnlineController, type BattleController, type LocalDeck } from '@/composables/useBattleController'
import { STARTER_CARDS } from '@/game/cards'
import { getSelectedEnemy } from '@/game/enemies'
import { useDecks } from '@/game/useDecks'

import type { BoardCreature } from '@/game/types'
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'

const router = useRouter()
const route = useRoute()

const { currentDeck, currentDeckTemplates } = useDecks()

// The battle uses the deck selected in the deck builder (falling back to the
// starter deck when the current deck has no cards yet).
const playerDeck: LocalDeck = (() => {
  const current = currentDeckTemplates()
  return { templates: current.length > 0 ? current : [...STARTER_CARDS], name: currentDeck.value?.name ?? 'Starter Deck' }
})()

// --- Mode: online (PvP) when the lobby handed us a code, else VS AI ---
const onlineCode = typeof route.query.code === 'string' ? route.query.code : ''
const onlineRole = route.query.role === 'guest' ? 'guest' : route.query.role === 'host' ? 'host' : null
const isOnline = !!onlineCode && !!onlineRole

// The opponent chosen in the enemy select view (falls back to the first).
const enemy = getSelectedEnemy()

// Card revealed in the centre of the board when the opponent plays.
const ghostCard = ref<CardData | null>(null)
const burnFlash = ref(false)

// Resolve once the image is fetched (and decoded) so the reveal animation
// never starts before the artwork is ready.
function preloadImage(src: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      if (typeof img.decode === 'function') img.decode().then(() => resolve()).catch(() => resolve())
      else resolve()
    }
    img.onerror = () => resolve()
    img.src = src
  })
}

async function revealOpponentCard(card: CardData): Promise<void> {
  await preloadImage(card.image)
  return new Promise((resolve) => {
    ghostCard.value = card
    window.setTimeout(() => {
      if (ghostCard.value?.id === card.id) ghostCard.value = null
      resolve()
    }, 900)
  })
}

// --- Controller (uniform AI / host / guest interface) ---
let controller: BattleController
let destroyOnline: (() => void) | null = null

  if (isOnline) {
    const online = useOnlineController({
      code: onlineCode,
      role: onlineRole,
      selfName: 'You',
      opponentName: 'Opponent',
      selfDeck: playerDeck,
      opponentDeck: [...playerDeck.templates],
      opponentMaxHp: 30,
      onOpponentPlay: (card) => revealOpponentCard(card),
    })
    controller = online.controller
    destroyOnline = online.destroy
  } else {
  controller = createAiController(playerDeck, [...enemy.deck], {
    opponentName: enemy.name,
    opponentMaxHp: enemy.hp,
    onOpponentPlay: (card) => revealOpponentCard(card),
  })
}

async function playerPlayCard(card: CardData): Promise<boolean> {
  return controller.playCard(card)
}

async function playerDrawForMana() {
  const ok = await controller.drawCardForMana()
  if (ok) flash('Drew a card for 3 mana')
  else flash('Cannot draw')
}

function playerAttack(attackerId: number, target: BoardCreature | 'hero'): boolean {
  return controller.attack(attackerId, target === 'hero' ? { type: 'hero' } : { type: 'creature', instanceId: target.instanceId })
}

function playerDraw() {
  controller.drawCard()
}

function playerEndTurn() {
  controller.endTurn()
}

function playerReset() {
  controller.reset()
}

const state = computed(() => controller.state)

watch(() => state.value.lastBattleEvent?.seq, (seq, prev) => {
  if (!seq || seq === prev) return
  const ev = state.value.lastBattleEvent
  if (ev?.type === 'CARD_BURNED') {
    burnFlash.value = true
    window.clearTimeout((burnFlash as any)._t)
    ;(burnFlash as any)._t = window.setTimeout(() => (burnFlash.value = false), 900)
  }
})
const busy = computed(() => controller.busy.value)
const isPlayerTurn = computed(() => controller.isPlayerTurn.value)
const isOver = computed(() => controller.isOver.value)
const canDraw = computed(() => controller.canDraw.value)
const playerTurnLabel = computed(() => controller.playerTurnLabel.value)

console.log('[view]', isOnline ? `online-${onlineRole}` : 'ai', 'phase=', state.value.phase, 'hand=', state.value.hand.length, 'oppName=', state.value.opponent.name, 'isPlayerTurn=', isPlayerTurn.value)

const selectedCard = ref<CardData | null>(null)
const playing = ref(false)
const message = ref('')
const showPanel = ref(false)

// --- Combat targeting ---
const attackerId = ref<number | null>(null)
const attacker = computed(() => state.value.playerBoard.find(c => c.instanceId === attackerId.value) ?? null)
const targeting = computed(() => !!attacker.value && isPlayerTurn.value)
const effectiveSelectedCost = computed(() => selectedCard.value ? Math.max(0, selectedCard.value.manaCost - (state.value.nextCardManaDiscount ?? 0)) : 0)
const canAfford = computed(() => !!selectedCard.value && state.value.player.mana >= effectiveSelectedCost.value)

const bounceRef = ref<InstanceType<typeof BounceCards> | null>(null)
const deckEl = ref<HTMLElement | null>(null)
const drawOrigin = ref<{ x: number; y: number } | null>(null)

const opponentTag = computed(() => state.value.opponent.name.split(' ').pop() ?? state.value.opponent.name)

function flash(msg: string) {
  message.value = msg
  window.clearTimeout((flash as any)._t)
  ;(flash as any)._t = window.setTimeout(() => (message.value = ''), 1500)
}

const topDiscard = computed(() => state.value.discardPile[state.value.discardPile.length - 1] ?? null)

function captureDrawOrigin() {
  const rect = deckEl.value?.getBoundingClientRect()
  drawOrigin.value = rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null
}

function onDrawClick() {
  if (!isPlayerTurn.value || !canDraw.value) return
  captureDrawOrigin()
  playerDraw()
}

function exitView() {
  const back = (window.history.state as { back?: string } | null)?.back
  if (back) router.back()
  else router.push('/enemies')
}

async function playSelectedCard() {
  const card = selectedCard.value
  if (!card || playing.value || !isPlayerTurn.value) return
  if (state.value.player.mana < card.manaCost) {
    flash('Not enough mana')
    return
  }
  playing.value = true
  const id = card.id
  selectedCard.value = null
  attackerId.value = null
  await bounceRef.value?.playCardOut(id)
  await playerPlayCard(card)
  playing.value = false
}

async function convertSelectedCard() {
  const card = selectedCard.value
  if (!card || !isPlayerTurn.value) return
  selectedCard.value = null
  attackerId.value = null
  const ok = await controller.convertCard(card)
  if (ok) flash('Converted to +1 mana')
  else flash('Cannot convert')
}

function onEndTurn() {
  if (!isPlayerTurn.value) return
  selectedCard.value = null
  attackerId.value = null
  playerEndTurn()
}

function onCardSelected(card: CardData | null) {
  selectedCard.value = card
  if (card) attackerId.value = null
}

// --- Combat interactions ---
function onPlayerCreatureClick(c: BoardCreature) {
  if (!isPlayerTurn.value) return
  selectedCard.value = null
  if (attackerId.value === c.instanceId) {
    attackerId.value = null
    return
  }
  if (!c.canAttack) {
    flash(`${c.card.title} can't attack this turn`)
    return
  }
  attackerId.value = c.instanceId
}

function onOpponentCreatureClick(c: BoardCreature) {
  const a = attacker.value
  if (!a || !isPlayerTurn.value) return
  if (playerAttack(a.instanceId, c)) attackerId.value = null
}

function onOpponentHeroClick() {
  const a = attacker.value
  if (!a || !isPlayerTurn.value) return
  if (playerAttack(a.instanceId, 'hero')) attackerId.value = null
}

function onReset() {
  selectedCard.value = null
  attackerId.value = null
  playing.value = false
  message.value = ''
  // An online match can't be restarted in place; return to the lobby instead.
  if (isOnline) router.push('/online')
  else playerReset()
}

// --- Card sizing / layout ---
const containerWidth = ref(0)
const containerHeight = ref(170)
const fallbackWidth = ref(typeof window !== 'undefined' ? window.innerWidth - 60 : 375)

const effectiveContainerWidth = computed(() => containerWidth.value || fallbackWidth.value)

const cardWidth = ref(130)
const cardHeight = ref(340)
const useAutoSize = ref(false)

const cardAspectRatio = computed(() => cardWidth.value / cardHeight.value)

function computeAutoCardWidth(): number {
  const padding = 16
  const availableWidth = effectiveContainerWidth.value - padding
  const count = state.value.hand.length
  if (count <= 1) return Math.min(170, availableWidth * 0.6)
  const maxCardWidth = availableWidth / (count * 0.75)
  return Math.min(170, Math.max(170, maxCardWidth))
}

const finalCardWidth = computed(() => useAutoSize.value ? computeAutoCardWidth() : cardWidth.value)
const finalCardHeight = computed(() => useAutoSize.value ? Math.max(170, finalCardWidth.value) : cardHeight.value)

// Flatter arc so the hand stays compact inside the fixed-height layout
function computeArcTransforms(count: number): string[] {
  if (count === 0) return []
  const cw = finalCardWidth.value
  const maxSpread = Math.min(effectiveContainerWidth.value * 0.6, cw * count * 0.75)
  const step = count > 1 ? maxSpread / (count - 1) : 0
  const radius = maxSpread / 2 + 120
  const arcHeight = radius * 0.14
  return Array.from({ length: count }, (_, i) => {
    const x = -maxSpread / 2 + i * step
    const normalizedX = x / radius
    const y = -arcHeight * (1 - normalizedX * normalizedX)
    return `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px)`
  })
}

const arcTransformStyles = computed(() => computeArcTransforms(state.value.hand.length))

const resetSizes = () => {
  cardWidth.value = 64
  cardHeight.value = 92
  useAutoSize.value = false
}

const updateContainerWidth = () => {
  const el = document.querySelector('.bounce-container')
  if (el) containerWidth.value = Math.min(el.clientWidth, window.innerWidth - 60)
  fallbackWidth.value = window.innerWidth - 60
  // Keep the whole screen scroll-free on short viewports
  const h = window.innerHeight
  containerHeight.value = h < 640 ? 340 : h < 720 ? 400 : 460
}

// Keep the deck origin fresh for turn-start draws performed by the engine
watch(
  () => state.value.hand.length,
  (n, o) => {
    if (n > o) captureDrawOrigin()
  }
)

onMounted(() => {
  updateContainerWidth()
  window.addEventListener('resize', updateContainerWidth)
})

onUnmounted(() => {
  window.removeEventListener('resize', updateContainerWidth)
  destroyOnline?.()
})

</script>

<template>
  <div class="fixed inset-0 z-30 flex flex-col overflow-hidden overscroll-contain select-none bg-white dark:bg-gray-900">

    <!-- Left: fixed vertical mana bar -->
    <aside class="fixed left-0 top-0 bottom-0 w-12 z-40 bg-gray-100 dark:bg-gray-950 border-r border-gray-200 dark:border-gray-700 flex flex-col items-center justify-between py-2">
      <div class="flex flex-col items-center gap-1">
        <span class="text-[8px] font-bold tracking-wider text-rose-500 leading-none">{{ opponentTag }}</span>
        <div class="flex flex-col items-center gap-[2px]">
          <span v-for="i in Math.max(state.opponent.maxMana, state.opponent.mana)" :key="'om' + i"
            class="w-2.5 h-2.5 rounded-full border"
            :class="i <= state.opponent.mana
              ? (i <= state.opponent.maxMana ? 'bg-indigo-500 border-indigo-300' : 'bg-orange-500 border-orange-300')
              : (i <= state.opponent.maxMana ? 'bg-transparent border-gray-300 dark:border-gray-700' : 'bg-transparent border-orange-300/40')" />
        </div>
        <span class="text-[11px] font-mono font-bold leading-none"
          :class="state.opponent.mana > state.opponent.maxMana ? 'text-orange-600 dark:text-orange-300' : (state.opponent.mana > 0 ? 'text-indigo-600 dark:text-indigo-300' : 'text-gray-400 dark:text-gray-600')">{{ state.opponent.mana }}</span>
      </div>

      <div class="w-7 h-px bg-gray-300 dark:bg-gray-700" />

      <div class="flex flex-col items-center gap-1">
        <span class="text-[8px] font-bold tracking-wider text-emerald-600 dark:text-emerald-400 leading-none">YOU</span>
        <div class="flex flex-col items-center gap-[2px]">
          <span v-for="i in Math.max(state.player.maxMana, state.player.mana)" :key="'pm' + i"
            class="w-2.5 h-2.5 rounded-full border"
            :class="i <= state.player.mana
              ? (i <= state.player.maxMana ? 'bg-indigo-500 border-indigo-300' : 'bg-orange-500 border-orange-300')
              : (i <= state.player.maxMana ? 'bg-transparent border-gray-300 dark:border-gray-700' : 'bg-transparent border-orange-300/40')" />
        </div>
        <span class="text-[11px] font-mono font-bold leading-none"
          :class="state.player.mana > state.player.maxMana ? 'text-orange-600 dark:text-orange-300' : 'text-indigo-600 dark:text-indigo-300'">{{ state.player.mana }}</span>
        <button
          @click="playerDrawForMana"
          :disabled="!isPlayerTurn || state.player.mana < 3 || state.hasDrawnCardWithManaThisTurn"
          class="mt-1 w-8 h-8 rounded-full bg-indigo-500 text-white text-[10px] font-bold shadow disabled:opacity-40 active:scale-95 transition"
          title="Pay 3 mana to draw a card"
        >🃏</button>
      </div>
    </aside>

    <!-- Top: enemy hero (always visible) -->
    <header class="flex-shrink-0 ml-12 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-b border-gray-200 dark:border-gray-700 px-2 py-1.5">
      <div class="flex items-center gap-2">
        <button @click="exitView"
          class="flex-shrink-0 w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 flex items-center justify-center border border-gray-200 dark:border-gray-700"
          title="Leave battle" aria-label="Leave battle">✕</button>

        <div class="flex-1 min-w-0 rounded-xl px-1 transition-all"
          :class="targeting ? 'cursor-crosshair ring-2 ring-rose-500 animate-pulse bg-rose-500/10' : ''"
          @click="onOpponentHeroClick">
          <HealthBar :entity="state.opponent" accent="opponent" />
        </div>

        <button @click="showPanel = !showPanel"
          class="flex-shrink-0 w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 flex items-center justify-center border border-gray-200 dark:border-gray-700"
          :class="showPanel ? 'ring-2 ring-primary' : ''" title="Log &amp; display settings" aria-label="Log and display settings">⚙</button>
      </div>
    </header>

    <!-- Collapsible log + display panel -->
    <div v-if="showPanel"
      class="absolute left-12 right-2 top-12 z-50 max-h-[44vh] overflow-y-auto no-scrollbar rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-2xl p-3 space-y-3">
      <div>
        <div class="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1">Current Deck</div>
        <div class="flex items-center gap-2">
          <span class="flex-1 min-w-0 text-xs font-semibold text-gray-900 dark:text-white truncate">{{ currentDeck?.name ?? 'Starter Deck' }}</span>
          <span class="flex-shrink-0 text-[10px] text-gray-400 dark:text-gray-500">{{ playerDeck.templates.length }} cards</span>
          <router-link to="/decks"
            class="flex-shrink-0 px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-[11px] font-bold">
            Edit decks
          </router-link>
        </div>
      </div>
      <div>
        <div class="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1">Battle Log</div>
        <BattleLog :entries="state.log" />
      </div>
      <div>
        <div class="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-2">Display</div>
        <div class="flex items-center gap-3 mb-2 flex-wrap">
          <label class="flex items-center gap-2 text-xs font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
            <input type="checkbox" v-model="useAutoSize" class="w-4 h-4 accent-primary" />
            Auto size
          </label>
          <button @click="resetSizes" :disabled="useAutoSize"
            class="px-2.5 py-1 text-[11px] bg-gray-500 text-white rounded disabled:opacity-50">Reset</button>
          <button @click="showPanel = false"
            class="ml-auto px-2.5 py-1 text-[11px] bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded">Close</button>
        </div>
        <div class="grid grid-cols-2 gap-3" :class="{ 'opacity-50 pointer-events-none': useAutoSize }">
          <div>
            <label class="block text-[10px] text-gray-500 dark:text-gray-400 mb-1">Width: {{ finalCardWidth }}px</label>
            <input type="range" v-model.number="cardWidth" min="40" max="200" step="1"
              class="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none accent-primary" />
          </div>
          <div>
            <label class="block text-[10px] text-gray-500 dark:text-gray-400 mb-1">Height: {{ finalCardHeight }}px</label>
            <input type="range" v-model.number="cardHeight" min="40" max="300" step="1"
              class="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none accent-primary" />
          </div>
        </div>
        <div class="text-[10px] text-gray-500 dark:text-gray-400 mt-2 text-center">
          Aspect Ratio: {{ cardAspectRatio.toFixed(2) }} {{ useAutoSize ? '(auto)' : '' }}
        </div>
      </div>
    </div>

    <!-- Battleground -->
    <main class="flex-1 min-h-0 ml-12 px-2 py-2 flex flex-col gap-1.5">
      <div class="creatures-field relative flex-1 min-h-0 rounded-2xl border bg-white/70 dark:bg-gray-800/70 flex items-center justify-center gap-2 flex-wrap overflow-auto p-1.5 transition-colors"
        :class="state.phase === 'opponent' ? 'border-rose-400/70 ring-1 ring-rose-400/30' : 'border-gray-200 dark:border-gray-700'">
        <span v-if="state.opponentBoard.length > 4"
          class="pointer-events-none absolute bottom-4 left-0 text-rose-500 text-lg animate-bounce z-10">⬇</span>
        <CreatureTile
          v-for="c in state.opponentBoard" :key="c.instanceId" :creature="c"
          :interactive="targeting" :targetable="targeting" @pick="onOpponentCreatureClick(c)" />
        <span v-if="state.opponentBoard.length === 0" class="text-[11px] text-gray-400 dark:text-gray-500">
          Enemy creatures appear here
        </span>
      </div>

      <div class="flex items-center gap-2 flex-shrink-0">
        <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap"
          :class="isPlayerTurn ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'">
          {{ playerTurnLabel }} · Turn {{ state.turn }}
        </span>
        <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
      </div>

      <div class="creatures-field relative flex-1 min-h-0 rounded-2xl border bg-white/70 dark:bg-gray-800/70 flex items-center justify-center gap-2 flex-wrap overflow-auto p-1.5 transition-colors"
        :class="isPlayerTurn ? 'border-emerald-400/70 ring-1 ring-emerald-400/30' : 'border-gray-200 dark:border-gray-700'">
        <span v-if="state.playerBoard.length > 4"
          class="pointer-events-none absolute bottom-4 left-0 text-emerald-500 text-lg animate-bounce z-10">⬇</span>
        <CreatureTile
          v-for="c in state.playerBoard" :key="c.instanceId" :creature="c"
          :interactive="isPlayerTurn"
          :selected="attackerId === c.instanceId"
          :ready="isPlayerTurn && c.canAttack"
          @pick="onPlayerCreatureClick(c)" />
        <span v-if="state.playerBoard.length === 0" class="text-[11px] text-gray-400 dark:text-gray-500">
          Play a creature from your hand
        </span>
      </div>
    </main>

    <!-- Context strip: action buttons only (card details are on the card) -->
    <div
      class="flex-shrink-0 ml-12 px-2 pb-1 fixed top-12 w-full-minus-sidebar bg-white dark:bg-gray-800 left-0 right-0 z-50"
      v-if="selectedCard"
    >
      <div class="h-10 rounded-lg border flex items-center gap-2 px-2 overflow-hidden transition-colors"
        :class="selectedCard ? 'border-primary/40 bg-primary/5 dark:bg-primary/10' : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60'">

        <template v-if="selectedCard">
          <span class="flex-1 min-w-0 text-xs font-semibold text-gray-900 dark:text-white truncate">
            {{ selectedCard.title }}
          </span>
          <button @click="convertSelectedCard" :disabled="playing || state.hasConvertedCardThisTurn"
            title="Convert this card to +1 mana"
            class="flex-shrink-0 px-2 py-1 rounded-md bg-amber-500 text-white text-[10px] font-bold shadow disabled:opacity-40 active:scale-[0.98] transition flex items-center gap-1">
            <span>🔥</span><span>Convert</span>
          </button>
          <button @click="playSelectedCard" :disabled="playing || !canAfford"
            :title="canAfford ? 'Play this card' : 'Not enough mana'"
            class="flex-shrink-0 px-2 py-1 rounded-md bg-primary text-white text-[10px] font-bold shadow disabled:opacity-40 active:scale-[0.98] transition flex items-center gap-1">
            <span>{{ selectedCard.type === 'creature' ? '🐾' : '✨' }}</span><span>{{ selectedCard.type === 'creature' ? 'Summon' : 'Cast' }}</span>
          </button>
        </template>

        <template v-else-if="targeting && attacker">
          <img :src="attacker.card.image" :alt="attacker.card.title"
            class="w-11 h-14 rounded-md object-cover flex-shrink-0 border-2 border-amber-400" />
          <div class="flex-1 min-w-0">
            <p class="text-[13px] font-semibold text-gray-900 dark:text-white truncate">Attack with {{ attacker.card.title }}</p>
            <p class="text-[11px] text-gray-500 dark:text-gray-400 leading-snug">Tap the enemy hero or a creature</p>
          </div>
          <button @click="attackerId = null"
            class="flex-shrink-0 px-3 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs font-bold">✕</button>
        </template>

        <template v-else>
          <p class="w-full text-center text-[11px] text-gray-400 dark:text-gray-500 leading-snug">
            Tap a card to inspect it · tap a glowing creature to attack
          </p>
        </template>
      </div>
    </div>

    <!-- Hand -->
    <div class="relative z-30 flex-shrink-0 ml-12 px-2 -mt-0 bounce-container">
      <div v-if="false" class="text-center text-[10px] leading-none text-gray-400 dark:text-gray-500 mb-1">
        Hand · {{ state.hand.length }}
      </div>
      <BounceCards
        v-if="state.hand.length > 0"
        ref="bounceRef"
        :cards="state.hand"
        :container-width="effectiveContainerWidth"
        :container-height="containerHeight"
        :enable-hover="true"
        :transform-styles="arcTransformStyles"
        :card-width="finalCardWidth"
        :card-height="finalCardHeight"
        :draw-origin="drawOrigin"
        :available-mana="isPlayerTurn ? state.player.mana : undefined"
        class="w-full"
        @card-selected="onCardSelected"
      />
      <div v-else class="flex items-center justify-center text-[11px] text-gray-400 dark:text-gray-500 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl max-h-[290px] pointer-events-none"
        :style="{ height: containerHeight + 'px' }">
        Hand is empty
      </div>
    </div>

    <!-- End turn: floating to the right, above the bottom bar -->
    <div class="flex-shrink-0 ml-12 flex justify-end px-3 pt-1 pb-1.5">
      <button @click="onEndTurn" :disabled="!isPlayerTurn"
        class="px-5 py-2 rounded-xl bg-emerald-500 text-white text-sm font-bold shadow-lg hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] transition flex items-center gap-2">
        <span v-if="busy" class="w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />
        <span>{{ busy ? 'Enemy turn…' : 'End Turn' }}</span>
      </button>
    </div>

    <!-- Bottom bar: deck | player life | discard -->
    <footer class="flex-shrink-0 ml-12 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-t border-gray-200 dark:border-gray-700 px-3 pt-1.5 safe-area-bottom">
      <div class="flex items-center gap-2">
        <button ref="deckEl" @click="onDrawClick" :disabled="!isPlayerTurn || !canDraw"
          :class="['flex-shrink-0 flex flex-col items-center gap-0.5 transition-transform', (isPlayerTurn && canDraw) ? 'hover:-translate-y-0.5 active:translate-y-0' : 'opacity-60']"
          title="Draw a card">
          <div class="relative w-11 h-12">
            <div class="absolute inset-0 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-700 border border-white/20 shadow-md"></div>
            <div class="absolute inset-0 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-700 border border-white/20 shadow-md translate-x-1 translate-y-1"></div>
            <div class="absolute inset-0 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-700 border border-white/20 shadow-md flex items-center justify-center">
              <span class="text-white font-bold text-base">{{ state.drawPile.length }}</span>
            </div>
          </div>
          <span class="text-[9px] leading-none text-gray-400 dark:text-gray-500">Deck</span>
        </button>

        <div class="flex-1 min-w-0">
          <HealthBar :entity="state.player" accent="player" />
        </div>

        <div class="flex-shrink-0 flex flex-col items-center gap-0.5">
          <div class="relative w-11 h-12">
            <div v-if="topDiscard" class="absolute inset-0 rounded-lg overflow-hidden border border-white/30 shadow-md">
              <img :src="topDiscard.image" :alt="topDiscard.title" class="w-full h-full object-cover" draggable="false" />
            </div>
            <div v-else class="absolute inset-0 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700 flex items-center justify-center">
              <span class="text-gray-400 dark:text-gray-600 text-base">🗑</span>
            </div>
            <div class="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-gray-700 text-white text-[10px] font-bold flex items-center justify-center border border-gray-900">
              {{ state.discardPile.length }}
            </div>
          </div>
          <span class="text-[9px] leading-none text-gray-400 dark:text-gray-500">Discard</span>
        </div>
      </div>
    </footer>

    <!-- Opponent card reveal: spawns mid-board, scales up and fades out -->
    <img v-if="ghostCard" :key="ghostCard.id" :src="ghostCard.image" :alt="ghostCard.title"
      class="ghost-card pointer-events-none fixed left-1/2 top-[33%] z-[45] w-24 aspect-[3/4] object-cover rounded-xl border-2 border-rose-400 shadow-[0_0_36px_rgba(244,63,94,0.65)]"
      draggable="false" />

    <!-- Toast -->
    <transition name="fade">
      <div v-if="message"
        class="fixed top-14 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-full bg-gray-900/90 text-white text-xs font-medium shadow-lg">
        {{ message }}
      </div>
    </transition>

    <!-- Burn flash -->
    <transition name="fade">
      <div v-if="burnFlash"
        class="fixed top-24 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-full bg-amber-500 text-white text-xs font-bold shadow-lg">
        🔥 Card burned → +1 mana
      </div>
    </transition>

    <!-- Victory / Defeat overlay -->
    <BattleOverlay v-if="isOver && state.winner" :winner="state.winner" :opponent-name="state.opponent.name" @reset="onReset" />
  </div>
</template>

<style scoped>
.creatures-field {
  overflow: auto;
}

.bounce-container {
  overflow: visible;
  max-height: 290px;
  height: 290px !important;
}

.ghost-card {
  transform: translate(-50%, -50%);
  animation: enemy-play 900ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

@keyframes enemy-play {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.45) rotate(-10deg);
  }
  20% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1) rotate(0deg);
  }
  70% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1.3) rotate(4deg);
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(1.9) rotate(10deg);
  }
}

.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { scrollbar-width: none; }

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

input[type="range"]::-webkit-slider-thumb {
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #aa3bff;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
}

input[type="range"]::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #aa3bff;
  cursor: pointer;
  border: none;
}
</style>
