<template>
  <div class="toast-item" :class="'toast-' + toast.type" @click="$emit('close')">
    <span class="toast-icon">{{ icon }}</span>
    <span class="toast-text">{{ toast.message }}</span>
    <button class="toast-close" @click.stop="$emit('close')">&times;</button>
  </div>
</template>
<script>
export default {
  name: 'ToastItem',
  props: { toast: { type: Object, required: true } },
  computed: {
    icon() {
      return { success: '✓', error: '✗', warning: '⚠', info: 'ℹ' }[this.toast.type] || 'ℹ'
    }
  }
}
</script>
<style scoped>
.toast-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.875rem 1rem;
  background: var(--bg-card);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  border-left: 4px solid var(--border);
  cursor: pointer;
  min-width: 280px;
  max-width: 400px;
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.toast-item--success {
  border-left-color: var(--success);
}

.toast-item--error {
  border-left-color: var(--danger);
}

.toast-item--info {
  border-left-color: var(--info);
}

.toast-item--warning {
  border-left-color: var(--warning);
}

.toast-item__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  flex-shrink: 0;
  font-size: 1rem;
  font-weight: bold;
}

.toast-item--success .toast-item__icon {
  color: var(--success);
}

.toast-item--error .toast-item__icon {
  color: var(--danger);
}

.toast-item--info .toast-item__icon {
  color: var(--info);
}

.toast-item--warning .toast-item__icon {
  color: var(--warning);
}

.toast-item__content {
  flex: 1;
  min-width: 0;
}

.toast-item__message {
  margin: 0;
  font-size: var(--text-sm);
  line-height: 1.4;
  color: var(--text-primary);
  word-break: break-word;
}

.toast-item__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  font-size: 1.25rem;
  line-height: 1;
  cursor: pointer;
  flex-shrink: 0;
  transition: color var(--transition-fast), background-color var(--transition-fast);
}

.toast-item__close:hover {
  color: var(--text-primary);
  background-color: var(--bg-hover);
}
</style>
