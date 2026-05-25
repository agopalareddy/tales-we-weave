<template>
  <div class="modal-overlay" @click.self="handleOverlayClick">
    <div class="modal-content creation-dialog">
      <!-- Step 1: Title -->
      <div v-if="step === 1" class="step">
        <div class="step-indicator">Step 1 of 2</div>
        <h2>What's your story about?</h2>
        <p class="text-muted">Give your story a title to get started.</p>
        <div class="form-group">
          <input
            ref="titleInput"
            v-model="title"
            placeholder="Enter your story title..."
            @keyup.enter="proceedFromTitle"
            class="title-input"
          />
        </div>
        <div class="form-group">
          <label>Genre</label>
          <select v-model="genre" class="title-input" style="font-size: var(--text-sm);">
            <option value="Adventure">Adventure</option>
            <option value="Sci-Fi">Sci-Fi</option>
            <option value="Fantasy">Fantasy</option>
            <option value="Adventure">Adventure</option>
            <option value="Mystery">Mystery</option>
            <option value="Horror">Horror</option>
            <option value="Romance">Romance</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div class="form-group">
          <label>Synopsis (Description)</label>
          <textarea
            v-model="description"
            placeholder="Briefly describe what this story is about..."
            rows="2"
            class="prompt-input"
          ></textarea>
        </div>
        <div class="form-group">
          <label>Tags (Comma separated)</label>
          <input
            v-model="tagsInput"
            placeholder="magic, spaceships, mystery, dynamic..."
            class="title-input"
            style="font-size: var(--text-sm);"
          />
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="cancel">Cancel</button>
          <button class="btn btn-primary" @click="proceedFromTitle" :disabled="!title.trim()">
            Next
          </button>
        </div>
      </div>

      <!-- Step 2: Opening scene -->
      <div v-if="step === 2" class="step">
        <div class="step-indicator">Step 2 of 2</div>
        <h2>How should it begin?</h2>
        <p class="text-muted">Write your own opening or choose from AI suggestions.</p>

        <div class="form-group">
          <label>Write your own opening</label>
          <textarea
            v-model="customPrompt"
            placeholder="Once upon a time..."
            rows="2"
            class="prompt-input"
            @input="selectedSuggestion = null"
          ></textarea>
        </div>

        <div class="divider"><span>or</span></div>

        <div v-if="!suggestions.length && !generating" class="ai-section">
          <button class="btn btn-outline" @click="generateSuggestions">
            ✨ Generate opening ideas with AI
          </button>
        </div>

        <div v-if="generating" class="generating-hint">
          <div class="spinner spinner-sm"></div>
          <span>Generating ideas...</span>
        </div>

        <div v-if="suggestions.length > 0" class="suggestions">
          <label>AI-generated openings (click to select)</label>
          <div
            v-for="(s, i) in suggestions"
            :key="i"
            class="suggestion-card"
            :class="{ selected: selectedSuggestion === i }"
            @click="selectSuggestion(i)"
          >
            <span class="suggestion-num">{{ i + 1 }}</span>
            <span class="suggestion-text">{{ s }}</span>
            <span v-if="selectedSuggestion === i" class="suggestion-check">✓</span>
          </div>
        </div>

        <div class="modal-actions">
          <button class="btn btn-secondary" @click="step = 1">Back</button>
          <button
            class="btn btn-primary"
            @click="confirmOpening"
            :disabled="!selectedPrompt"
          >
            {{ creating ? 'Creating...' : 'Create Story' }}
          </button>
        </div>
      </div>

      <!-- Step 3: Creating -->
      <div v-if="step === 3" class="step step-creating">
        <div class="spinner" style="width:40px;height:40px;border-width:4px;margin-bottom:var(--space-lg)"></div>
        <h2>Creating your story...</h2>
        <div class="progress-track">
          <div class="progress-item" :class="{ done: progress >= 1 }">
            <span class="progress-bullet">{{ progress >= 1 ? '✓' : '1' }}</span>
            <span class="progress-label">Saving story</span>
          </div>
          <div class="progress-item" :class="{ done: progress >= 2 }">
            <span class="progress-bullet">{{ progress >= 2 ? '✓' : '2' }}</span>
            <span class="progress-label">Generating artwork</span>
          </div>
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
  name: 'CreateStoryDialog',
  emits: ['close', 'created'],
  data() {
    return {
      step: 1,
      title: '',
      customPrompt: '',
      suggestions: [],
      selectedSuggestion: null,
      generating: false,
      creating: false,
      progress: 0,
      genre: 'Adventure',
      description: '',
      tagsInput: ''
    }
  },
  computed: {
    selectedPrompt() {
      if (this.customPrompt.trim()) return this.customPrompt.trim()
      if (this.selectedSuggestion !== null) return this.suggestions[this.selectedSuggestion]
      return null
    }
  },
  mounted() {
    this.$nextTick(() => {
      if (this.$refs.titleInput) this.$refs.titleInput.focus()
    })
  },
  methods: {
    async generateSuggestions() {
      if (!this.title.trim()) return
      this.generating = true
      try {
        const res = await apiFetch('/api/generate-prompt', {
          method: 'POST',
          body: JSON.stringify({ title: this.title.trim() })
        })
        if (!res.ok) throw new Error('Failed to generate')
        const data = await res.json()
        this.suggestions = data.prompts || []
      } catch (e) {
        this.suggestions = [
          `Once upon a time, in a world of ${this.title}, an adventure began...`,
          `The story of ${this.title} starts on an ordinary day...`,
          `In the heart of ${this.title}, a mystery awaited...`
        ]
      } finally {
        this.generating = false
      }
    },
    selectSuggestion(index) {
      this.selectedSuggestion = this.selectedSuggestion === index ? null : index
      if (this.selectedSuggestion !== null) this.customPrompt = ''
    },
    proceedFromTitle() {
      if (this.title.trim()) this.step = 2
    },
    async confirmOpening() {
      const prompt = this.selectedPrompt
      if (!prompt) return

      this.step = 3
      this.creating = true
      this.progress = 0

      try {
        const auth = useAuthStore()
        const toast = useToast()

        const tags = this.tagsInput.split(',')
          .map(t => t.trim())
          .filter(t => t.length > 0)

        // Step A: Create the story
        this.progress = 0
        const storyRes = await apiFetch('/api/stories', {
          method: 'POST',
          body: JSON.stringify({
            title: this.title.trim(),
            genre: this.genre,
            description: this.description.trim(),
            tags: tags,
            nodes: [{ prompt, choices: [], image: '' }],
            lastNodeId: 0
          })
        })
        if (!storyRes.ok) throw new Error('Failed to create story')
        const storyData = await storyRes.json()
        const storyId = storyData.insertedId || storyData._id
        this.progress = 1
 
        // Step B: Generate image for node 0
        const imgRes = await apiFetch('/api/generate-image', {
          method: 'POST',
          body: JSON.stringify({
            prompt,
            storyId: storyId,
            nodeIndex: 0
          })
        })
        if (imgRes.ok) {
          const imgData = await imgRes.json()
          if (imgData.imageUrl) {
            await apiFetch(`/api/stories/${storyId}/node/0/image`, {
              method: 'PUT',
              body: JSON.stringify({ image: imgData.imageUrl })
            })
          }
        }
        this.progress = 2

        toast.addToast('success', 'Story created!')
        this.$emit('created', storyId)
      } catch (e) {
        console.error('Create story error:', e)
        useToast().addToast('error', 'Failed to create story')
        this.step = 2
      } finally {
        this.creating = false
      }
    },
    handleOverlayClick() {
      if (this.step !== 3) this.cancel()
    },
    cancel() {
      if (this.step !== 3) this.$emit('close')
    }
  }
}
</script>

<style scoped>
.modal-overlay {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(0,0,0,0.5); display: flex;
  align-items: center; justify-content: center;
  padding: var(--space-md);
}
.modal-content {
  background: var(--card-bg); border-radius: var(--radius-lg);
  width: 100%; max-width: 520px; max-height: 90vh; overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0,0,0,0.3); padding: var(--space-2xl);
}
.step { min-height: 200px; }
.step h2 { margin-bottom: var(--space-xs); font-size: var(--text-xl); }
.step-indicator { font-size: var(--text-xs); color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: var(--space-md); }
.form-group { margin: var(--space-md) 0; }
.form-group label { display: block; margin-bottom: var(--space-xs); font-size: var(--text-sm); font-weight: 600; color: var(--text-secondary); }
.title-input, .prompt-input {
  width: 100%; padding: var(--space-sm) var(--space-md);
  border: 1px solid var(--border); border-radius: var(--radius-md);
  background: var(--bg-primary); color: var(--text-primary);
  font-size: var(--text-base); transition: border-color 0.2s;
  box-sizing: border-box; font-family: var(--font-sans);
}
.title-input:focus, .prompt-input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.prompt-input { resize: vertical; min-height: 60px; }
.modal-actions { display: flex; justify-content: flex-end; gap: var(--space-sm); margin-top: var(--space-lg); }
.divider { display: flex; align-items: center; gap: var(--space-md); margin: var(--space-md) 0; color: var(--text-muted); font-size: var(--text-sm); }
.divider::before, .divider::after { content: ''; flex: 1; height: 1px; background: var(--border); }
.ai-section { text-align: center; margin: var(--space-md) 0; }
.btn-outline { background: transparent; border: 1px dashed var(--accent); color: var(--accent); padding: var(--space-sm) var(--space-lg); border-radius: var(--radius-md); cursor: pointer; font-size: var(--text-sm); transition: all 0.2s; }
.btn-outline:hover { background: var(--accent-soft); }
.generating-hint { display: flex; align-items: center; justify-content: center; gap: var(--space-sm); padding: var(--space-lg); color: var(--text-muted); }
.suggestions { margin: var(--space-md) 0; }
.suggestions label { display: block; margin-bottom: var(--space-sm); font-size: var(--text-sm); font-weight: 600; color: var(--text-secondary); }
.suggestion-card {
  display: flex; align-items: center; gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md); margin-bottom: var(--space-xs);
  border: 1px solid var(--border); border-radius: var(--radius-md);
  cursor: pointer; transition: all 0.2s;
}
.suggestion-card:hover { border-color: var(--accent); background: var(--accent-soft); }
.suggestion-card.selected { border-color: var(--accent); background: var(--accent-soft); box-shadow: 0 0 0 2px var(--accent); }
.suggestion-num { width: 24px; height: 24px; border-radius: 50%; background: var(--bg-secondary); display: flex; align-items: center; justify-content: center; font-size: var(--text-xs); font-weight: 700; flex-shrink: 0; }
.suggestion-card.selected .suggestion-num { background: var(--accent); color: #fff; }
.suggestion-text { flex: 1; font-size: var(--text-sm); line-height: 1.4; }
.suggestion-check { color: var(--accent); font-weight: 700; font-size: var(--text-lg); }
.progress-track { display: flex; flex-direction: column; gap: var(--space-md); margin-top: var(--space-lg); }
.progress-item { display: flex; align-items: center; gap: var(--space-md); }
.progress-bullet { width: 32px; height: 32px; border-radius: 50%; border: 2px solid var(--border); display: flex; align-items: center; justify-content: center; font-size: var(--text-sm); font-weight: 700; color: var(--text-muted); transition: all 0.3s; }
.progress-item.done .progress-bullet { border-color: var(--success); background: var(--success); color: #fff; }
.progress-label { font-size: var(--text-sm); color: var(--text-muted); }
.progress-item.done .progress-label { color: var(--text-primary); font-weight: 600; }
.step-creating { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 250px; text-align: center; }
</style>
