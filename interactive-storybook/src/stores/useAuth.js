import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import router from '@/router';

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('storybook_token') || null);
  const user = ref(JSON.parse(localStorage.getItem('storybook_user') || 'null'));
  const isValidating = ref(false);

  const isLoggedIn = computed(() => !!token.value && !!user.value);
  const username = computed(() => user.value?.username || '');
  const authHeader = computed(() =>
    token.value ? { Authorization: 'Bearer ' + token.value } : {}
  );

  async function validateToken() {
    if (!token.value) return false;
    isValidating.value = true;
    try {
      const res = await fetch('/api/me', {
        headers: { Authorization: 'Bearer ' + token.value },
      });
      if (res.ok) {
        const data = await res.json();
        user.value = { _id: data._id, username: data.username };
        localStorage.setItem(
          'storybook_user',
          JSON.stringify({ _id: data._id, username: data.username })
        );
        return true;
      } else {
        clearAuth();
        return false;
      }
    } catch {
      // Network error - keep existing auth, don't clear
      return !!token.value;
    } finally {
      isValidating.value = false;
    }
  }

  function clearAuth() {
    token.value = null;
    user.value = null;
    localStorage.removeItem('storybook_token');
    localStorage.removeItem('storybook_user');
  }

  async function login(username, password) {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Login failed');
    }
    const data = await res.json();
    token.value = data.token;
    user.value = { _id: data._id, username: data.username };
    localStorage.setItem('storybook_token', data.token);
    localStorage.setItem(
      'storybook_user',
      JSON.stringify({ _id: data._id, username: data.username })
    );
  }

  async function register(username, password) {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Registration failed');
    }
    const data = await res.json();
    token.value = data.token;
    user.value = { _id: data._id, username: data.username };
    localStorage.setItem('storybook_token', data.token);
    localStorage.setItem(
      'storybook_user',
      JSON.stringify({ _id: data._id, username: data.username })
    );
  }

  function logout() {
    clearAuth();
    router.push('/');
  }

  // Validate token on initial load (best-effort, don't block)
  if (token.value) {
    validateToken();
  }

  return {
    token,
    user,
    isLoggedIn,
    isValidating,
    username,
    authHeader,
    login,
    register,
    logout,
    validateToken,
    clearAuth,
  };
});
