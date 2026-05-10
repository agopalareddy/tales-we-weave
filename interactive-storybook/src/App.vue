<template>
  <div id="app" class="app-root theme-light">
    <header class="app-header">
      <router-link to="/" class="logo">Storybook</router-link>
      <nav class="nav-links">
        <router-link to="/">Stories</router-link>
        <router-link v-if="auth.isLoggedIn" to="/my-stories">My Stories</router-link>
        <router-link v-if="!auth.isLoggedIn" to="/login">Login</router-link>
        <router-link v-if="!auth.isLoggedIn" to="/register">Register</router-link>
        <span v-if="auth.isLoggedIn" class="user-info">
          {{ auth.username }}
          <button class="btn-link" @click="auth.logout">Logout</button>
        </span>
      </nav>
    </header>
    <main class="app-main">
      <transition name="fade" mode="out-in">
        <router-view />
      </transition>
    </main>
    <ToastContainer />
  </div>
</template>

<script>

import ToastContainer from './components/ToastContainer.vue'
import { useAuthStore } from '@/stores/useAuth.js'

export default {
  name: 'App',
  components: { ToastContainer },
  setup() {
    const auth = useAuthStore()
    return { auth }
  }
}
</script>

<style scoped>
.app-root {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-md) var(--space-lg);
  background: var(--card-bg);
  border-bottom: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
}
.app-header .logo {
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--primary);
  text-decoration: none;
}
.nav-links {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}
.nav-links a {
  color: var(--text-secondary);
  text-decoration: none;
  font-size: var(--text-sm);
  font-weight: 500;
  transition: color 0.2s;
}
.nav-links a:hover, .nav-links a.router-link-exact-active {
  color: var(--primary);
}
.user-info {
  font-size: var(--text-sm);
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}
.btn-link {
  background: none;
  border: none;
  color: var(--danger);
  cursor: pointer;
  font-size: var(--text-sm);
  padding: 0;
  text-decoration: underline;
}
.app-main {
  flex: 1;
  padding: var(--space-lg);
}
</style>
