<template>
  <div class="faq-view">
    <div class="faq-header">
      <h2>Frequently Asked Questions</h2>
      <p class="text-muted">Everything you need to know about the Interactive Storybook platform.</p>
    </div>

    <div class="faq-layout">
      <!-- Sidebar Categories selector -->
      <aside class="faq-sidebar">
        <button
          v-for="cat in categories"
          :key="cat.id"
          :class="['category-btn', { active: activeCategory === cat.id }]"
          @click="selectCategory(cat.id)"
        >
          <span class="category-icon">{{ cat.icon }}</span>
          <span class="category-label">{{ cat.name }}</span>
        </button>
      </aside>

      <!-- Accordion Content -->
      <main class="faq-main">
        <div class="faq-list">
          <div
            v-for="(item, idx) in filteredFaqs"
            :key="idx"
            class="faq-card card"
            :class="{ expanded: expandedIndices.includes(idx) }"
          >
            <div class="faq-question" @click="toggleFaq(idx)">
              <h4>{{ item.question }}</h4>
              <span class="faq-toggle-arrow">▼</span>
            </div>
            <transition
              name="expand"
              @enter="enter"
              @after-enter="afterEnter"
              @leave="leave"
            >
              <div v-show="expandedIndices.includes(idx)" class="faq-answer-wrapper">
                <div class="faq-answer">
                  <p v-html="item.answer"></p>
                </div>
              </div>
            </transition>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>

<script>
export default {
  name: 'FAQView',
  data() {
    return {
      activeCategory: 'all',
      expandedIndices: [],
      categories: [
        { id: 'all', name: 'All Questions', icon: '🔍' },
        { id: 'general', name: 'General Storytelling', icon: '📚' },
        { id: 'ai', name: 'AI Writing & Art', icon: '✨' },
        { id: 'graph', name: 'Interactive Graph Map', icon: '🌳' },
        { id: 'safety', name: 'Safety & Deletions', icon: '🛡️' }
      ],
      faqs: [
        {
          category: 'general',
          question: 'What is Interactive Storybook?',
          answer: 'Interactive Storybook is an AI-powered storytelling platform where you can create and read branching narratives. Each choice you make leads to a completely new path, resulting in unique, illustrated, and highly personalized stories.'
        },
        {
          category: 'general',
          question: 'How do sparse tree nodes work in stories?',
          answer: 'Stories are structured as a **sparse tree array**. The root scene is always Node 0. Clicking a choice triggers the creation of a new target node index linked back to its parent. Because the tree is sparse, taking different paths creates populated nodes at specific indices without shifting the rest, preserving narrative links perfectly.'
        },
        {
          category: 'ai',
          question: 'Which AI engines write and illustrate the scenes?',
          answer: 'We utilize state-of-the-art models: <strong>Gemini Flash-lite</strong> is called to generate creative scene choice suggestions and openings based on your input. <strong>Fal.ai (Flux Schnell)</strong> is triggered to compile and render breathtaking custom illustration artwork for each individual scene.'
        },
        {
          category: 'ai',
          question: 'What is the "AI Art Director" and how do I use it?',
          answer: 'The AI Art Director is a collapsible visual style editor available on story scenes you author. You can type descriptive style overrides (e.g. <i>"Ghibli anime style, warm sunset lighting, highly detailed sketch"</i>). When you click the Regenerate (🔄) choice/artwork button, the AI will merge this visual override to produce consistent thematic art!'
        },
        {
          category: 'graph',
          question: 'How do I navigate using the zoomable SVG Narrative Node Graph?',
          answer: 'Inside the story display, you can toggle the collapsible Narrative Tree panel. It renders a dynamic SVG map showing the branching structure. You can **drag and pan** the canvas, **scroll/pinch to zoom** in or out, and **click on any circle node** to instantly jump your reader view to that exact scene!'
        },
        {
          category: 'graph',
          question: 'What do the different colors on the Node Graph represent?',
          answer: 'The graph dynamically colors nodes based on your reading progress: The **green glowing node** represents your active scene. **Slate filled nodes** are scenes you have already visited. **Dashed borders or uncolored circles** represent unexplored branches.'
        },
        {
          category: 'safety',
          question: 'How does Reader Progress Bookmarking work?',
          answer: 'When you are logged in as a registered user, the system automatically saves your exact scene progress in the database when you make choices. When returning to a story from the catalog, clicking "Read" automatically loads your exact saved scene location so you can resume seamlessly.'
        },
        {
          category: 'safety',
          question: 'Can I delete specific scenes from my stories?',
          answer: 'Yes! Authors can click the trash icon (🗑️) beside the prompt editor. To preserve tree integrity, we utilize **intelligent cascading deletion**—deleting a scene automatically purges all of its descendant branches and disconnects the choice in the parent node. **Associated custom images on disk** are also permanently unlinked to maintain storage efficiency. (Deleting Scene 0 deletes the story itself).'
        },
        {
          category: 'safety',
          question: 'What is the "Danger Zone" and how do I delete my account?',
          answer: 'Under your Author Profile dashboard, you can scroll down to the "Danger Zone" card and select "Delete Account...". To prevent accidental purges, you must type <strong>delete my account</strong> in the modal. Executing this permanently erases your user credentials, purges all authored stories from the database, and deletes all custom cover/node illustrations from the server disk.'
        },
        {
          category: 'ai',
          question: 'Is there a limit on image generations?',
          answer: 'Yes. To ensure server stability, we enforce daily and monthly limits on fal.ai generation counts. You can check your real-time usage (daily and monthly remaining counts) by visiting your profile stats dashboard or clicking on the usage indicators.'
        }
      ]
    }
  },
  computed: {
    filteredFaqs() {
      if (this.activeCategory === 'all') return this.faqs;
      return this.faqs.filter(faq => faq.category === this.activeCategory);
    }
  },
  methods: {
    selectCategory(catId) {
      this.activeCategory = catId;
      this.expandedIndices = [];
    },
    toggleFaq(idx) {
      const position = this.expandedIndices.indexOf(idx);
      if (position > -1) {
        this.expandedIndices.splice(position, 1);
      } else {
        this.expandedIndices.push(idx);
      }
    },
    // Transition hooks for smooth accordion height animations
    enter(el) {
      el.style.height = 'auto';
      const height = getComputedStyle(el).height;
      el.style.height = 0;
      // Force repaint
      el.offsetHeight; // eslint-disable-line no-unused-expressions
      el.style.height = height;
    },
    afterEnter(el) {
      el.style.height = 'auto';
    },
    leave(el) {
      el.style.height = getComputedStyle(el).height;
      // Force repaint
      el.offsetHeight; // eslint-disable-line no-unused-expressions
      el.style.height = 0;
    }
  }
}
</script>

<style scoped>
.faq-view {
  max-width: 1000px;
  margin: 0 auto;
  padding: var(--space-md);
  animation: fadeIn var(--transition-normal);
}
.faq-header {
  margin-bottom: var(--space-2xl);
  text-align: center;
}
.faq-header h2 {
  font-size: var(--text-3xl);
  font-weight: 800;
  color: var(--text-primary);
  margin-bottom: var(--space-xs);
  letter-spacing: -0.02em;
}
.faq-layout {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-2xl);
  align-items: flex-start;
}

@media (min-width: 768px) {
  .faq-layout {
    grid-template-columns: 240px 1fr;
  }
}

/* Sidebar Categories styling */
.faq-sidebar {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: var(--space-sm);
  background: var(--bg-card);
  padding: var(--space-md);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
}

@media (min-width: 768px) {
  .faq-sidebar {
    flex-direction: column;
    flex-wrap: nowrap;
  }
}

.category-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  background: transparent;
  border: none;
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
  text-align: left;
  flex: 1;
  min-width: 140px;
}
.category-btn:hover {
  background: var(--bg-hover);
  color: var(--accent);
}
.category-btn.active {
  background: var(--accent-soft);
  color: var(--accent);
}
.category-icon {
  font-size: 1.25rem;
  display: inline-flex;
  align-items: center;
}

/* Accordion list styling */
.faq-main {
  flex: 1;
}
.faq-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}
.faq-card {
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
  transition: all var(--transition-normal);
  overflow: hidden;
  background: var(--bg-card);
}
.faq-card:hover {
  border-color: var(--accent);
  box-shadow: var(--shadow-md);
}
.faq-card.expanded {
  border-color: var(--accent);
  box-shadow: var(--shadow-md);
}
.faq-question {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-lg) var(--space-xl);
  cursor: pointer;
  user-select: none;
}
.faq-question h4 {
  font-size: var(--text-md);
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
  line-height: 1.4;
  transition: color var(--transition-fast);
}
.faq-question:hover h4 {
  color: var(--accent);
}
.faq-toggle-arrow {
  font-size: var(--text-xs);
  color: var(--text-muted);
  transition: transform var(--transition-normal);
}
.faq-card.expanded .faq-toggle-arrow {
  transform: rotate(180deg);
  color: var(--accent);
}

/* Smooth Accordion Height animations */
.faq-answer-wrapper {
  overflow: hidden;
  transition: height var(--transition-normal);
}
.faq-answer {
  padding: 0 var(--space-xl) var(--space-lg) var(--space-xl);
  border-top: 1px dashed var(--border-light);
  padding-top: var(--space-md);
}
.faq-answer p {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  line-height: 1.6;
  margin: 0;
}

/* Transition classes */
.expand-enter-active,
.expand-leave-active {
  transition: height var(--transition-normal) ease;
}
.expand-enter-from,
.expand-leave-to {
  height: 0 !important;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
