<template>
  <router-link :to="'/story/' + story._id" class="story-card card">
    <div class="card-thumbnail">
      <img v-if="story.nodes && story.nodes[0] && story.nodes[0].image" :src="story.nodes[0].image" alt="" />
      <div v-else class="card-placeholder" :style="{ background: placeholderGrad }">
        <span>📖</span>
      </div>
    </div>
    <div class="card-body">
      <h3 class="card-title">{{ story.title || 'Untitled' }}</h3>
      <div class="card-meta">
        <span class="badge">Adventure</span>
        <span class="text-muted text-sm">{{ formatDate(story.createdAt) }}</span>
      </div>
    </div>
  </router-link>
</template>
<script>
export default {
  name: 'StoryCard',
  props: { story: { type: Object, required: true } },
  computed: {
    placeholderGrad() {
      const colors = ['#42b883', '#339af0', '#f59f00', '#dc3545', '#7950f2', '#20c997']
      const i = (this.story._id || '').charCodeAt(0) % colors.length
      return 'linear-gradient(135deg, ' + colors[i] + ', ' + colors[(i+1)%colors.length] + ')'
    }
  },
  methods: {
    formatDate(d) {
      if (!d) return ''
      return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    }
  }
}
</script>
<style scoped>
.story-card { display: block; text-decoration: none; color: inherit; overflow: hidden; cursor: pointer; }
.story-card:hover { transform: translateY(-4px); box-shadow: var(--shadow-lg); }
.card-thumbnail { height: 160px; overflow: hidden; border-radius: var(--radius-lg) var(--radius-lg) 0 0; }
.card-thumbnail img { width: 100%; height: 100%; object-fit: cover; }
.card-placeholder { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 2.5rem; }
.card-body { padding: var(--space-md) var(--space-lg); }
.card-title { font-size: var(--text-base); margin-bottom: var(--space-xs); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.card-meta { display: flex; align-items: center; justify-content: space-between; gap: var(--space-sm); }
.badge { font-size: var(--text-xs); padding: 0.15rem 0.5rem; border-radius: 999px; background: var(--accent-soft); color: var(--accent); font-weight: 600; }
</style>
