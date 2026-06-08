<template>
  <div class="story-list">
    <div class="list-header">
      <h1>Explore Stories</h1>
      <p class="text-muted">Choose a story to continue your adventure</p>
    </div>

    <!-- Explore Filters Bar -->
    <div class="filter-bar">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Search stories by title..."
        @input="debouncedFetch"
        class="search-input"
        aria-label="Search stories"
      />
      <select
        v-model="genreFilter"
        @change="fetchStories"
        class="filter-select"
        aria-label="Filter by genre"
      >
        <option value="all">All Genres</option>
        <option value="Sci-Fi">Sci-Fi</option>
        <option value="Fantasy">Fantasy</option>
        <option value="Adventure">Adventure</option>
        <option value="Mystery">Mystery</option>
        <option value="Horror">Horror</option>
        <option value="Romance">Romance</option>
        <option value="Other">Other</option>
      </select>
      <select v-model="sortBy" @change="fetchStories" class="filter-select" aria-label="Sort order">
        <option value="newest">Newest First</option>
        <option value="oldest">Oldest First</option>
        <option value="alphabetical">Alphabetical (A-Z)</option>
      </select>
    </div>

    <div v-if="loading" class="story-grid">
      <div v-for="n in 6" :key="n" class="skeleton-card card">
        <div class="skeleton skeleton-thumb"></div>
        <div class="skeleton skeleton-title" style="height: 1rem; width: 60%; margin: 1rem"></div>
        <div
          class="skeleton skeleton-meta"
          style="height: 0.75rem; width: 40%; margin: 0 1rem 1rem"
        ></div>
      </div>
    </div>

    <div
      v-else-if="error"
      class="flex-center"
      style="flex-direction: column; gap: var(--space-md); padding: var(--space-3xl)"
    >
      <p class="error-message">{{ error }}</p>
      <button class="btn btn-primary" @click="fetchStories">Try Again</button>
    </div>

    <div
      v-else-if="stories.length === 0"
      class="flex-center"
      style="flex-direction: column; gap: var(--space-lg); padding: var(--space-3xl)"
    >
      <p style="font-size: var(--text-lg); color: var(--text-muted)">
        No stories yet. Create your first one!
      </p>
      <button class="btn btn-primary" @click="createNewStory" :disabled="creating">
        {{ creating ? 'Creating...' : 'Create Your First Story' }}
      </button>
    </div>

    <div v-else class="story-grid">
      <CreateStoryCard :loading="creating" @create="createNewStory" />
      <StoryCard v-for="story in stories" :key="story._id" :story="story" />
    </div>
    <CreateStoryDialog
      v-if="showCreateDialog"
      @close="showCreateDialog = false"
      @created="onStoryCreated"
    />
  </div>
</template>

<script>
import StoryCard from './StoryCard.vue';
import CreateStoryCard from './CreateStoryCard.vue';
import CreateStoryDialog from './CreateStoryDialog.vue';
import { useAuthStore } from '@/stores/useAuth.js';
import { useToast } from '@/stores/useToast.js';
import { apiFetch } from '@/utils/api.js';

export default {
  name: 'StoryList',
  components: { StoryCard, CreateStoryCard, CreateStoryDialog },
  data() {
    return {
      stories: [],
      apiBaseUrl: '',
      loading: true,
      error: null,
      creating: false,
      showCreateDialog: false,
      searchQuery: '',
      genreFilter: 'all',
      sortBy: 'newest',
      debounceTimer: null,
    };
  },
  async mounted() {
    this.toast = useToast();
    await this.fetchStories();
  },
  methods: {
    async fetchStories() {
      this.loading = true;
      this.error = null;
      try {
        const params = new URLSearchParams();
        if (this.searchQuery.trim()) params.append('search', this.searchQuery.trim());
        if (this.genreFilter && this.genreFilter !== 'all')
          params.append('genre', this.genreFilter);
        if (this.sortBy) params.append('sort', this.sortBy);

        const queryString = params.toString() ? '?' + params.toString() : '';
        const res = await apiFetch(this.apiBaseUrl + '/api/stories' + queryString);
        if (!res.ok) throw new Error('Failed to load stories');
        this.stories = await res.json();
      } catch (e) {
        this.error = e.message;
        this.toast.addToast('error', 'Failed to load stories');
      } finally {
        this.loading = false;
      }
    },
    debouncedFetch() {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        this.fetchStories();
      }, 300);
    },
    createNewStory() {
      const auth = useAuthStore();
      if (!auth.isLoggedIn) {
        this.toast.addToast('error', 'Please login to create a story');
        this.$router.push('/login');
        return;
      }
      this.showCreateDialog = true;
    },
    onStoryCreated(storyId) {
      this.showCreateDialog = false;
      this.$router.push('/story/' + storyId);
    },
  },
};
</script>

<style scoped>
.story-list {
  max-width: 1200px;
  margin: 0 auto;
}
.list-header {
  margin-bottom: var(--space-lg);
}
.list-header h1 {
  font-size: var(--text-3xl);
  margin-bottom: var(--space-xs);
}
.filter-bar {
  display: flex;
  gap: var(--space-md);
  margin-bottom: var(--space-xl);
  flex-wrap: wrap;
}
.search-input {
  flex: 1;
  min-width: 240px;
  padding: var(--space-sm) var(--space-md);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: var(--text-sm);
  transition: border-color var(--transition-fast);
}
.search-input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.filter-select {
  padding: var(--space-sm) var(--space-md);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: var(--text-sm);
  cursor: pointer;
  outline: none;
  transition: border-color var(--transition-fast);
}
.filter-select:focus {
  border-color: var(--accent);
}
.story-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-lg);
}
.skeleton-card {
  min-height: 260px;
}
.skeleton-thumb {
  height: 160px;
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
}
</style>
