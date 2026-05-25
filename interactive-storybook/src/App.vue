<template>
  <div id="app" :class="['app-root', activeClass]">
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
        <button class="theme-toggle-btn" @click="toggleTheme" :title="'Theme Mode: ' + themeMode">
          <!-- Light Mode Icon (Sun) -->
          <svg v-if="themeMode === 'light'" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="theme-icon">
            <circle cx="12" cy="12" r="5"></circle>
            <line x1="12" y1="1" x2="12" y2="3"></line>
            <line x1="12" y1="21" x2="12" y2="23"></line>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
            <line x1="1" y1="12" x2="3" y2="12"></line>
            <line x1="21" y1="12" x2="23" y2="12"></line>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
          </svg>
          <!-- Dark Mode Icon (Moon) -->
          <svg v-else-if="themeMode === 'dark'" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="theme-icon">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
          </svg>
          <!-- System Mode Icon (Monitor) -->
          <svg v-else xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="theme-icon">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
            <line x1="8" y1="21" x2="16" y2="21"></line>
            <line x1="12" y1="17" x2="12" y2="21"></line>
          </svg>
          <span class="theme-badge">{{ themeMode }}</span>
        </button>
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
import { ref, onMounted } from 'vue'

export default {
  name: 'App',
  components: { ToastContainer },
  setup() {
    const auth = useAuthStore()
    const themeMode = ref(localStorage.getItem('storybook_theme_mode') || 'system')
    const activeClass = ref('theme-light')

    const updateAppliedTheme = () => {
      if (themeMode.value === 'system') {
        const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        activeClass.value = systemPrefersDark ? 'theme-dark' : 'theme-light'
      } else {
        activeClass.value = themeMode.value === 'light' ? 'theme-light' : 'theme-dark'
      }
    }

    const toggleTheme = () => {
      if (themeMode.value === 'system') {
        themeMode.value = 'light'
      } else if (themeMode.value === 'light') {
        themeMode.value = 'dark'
      } else {
        themeMode.value = 'system'
      }
      localStorage.setItem('storybook_theme_mode', themeMode.value)
      updateAppliedTheme()
    }

    onMounted(() => {
      updateAppliedTheme()
      
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      const listener = () => {
        if (themeMode.value === 'system') {
          updateAppliedTheme()
        }
      }
      
      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', listener)
      } else {
        mediaQuery.addListener(listener)
      }
    })

    return { auth, themeMode, activeClass, toggleTheme }
  }
}
</script>

<style scoped>
.app-root {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background-color: var(--bg-primary);
  color: var(--text-primary);
  transition: background-color var(--transition-normal), color var(--transition-normal);
}
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-md) var(--space-lg);
  background: var(--bg-card);
  border-bottom: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
  transition: background-color var(--transition-normal), border-color var(--transition-normal);
}
.app-header .logo {
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--accent);
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
  transition: color var(--transition-fast);
}
.nav-links a:hover, .nav-links a.router-link-exact-active {
  color: var(--accent);
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
.theme-toggle-btn {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-md);
  transition: background-color var(--transition-fast), color var(--transition-fast);
  height: 32px;
  gap: var(--space-xs);
}
.theme-toggle-btn:hover {
  background: var(--bg-hover);
  color: var(--accent);
}
.theme-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}
.theme-badge {
  font-size: var(--text-xs);
  text-transform: uppercase;
  background: var(--accent-soft);
  color: var(--accent);
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  font-weight: 700;
  font-family: var(--font-mono);
}
</style>
