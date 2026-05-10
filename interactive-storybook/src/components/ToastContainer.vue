<template>
  <Teleport to="body">
    <div class="toast-container">
      <TransitionGroup name="toast">
        <ToastItem v-for="t in toasts" :key="t.id" :toast="t" @close="removeToast(t.id)" />
      </TransitionGroup>
    </div>
  </Teleport>
</template>
<script>
import ToastItem from './ToastItem.vue'
import { useToast } from '@/stores/useToast.js'
export default {
  name: 'ToastContainer',
  components: { ToastItem },
  setup() {
    const { toasts, removeToast } = useToast()
    return { toasts, removeToast }
  }
}
</script>
<style scoped>
.toast-container {
  position: fixed; bottom: 1.5rem; right: 1.5rem;
  display: flex; flex-direction: column-reverse; gap: 0.75rem;
  z-index: 10000; pointer-events: none;
}
.toast-container > * { pointer-events: auto; }
.toast-enter-active { transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); }
.toast-leave-active { transition: all 0.2s ease-in; }
.toast-enter-from { opacity: 0; transform: translateX(100%) scale(0.9); }
.toast-leave-to { opacity: 0; transform: translateX(50%) scale(0.9); }
</style>
