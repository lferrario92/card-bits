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
  { path: '/online', name: 'Online', component: MatchLobbyView, meta: { hideNav: true } },
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
  return true
})

const app = createApp(App)
app.use(router)
app.mount('#app')