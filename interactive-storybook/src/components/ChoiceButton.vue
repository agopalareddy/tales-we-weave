<template>
  <button class="choice-btn" @click="$emit('click')" :aria-label="label || undefined">
    <slot />
  </button>
</template>

<script>
export default {
  name: 'ChoiceButton',
  props: {
    label: {
      type: String,
      default: '',
    },
  },
  emits: ['click'],
};
</script>

<style scoped>
.choice-btn {
  display: block;
  width: 100%;
  padding: var(--space-md) var(--space-lg);
  margin-bottom: var(--space-sm);
  background-color: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: var(--text-md);
  text-align: left;
  cursor: pointer;
  transition:
    border-color var(--transition-fast),
    background-color var(--transition-fast),
    transform var(--transition-fast);
}
.choice-btn:hover {
  border-color: var(--accent);
  background-color: var(--accent-soft);
  transform: translateX(4px);
}
.choice-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>
