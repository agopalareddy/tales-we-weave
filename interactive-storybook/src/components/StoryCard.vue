<template>
  <router-link :to="'/story/' + story._id" class="story-card card">
    <div class="card-thumbnail">
      <img v-if="story.nodes && story.nodes[0] && story.nodes[0].image" :src="story.nodes[0].image" alt="" />
      <div v-else class="card-placeholder" :style="{ background: placeholderGrad }">
        <span>📖</span>
      </div>
    </div>
    <div class="card-body">
      <div class="genre-row">
        <span class="genre-badge">{{ story.genre || 'Adventure' }}</span>
      </div>
      <h3 class="card-title">{{ story.title || 'Untitled' }}</h3>
      <p v-if="story.description" class="card-desc">{{ story.description }}</p>
      
      <div v-if="story.tags && story.tags.length" class="card-tags">
        <span v-for="tag in story.tags.slice(0, 3)" :key="tag" class="tag-badge">#{{ tag }}</span>
      </div>

      <div class="card-meta">
        <span v-if="story.isPublished === false" class="badge badge-draft">Draft</span>
        <span v-else class="badge badge-published">Published</span>
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
.genre-row { margin-bottom: var(--space-xs); }
.genre-badge {
  font-size: 10px;
  text-transform: uppercase;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: var(--accent);
  background: var(--accent-soft);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
}
.card-title { font-size: var(--text-base); margin-bottom: var(--space-xs); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 700; }
.card-desc {
  font-size: var(--text-xs);
  color: var(--text-secondary);
  line-height: 1.4;
  margin-bottom: var(--space-sm);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  height: 2.8em;
}
.card-tags {
  display: flex;
  gap: var(--space-xs);
  margin-bottom: var(--space-md);
  flex-wrap: wrap;
}
.tag-badge {
  font-size: 10px;
  color: var(--text-muted);
  font-weight: 500;
}
.card-meta { display: flex; align-items: center; justify-content: space-between; gap: var(--space-sm); }
.badge { font-size: var(--text-xs); padding: 0.15rem 0.5rem; border-radius: 999px; font-weight: 600; }
.badge-published { background: var(--accent-soft); color: var(--accent); }
.badge-draft { background: var(--bg-hover); color: var(--text-muted); border: 1px solid var(--border); }
</style>
