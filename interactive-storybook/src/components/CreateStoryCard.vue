<template>
  <div class="create-card" :class="{ loading }" @click="$emit('create')">
    <div class="create-icon">{{ loading ? '⏳' : '+' }}</div>
    <div class="create-text">{{ loading ? 'Creating...' : 'Create New Story' }}</div>
  </div>
</template>
<script>
export default {
  name: 'CreateStoryCard',
  props: { loading: { type: Boolean, default: false } },
  emits: ['create'],
};
</script>
<style scoped>
.create-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-md);
  padding: var(--space-2xl) var(--space-lg);
  border: 2px dashed var(--border);
  border-radius: var(--radius-lg);
  background: var(--bg-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
  min-height: 260px;
}
.create-card:hover {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.create-card.loading {
  opacity: 0.6;
  cursor: not-allowed;
}
.create-icon {
  font-size: 2.5rem;
  line-height: 1;
}
.create-text {
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--text-secondary);
}
</style>
