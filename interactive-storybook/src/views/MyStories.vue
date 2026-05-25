<template>
  <div class="my-stories-view">
    <h2>My Stories</h2>
    <div v-if="loading" class="flex-center" style="padding:var(--space-3xl); flex-direction:column; gap:var(--space-md);">
      <div class="spinner"></div>
      <p class="text-muted">Loading your stories...</p>
    </div>
    <div v-else-if="error" class="flex-center" style="flex-direction:column; gap:var(--space-md); padding:var(--space-3xl);">
      <p class="error-message">{{ error }}</p>
      <button class="btn btn-primary" @click="fetchStories">Try Again</button>
    </div>
    <div v-else-if="stories.length === 0" class="flex-center" style="flex-direction:column; gap:var(--space-lg); padding:var(--space-3xl);">
      <p style="font-size:var(--text-lg); color:var(--text-muted);">You haven&rsquo;t created any stories yet.</p>
      <button class="btn btn-primary" @click="createNewStory">Create Your First Story</button>
    </div>
    <div v-else class="story-grid">
      <StoryCard v-for="story in stories" :key="story._id" :story="story" />
      <CreateStoryCard @create="createNewStory" />
    </div>
    <CreateStoryDialog v-if="showCreateDialog" @close="showCreateDialog = false" @created="onStoryCreated" />
  </div>
</template>

<script>
import { useAuthStore } from '@/stores/useAuth.js'
import StoryCard from '@/components/StoryCard.vue'
import CreateStoryCard from '@/components/CreateStoryCard.vue'
import CreateStoryDialog from '@/components/CreateStoryDialog.vue'

export default {
  name: 'MyStoriesView',
  components: { StoryCard, CreateStoryCard, CreateStoryDialog },
  data() {
    return {
      stories: [],
      loading: true,
      error: null,
      showCreateDialog: false
    }
  },
  async mounted() {
    const auth = useAuthStore()
    if (!auth.isLoggedIn) {
      this.$router.push('/login')
      return
    }
    await this.fetchStories()
  },
  methods: {
    async fetchStories() {
      this.loading = true
      this.error = null
      try {
        const auth = useAuthStore()
        const res = await fetch('/api/my-stories', {
          headers: { ...auth.authHeader }
        })
        if (res.status === 401) {
          auth.clearAuth()
          this.$router.push('/login')
          return
        }
        if (!res.ok) throw new Error('Failed to fetch stories')
        this.stories = await res.json()
      } catch (e) {
        this.error = e.message
      } finally {
        this.loading = false
      }
    },
    createNewStory() {
      this.showCreateDialog = true
    },
    onStoryCreated(storyId) {
      this.showCreateDialog = false
      this.$router.push('/story/' + storyId)
    }
  }
}
</script>

<style scoped>
.my-stories-view { max-width: 1200px; margin: 0 auto; }
.my-stories-view h2 { margin-bottom: var(--space-lg); color: var(--text-primary); }
.story-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-lg);
}
</style>
