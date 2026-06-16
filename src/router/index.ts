import { createRouter, createWebHashHistory } from '@ionic/vue-router';
import { RouteRecordRaw } from 'vue-router';
import HomePage from '../views/HomePage.vue'

const routes: Array<RouteRecordRaw> = [
  {
    path: '/',
    redirect: '/library'
  },
  {
    path: '/library',
    name: 'Library',
    component: () => import('../views/LibraryPage.vue')
  },
  {
    path: '/models/:id',
    name: 'ModelDetail',
    component: () => import('../views/ModelDetailPage.vue')
  },

  {
    path: '/settings',
    name: 'Settings',
    component: () => import('../views/SettingsPage.vue')
  },
  {
    path: '/home',
    name: 'Home',
    component: HomePage
  }
]

// Hash history so the packaged app works when loaded from file:// in Electron.
const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
