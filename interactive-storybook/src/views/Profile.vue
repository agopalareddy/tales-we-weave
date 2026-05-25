<template>
  <div class="profile-view">
    <div class="profile-header">
      <h2>Author Profile</h2>
      <p class="text-muted">Manage your credentials and review your storytelling statistics.</p>
    </div>

    <!-- Stats Dashboard Cards -->
    <div class="stats-grid">
      <div class="stats-card card">
        <span class="stats-icon">📚</span>
        <div class="stats-info">
          <span class="stats-num">{{ stats.storiesCount || 0 }}</span>
          <span class="stats-label">Stories Created</span>
        </div>
      </div>
      <div class="stats-card card">
        <span class="stats-icon">🌳</span>
        <div class="stats-info">
          <span class="stats-num">{{ stats.totalNodes || 0 }}</span>
          <span class="stats-label">Narrative Nodes</span>
        </div>
      </div>
      <div class="stats-card card">
        <span class="stats-icon">🎨</span>
        <div class="stats-info">
          <span class="stats-num">{{ stats.illustratedNodes || 0 }}</span>
          <span class="stats-label">Illustrated Scenes</span>
        </div>
      </div>
    </div>

    <div class="profile-content">
      <!-- Profile Card -->
      <div class="card profile-card-inner">
        <h3>Account Information</h3>
        <div class="info-row">
          <span class="info-label">Username:</span>
          <span class="info-value font-bold">{{ auth.username }}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Member Since:</span>
          <span class="info-value">{{ formatDate(stats.memberSince) }}</span>
        </div>
      </div>

      <!-- Password Edit Form -->
      <div class="card security-card">
        <h3>Security</h3>
        <p class="text-muted text-sm mb-md">Update your account password. Must be at least 4 characters long.</p>
        
        <form @submit.prevent="updatePassword" class="profile-form">
          <div class="form-group">
            <label for="new-password">New Password</label>
            <input
              id="new-password"
              type="password"
              v-model="newPassword"
              placeholder="Enter new password..."
              class="profile-input"
              required
            />
          </div>
          <div class="form-group">
            <label for="confirm-password">Confirm Password</label>
            <input
              id="confirm-password"
              type="password"
              v-model="confirmPassword"
              placeholder="Confirm new password..."
              class="profile-input"
              required
            />
          </div>
          
          <div v-if="error" class="error-message mb-md">{{ error }}</div>
          
          <button type="submit" class="btn btn-primary" :disabled="saving">
            {{ saving ? 'Saving...' : 'Update Password' }}
          </button>
        </form>
      </div>

      <!-- Danger Zone Card -->
      <div class="card danger-card">
        <h3>Danger Zone</h3>
        <p class="text-muted text-sm mb-md">Permanently delete your account. This action is irreversible and will purge all stories, choices, and images you have created.</p>
        <button @click="showDeleteAccountModal = true" class="btn btn-danger">
          Delete Account...
        </button>
      </div>
    </div>

    <!-- Delete Account typing confirmation modal -->
    <div v-if="showDeleteAccountModal" class="delete-account-overlay" @click.self="cancelDeleteAccount">
      <div class="delete-account-modal">
        <h3>Delete your account?</h3>
        <p class="warning-text">⚠️ This action is highly critical and irreversible!</p>
        <p class="text-muted text-sm mb-md">All your authored stories, nodes, and uploaded images will be permanently erased from disk and database. Please type <strong>delete my account</strong> below to confirm.</p>
        <div class="form-group mb-md">
          <input
            v-model="deleteConfirmInput"
            placeholder="Type 'delete my account'..."
            class="profile-input"
            @keyup.enter="deleteAccount"
          />
        </div>
        <div v-if="deleteError" class="error-message mb-md">{{ deleteError }}</div>
        <div class="modal-actions">
          <button @click="deleteAccount" class="btn btn-danger" :disabled="deleteConfirmInput !== 'delete my account' || deleting">
            {{ deleting ? 'Deleting...' : 'Permanently Delete Account' }}
          </button>
          <button @click="cancelDeleteAccount" class="btn btn-ghost" :disabled="deleting">Cancel</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { useAuthStore } from '@/stores/useAuth.js'
import { useToast } from '@/stores/useToast.js'
import { apiFetch } from '@/utils/api.js'

export default {
  name: 'ProfileView',
  data() {
    return {
      auth: null,
      stats: {
        storiesCount: 0,
        totalNodes: 0,
        illustratedNodes: 0,
        memberSince: null
      },
      newPassword: '',
      confirmPassword: '',
      saving: false,
      error: null,
      showDeleteAccountModal: false,
      deleteConfirmInput: '',
      deleting: false,
      deleteError: null
    }
  },
  created() {
    this.auth = useAuthStore()
    this.toast = useToast()
  },
  async mounted() {
    if (!this.auth.isLoggedIn) {
      this.$router.push('/login')
      return
    }
    await this.fetchStats()
  },
  methods: {
    async fetchStats() {
      try {
        const res = await apiFetch('/api/users/stats')
        if (!res.ok) throw new Error('Failed to load profile metrics')
        this.stats = await res.json()
      } catch (e) {
        console.error('Failed to load stats:', e)
        this.toast.addToast('error', 'Could not load statistics dashboard')
      }
    },
    async updatePassword() {
      this.error = null
      if (this.newPassword !== this.confirmPassword) {
        this.error = "Passwords do not match"
        return
      }
      if (this.newPassword.length < 4) {
        this.error = "Password must be at least 4 characters long"
        return
      }
      
      this.saving = true
      try {
        const res = await apiFetch('/api/users/profile', {
          method: 'PUT',
          body: JSON.stringify({ password: this.newPassword })
        })
        
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to update password')
        
        this.toast.addToast('success', 'Password updated successfully!')
        this.newPassword = ''
        this.confirmPassword = ''
      } catch (e) {
        this.error = e.message
        this.toast.addToast('error', 'Failed to update credentials')
      } finally {
        this.saving = false
      }
    },
    formatDate(d) {
      if (!d) return 'Loading...'
      return new Date(d).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      })
    },
    cancelDeleteAccount() {
      this.showDeleteAccountModal = false
      this.deleteConfirmInput = ''
      this.deleteError = null
    },
    async deleteAccount() {
      if (this.deleteConfirmInput !== 'delete my account') return
      this.deleting = true
      this.deleteError = null
      try {
        const res = await apiFetch('/api/users/me', {
          method: 'DELETE'
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to delete account')

        this.toast.addToast('success', 'Your account has been permanently deleted.')
        this.cancelDeleteAccount()
        this.auth.logout() // Automatically logs out and routes to home
      } catch (e) {
        console.error('Delete account error:', e)
        this.deleteError = e.message
        this.toast.addToast('error', 'Failed to delete account')
      } finally {
        this.deleting = false
      }
    }
  }
}
</script>

<style scoped>
.profile-view {
  max-width: 1000px;
  margin: 0 auto;
  padding: var(--space-md);
}
.profile-header {
  margin-bottom: var(--space-xl);
}
.profile-header h2 {
  font-size: var(--text-3xl);
  color: var(--text-primary);
  margin-bottom: var(--space-xs);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--space-md);
  margin-bottom: var(--space-2xl);
}
.stats-card {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-lg) var(--space-xl);
}
.stats-icon {
  font-size: 2.5rem;
}
.stats-info {
  display: flex;
  flex-direction: column;
}
.stats-num {
  font-size: var(--text-2xl);
  font-weight: 700;
  color: var(--accent);
  line-height: 1.2;
}
.stats-label {
  font-size: var(--text-xs);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 600;
}

.profile-content {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-lg);
}

@media (min-width: 768px) {
  .profile-content {
    grid-template-columns: 1fr 1fr;
  }
}

.profile-card-inner, .security-card {
  padding: var(--space-xl);
}
.profile-card-inner h3, .security-card h3 {
  font-size: var(--text-lg);
  font-weight: 700;
  margin-bottom: var(--space-md);
  border-bottom: 1px solid var(--border);
  padding-bottom: var(--space-xs);
  color: var(--text-primary);
}

.info-row {
  display: flex;
  justify-content: space-between;
  padding: var(--space-sm) 0;
  border-bottom: 1px dashed var(--border-light);
  font-size: var(--text-sm);
}
.info-label {
  color: var(--text-muted);
  font-weight: 500;
}
.info-value {
  color: var(--text-primary);
  font-weight: 600;
}
.font-bold {
  font-size: var(--text-base);
  color: var(--accent);
}

.profile-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}
.form-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}
.form-group label {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.profile-input {
  padding: var(--space-sm) var(--space-md);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: var(--text-sm);
  transition: border-color var(--transition-fast);
  font-family: var(--font-sans);
}
.profile-input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.mb-md { margin-bottom: var(--space-md); }

/* Danger Zone Styles */
.danger-card {
  padding: var(--space-xl);
  border: 1px solid var(--danger) !important;
  background: var(--bg-card);
}
.danger-card h3 {
  font-size: var(--text-lg);
  font-weight: 700;
  margin-bottom: var(--space-md);
  border-bottom: 1px solid var(--danger);
  padding-bottom: var(--space-xs);
  color: var(--danger);
}

/* Delete Account modal overlay */
.delete-account-overlay {
  position: fixed;
  inset: 0;
  z-index: 1100;
  background: rgba(15, 17, 23, 0.7);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-md);
  animation: fadeIn var(--transition-normal);
}
.delete-account-modal {
  background: var(--bg-card);
  border-radius: var(--radius-xl);
  width: 100%;
  max-width: 500px;
  box-shadow: var(--shadow-xl);
  padding: var(--space-2xl);
  border: 1px solid var(--border);
  animation: slideUp var(--transition-normal);
}
.warning-text {
  color: var(--danger);
  font-weight: 700;
  font-size: var(--text-md);
  margin-bottom: var(--space-sm);
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-sm);
  margin-top: var(--space-lg);
}
.error-message {
  color: var(--danger);
  font-size: var(--text-sm);
  font-weight: 600;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes slideUp {
  from { transform: translateY(15px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
</style>
