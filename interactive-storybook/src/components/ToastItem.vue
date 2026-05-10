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
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.75rem 1rem; border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg); cursor: pointer;
  min-width: 280px; max-width: 420px;
  border-left: 4px solid;
  transition: all var(--transition-fast);
  font-size: var(--text-sm);
}
.toast-success { background: #f0fdf4; border-color: var(--success); color: #166534; }
.toast-error { background: #fef2f2; border-color: var(--danger); color: #991b1b; }
.toast-warning { background: #fffbeb; border-color: var(--warning); color: #92400e; }
.toast-info { background: #eff6ff; border-color: var(--info); color: #1e40af; }
.toast-icon { font-size: 1.125rem; flex-shrink: 0; }
.toast-text { flex: 1; }
.toast-close { background: none; border: none; font-size: 1.25rem; cursor: pointer; opacity: 0.5; padding: 0 0.25rem; }
.toast-close:hover { opacity: 1; }
</style>
