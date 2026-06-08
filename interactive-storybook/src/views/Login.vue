<template>
  <div class="auth-view">
    <div class="auth-card">
      <h2>Login</h2>
      <form @submit.prevent="handleLogin">
        <div class="form-group">
          <label for="username">Username</label>
          <input
            id="username"
            v-model="form.username"
            type="text"
            required
            placeholder="Enter username"
          />
        </div>
        <div class="form-group">
          <label for="password">Password</label>
          <input
            id="password"
            v-model="form.password"
            type="password"
            required
            placeholder="Enter password"
          />
        </div>
        <p v-if="error" class="error-message">{{ error }}</p>
        <button type="submit" class="btn btn-primary" :disabled="submitting">
          {{ submitting ? 'Logging in...' : 'Login' }}
        </button>
      </form>
      <p class="auth-link">
        Don't have an account? <router-link to="/register">Register</router-link>
      </p>
    </div>
  </div>
</template>

<script>
import { useAuthStore } from '@/stores/useAuth.js';
import { useToast } from '@/stores/useToast.js';

export default {
  name: 'LoginView',
  data() {
    return {
      form: { username: '', password: '' },
      submitting: false,
      error: null,
    };
  },
  methods: {
    async handleLogin() {
      this.submitting = true;
      this.error = null;
      try {
        const auth = useAuthStore();
        const toast = useToast();
        await auth.login(this.form.username, this.form.password);
        toast.addToast('success', 'Logged in successfully');
        this.$router.push('/');
      } catch (e) {
        this.error = e.message;
      } finally {
        this.submitting = false;
      }
    },
  },
};
</script>

<style scoped>
.auth-view {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: var(--space-2xl);
  min-height: 60vh;
}
.auth-card {
  background: var(--card-bg);
  border-radius: var(--radius-lg);
  padding: var(--space-2xl);
  width: 100%;
  max-width: 400px;
  box-shadow: var(--shadow-md);
}
.auth-card h2 {
  margin-bottom: var(--space-lg);
  color: var(--text-primary);
}
.form-group {
  margin-bottom: var(--space-md);
}
.form-group label {
  display: block;
  margin-bottom: var(--space-xs);
  color: var(--text-secondary);
  font-size: var(--text-sm);
  font-weight: 600;
}
.form-group input {
  width: 100%;
  padding: var(--space-sm) var(--space-md);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: var(--text-base);
  transition: border-color 0.2s;
  box-sizing: border-box;
}
.form-group input:focus {
  outline: none;
  border-color: var(--primary);
}
.error-message {
  color: var(--danger);
  font-size: var(--text-sm);
  margin-bottom: var(--space-md);
}
.auth-link {
  margin-top: var(--space-md);
  text-align: center;
  color: var(--text-muted);
  font-size: var(--text-sm);
}
.auth-link a {
  color: var(--primary);
}
</style>
