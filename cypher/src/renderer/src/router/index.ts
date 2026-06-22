import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'

// Strongly-type route meta we rely on.
declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    privacy?: 'private' | 'public'
    themeDomain?: 'diary' | 'document' | 'book'
  }
}

// Hash history: a packaged Electron build loads from file://, where path-based
// history breaks. Hash history is safe.
const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/book' },
  {
    path: '/diary',
    name: 'diary',
    component: () => import('@/domains/diary/DiaryHome.vue'),
    meta: { title: 'Diary', privacy: 'private', themeDomain: 'diary' }
  },
  {
    path: '/document',
    name: 'document',
    component: () => import('@/domains/document/DocumentHome.vue'),
    meta: { title: 'Document', privacy: 'public', themeDomain: 'document' }
  },
  {
    path: '/book',
    name: 'book',
    component: () => import('@/domains/book/BookHome.vue'),
    meta: { title: 'Books', privacy: 'public', themeDomain: 'book' }
  },
  {
    path: '/book/:id',
    name: 'book-workspace',
    component: () => import('@/domains/book/BookWorkspace.vue'),
    meta: { themeDomain: 'book' }
  },
  {
    path: '/book/:id/settings',
    name: 'book-settings',
    component: () => import('@/domains/book/BookSettings.vue'),
    meta: { themeDomain: 'book' }
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/views/SettingsView.vue'),
    meta: { title: 'Settings' }
  }
]

export default createRouter({
  history: createWebHashHistory(),
  routes
})
