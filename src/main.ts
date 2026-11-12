import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import './style.css'
import App from './App.vue'
import BalatroView from './views/BalatroView.vue'
import BounceCardsView from './views/BounceCardsView.vue'
import EnemySelectView from './views/EnemySelectView.vue'
import DriftWallView from './views/DriftWallView.vue'
import CardSwapView from './views/CardSwapView.vue'
import StackMarketView from './views/StackMarketView.vue'
import DeckBuilderView from './views/DeckBuilderView.vue'
import LoginView from './views/LoginView.vue'
import ProfileView from './views/ProfileView.vue'
import MatchLobbyView from './views/MatchLobbyView.vue'
import { initAuth, useAuth } from './composables/useAuth'
import { useDecks } from './game/useDecks'

const routes = [
  { path: '/', redirect: '/drift-wall' },
  { path: '/login', name: 'Login', component: LoginView, meta: { public: true, hideNav: true } },
  { path: '/balatro', name: 'Balatro', component: BalatroView },
    { path: '/enemies', name: 'Enemies', component: EnemySelectView },
    { path: '/bounce-cards', name: 'BounceCards', component: BounceCardsView },
  { path: '/drift-wall', name: 'DriftWall', component: DriftWallView },
  { path: '/card-swap', name: 'CardSwap', component: CardSwapView },
  { path: '/stack-market', name: 'StackMarket', component: StackMarketView },
  { path: '/decks', name: 'Decks', component: DeckBuilderView },
  { path: '/profile', name: 'Profile', component: ProfileView },
  { path: '/online', name: 'Online', component: MatchLobbyView },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

// Auth gate: the whole app requires sign-in except explicitly public routes.
router.beforeEach(async (to) => {
  await initAuth()
  const { isAuthenticated } = useAuth()
  if (to.meta.public) {
    if (isAuthenticated.value && to.name === 'Login') return { path: '/drift-wall' }
    return true
  }
  if (!isAuthenticated.value) {
    return { name: 'Login', query: { redirect: to.fullPath } }
  }

  // A battle needs a deck the player built themselves — there is no built-in
  // starter deck any more. Send deckless players to the deck builder instead
  // of starting them with an empty hand.
  //
  // Online matches carrying a ?code= are deliberately exempt: bouncing out of
  // the lobby there would strand the opponent waiting for a seat that never
  // arrives, and they reach the battle through /enemies anyway.
  const needsDeck =
    to.name === 'Enemies' || (to.name === 'BounceCards' && typeof to.query.code !== 'string')
  if (needsDeck) {
    const { decks, currentDeckTemplates, selectCurrent } = useDecks()
    if (currentDeckTemplates().length === 0) {
      // Current deck is empty (or missing): prefer another deck that has
      // cards over bouncing the player out of the fight flow.
      const fallback = decks.value.find(d => d.cards.length > 0)
      if (fallback) {
        selectCurrent(fallback.id)
      } else {
        return { name: 'Decks' }
      }
    }
  }

  return true
})

const app = createApp(App)
app.use(router)
app.mount('#app')