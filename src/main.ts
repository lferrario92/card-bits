import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import './style.css'
import App from './App.vue'
import BalatroView from './views/BalatroView.vue'
import BounceCardsView from './views/BounceCardsView.vue'
import DriftWallView from './views/DriftWallView.vue'
import CardSwapView from './views/CardSwapView.vue'
import StackMarketView from './views/StackMarketView.vue'

const routes = [
  { path: '/', redirect: '/balatro' },
  { path: '/balatro', name: 'Balatro', component: BalatroView },
  { path: '/bounce-cards', name: 'BounceCards', component: BounceCardsView },
  { path: '/drift-wall', name: 'DriftWall', component: DriftWallView },
  { path: '/card-swap', name: 'CardSwap', component: CardSwapView },
  { path: '/stack-market', name: 'StackMarket', component: StackMarketView },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

const app = createApp(App)
app.use(router)
app.mount('#app')