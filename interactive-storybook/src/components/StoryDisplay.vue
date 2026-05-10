<template>
    <div v-if="storyLoading" class="flex-center" style="padding: var(--space-3xl); flex-direction: column; gap: var(--space-md);">
        <div class="spinner"></div>
        <p class="text-muted">Loading story...</p>
    </div>
    <div v-else-if="storyNotFound" class="flex-center" style="padding: var(--space-3xl); flex-direction: column; gap: var(--space-md);">
        <p style="font-size: var(--text-lg);">Story not found</p>
        <router-link to="/" class="btn btn-primary">Back to Stories</router-link>
    </div>
    <div v-else-if="storyError" class="flex-center" style="padding: var(--space-3xl); flex-direction: column; gap: var(--space-md);">
        <p class="error-message">{{ storyError }}</p>
        <button class="btn btn-primary" @click="fetchStory">Try Again</button>
    </div>
    <div v-else-if="story">
        <div class="path-info" v-if="currentNodeData && currentNodeData.pathToRoot?.length">
            <span class="path-label">Path:</span>
            <span class="path-breadcrumbs">
                <span v-for="(pid, pidx) in currentNodeData.pathToRoot" :key="pidx" class="crumb-link" @click="nodeNav(pid)">
                    Node {{ pid }}
                </span>
                <span class="crumb-current">Node {{ currentNode }}</span>
            </span>
            <span class="depth-badge">Depth {{ currentNodeData.depth }}</span>
        </div>
        <div class="title-container">
            <input v-model="story.title" @input="handleTitleChange" :class="{ 'edited': titleChanged }">
            <button v-if="titleChanged" @click="saveTitle" class="save-title-btn" :disabled="!story.title.trim()">
                Save Title
            </button>
        </div>
        <div class="prompt-section">
            <div v-if="!editingPrompt" class="prompt-display">
                <p class="prompt-text">{{ story.nodes[currentNode]?.prompt || 'Loading node...' }}</p>
                <button @click="toggleEditPrompt" class="btn-edit-prompt" title="Edit prompt">&#9998;</button>
            </div>
            <div v-else class="prompt-edit">
                <textarea v-model="editPromptBuffer" class="prompt-textarea" rows="4"></textarea>
                <div class="prompt-edit-actions">
                    <button @click="savePrompt" class="btn btn-primary btn-sm">Save</button>
                    <button @click="cancelEditPrompt" class="btn btn-secondary btn-sm">Cancel</button>
                </div>
            </div>
        </div>
        <div v-if="loading">Generating image...</div>
        <div v-if="story.nodes[currentNode]?.image" class="image-container">
            <img :src="story.nodes[currentNode].image" alt="Story Image">
            <button @click="regenerateImage" :disabled="loading" class="regenerate-btn">
                🔄 Regenerate Image
            </button>
        </div>
        <div v-if="error" class="error-message">
            {{ error }}
        </div>
        <ul v-if="story.nodes[currentNode]?.choices">
            <li v-for="(choice, index) in story.nodes[currentNode].choices" :key="index">
                <ChoiceButton @click="handleChoice(choice.nextNodeId)">
                    {{ choice.text }}
                </ChoiceButton>
            </li>
            <!-- Add regenerate choices button -->
            <button @click="regenerateChoices" :disabled="isNewStory" :title="regenerateButtonTitle"
                class="regenerate-btn" :class="{ 'disabled': isNewStory }">
                <span>🔄 Regenerate Choices</span>
                <span v-if="isNewStory" class="disabled-hint">
                    (Update story title to enable)
                </span>
            </button>
        </ul>
        <NavigationLinks />
        <!-- Add this near NavigationLinks -->
        <div class="actions">
            <button @click="confirmDelete" class="delete-btn">
                Delete Story
            </button>
        </div>
        <!-- Add confirmation dialog -->
        <div v-if="showDeleteConfirm" class="delete-modal">
            <div class="delete-modal-content">
                <h3>Delete Story?</h3>
                <p>Are you sure you want to delete "{{ story.title }}"? This cannot be undone.</p>
                <div class="delete-modal-actions">
                    <button @click="deleteStory" class="confirm-delete">Delete</button>
                    <button @click="showDeleteConfirm = false" class="cancel-delete">Cancel</button>
                </div>
            </div>
        </div>
    </div>
    
</template>

<script>
import { useToast } from '@/stores/useToast.js'
import ChoiceButton from './ChoiceButton.vue';
import NavigationLinks from './NavigationLinks.vue';

export default {
    name: 'StoryDisplay',
    components: {
        ChoiceButton,
        NavigationLinks,
    },
    data() {
        return {
            story: null,
            currentNode: 0,
            loading: false,
            apiBaseUrl: '',
            showDeleteConfirm: false,
            regeneratingChoices: false,
            storyLoading: false,
            storyError: null,
            storyNotFound: false,
            imageGenerating: false,
            choicesGenerating: false,
            nodeCreating: false,
            titleChanged: false,
            editingPrompt: false,
            editPromptBuffer: '',
        };
    },
    computed: {
        currentNodeData() {
            return this.story?.nodes[this.currentNode];
        },
        isNewStory() {
            return this.story?.title === "New Story";
        },
        regenerateButtonTitle() {
            return this.isNewStory
                ? "Please update the story title from 'New Story' to enable choice regeneration"
                : "Generate new choices for this node";
        }
    },
    watch: {
        currentNodeData: {
            async handler(newNode) {
                if (newNode && (!newNode.choices || newNode.choices.length === 0)) {
                    await this.generateChoices(this.currentNode);
                }
            }
        },
        currentNode: {
            async handler(newNode) {
                if (this.story?.nodes) {
                    if (!this.story.nodes[newNode]) {
                        await this.createNewNode(newNode);
                    } else if (!this.story.nodes[newNode].image) {
                        await this.generateAndSaveImage(newNode);
                    }
                }
                // Sync current node to URL for persistence across refreshes
                const storyId = this.$route.params.id;
                this.$router.replace({ path: '/story/' + storyId, query: { node: newNode } }).catch(() => {});
            },
            immediate: true
        }
    },
    methods: {
        async fetchStory() {
            this.storyLoading = true;
            this.storyError = null;
            this.storyNotFound = false;
            try {
                const storyId = this.$route.params.id;
                const response = await fetch(`${this.apiBaseUrl}/api/stories/${storyId}`);

                if (response.status === 404) {
                    this.storyNotFound = true;
                    return;
                }
                if (!response.ok) {
                    throw new Error('Failed to fetch story');
                }

                const data = await response.json();
                if (!data) {
                    this.storyNotFound = true;
                    return;
                }

                this.story = data;

                // Respect URL node param; fall back to 0
                const nodeParam = parseInt(this.$route.query.node);
                const startNode = (!isNaN(nodeParam) && nodeParam >= 0 && this.story.nodes[nodeParam]) ? nodeParam : 0;
                this.currentNode = startNode;

                // Only generate image for the first node if it's node 0 AND has no image
                if (startNode === 0 && this.story.nodes && this.story.nodes[0] && !this.story.nodes[0].image) {
                    await this.generateAndSaveImage(0).catch(e => console.error('Image gen failed:', e));
                }
            } catch (error) {
                console.error('Error fetching story:', error);
                this.storyError = error.message || 'Failed to load story';
            } finally {
                this.storyLoading = false;
            }
        },
        nodeNav(nodeIndex) {
            if (nodeIndex === undefined || nodeIndex < 0) return;
            this.currentNode = nodeIndex;
        },
        toggleEditPrompt() {
            if (this.editingPrompt) {
                this.editingPrompt = false;
                return;
            }
            const node = this.story?.nodes[this.currentNode];
            if (!node) return;
            this.editPromptBuffer = node.prompt || '';
            this.editingPrompt = true;
        },
        async savePrompt() {
            const node = this.story?.nodes[this.currentNode];
            if (!node || !this.editPromptBuffer.trim()) return;
            
            const storyId = this.$route.params.id;
            const nodeIndex = this.currentNode;
            
            try {
                const res = await fetch(`${this.apiBaseUrl}/api/stories/${storyId}/node/${nodeIndex}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ...node,
                        prompt: this.editPromptBuffer.trim()
                    })
                });
                
                if (!res.ok) throw new Error('Failed to save');
                const data = await res.json();
                if (data.success) {
                    this.story.nodes[this.currentNode].prompt = this.editPromptBuffer.trim();
                    this.editingPrompt = false;
                    try { this.toast.addToast('success', 'Prompt saved'); } catch(e) { console.error(e); }
                }
            } catch (error) {
                console.error('Error saving prompt:', error);
                try { this.toast.addToast('error', 'Failed to save prompt'); } catch(e) { console.error(e); }
            }
        },
        cancelEditPrompt() {
            this.editingPrompt = false;
            this.editPromptBuffer = '';
        },
        async createNewNode(parentNodeId, choiceText, targetNodeIndex) {
            try {
                if (!this.story) {
                    throw new Error("Story not loaded");
                }
                // Use targetNodeIndex if provided, otherwise determine from array length
                const nextNodeIndex = (targetNodeIndex !== undefined && targetNodeIndex >= 0)
                    ? targetNodeIndex
                    : this.story.nodes.length;

                // Pad the nodes array so the target index exists
                while (this.story.nodes.length <= nextNodeIndex) {
                    this.story.nodes.push(null);
                }

                const response = await fetch(`${this.apiBaseUrl}/api/stories/${this.$route.params.id}/node`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        nodeIndex: nextNodeIndex,
                        nodeId: nextNodeIndex,
                        prompt: choiceText || 'Continue your story here...',
                        choices: [],
                        image: '',
                        parentNodeId: parentNodeId
                    })
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || `Failed to create node: ${response.statusText}`);
                }

                const result = await response.json();
                if (result.success) {
                    // Update local state without triggering additional fetches
                    this.story.nodes[nextNodeIndex] = result.node;
                    this.story.lastNodeId = nextNodeIndex;
                    return result.node;
                }
            } catch (error) {
                console.error('Error creating new node:', error);
                throw error;
            }
        },
        // Add new method to generate choices
        async generateChoices(nodeIndex) {
            try {
                const response = await fetch(`${this.apiBaseUrl}/api/stories/${this.$route.params.id}/node/${nodeIndex}/choices`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        prompt: this.story.nodes[nodeIndex].prompt
                    })
                });

                if (!response.ok) {
                    throw new Error('Failed to generate choices');
                }

                const result = await response.json();
                this.story.nodes[nodeIndex].choices = result.choices;
            } catch (error) {
                console.error('Error generating choices:', error);
            }
        },
        async generateAndSaveImage(nodeIndex) {
            if (this.loading) return;
            this.loading = true;
            this.error = null;

            try {
                const currentNode = this.story.nodes[nodeIndex];
                // Combine prompt and choices into a single descriptive prompt
                const choices = currentNode.choices?.map(c => c.text).join(' or ') || '';
                const fullPrompt = `${currentNode.prompt} ${choices ? `With choices: ${choices}` : ''}`;

                const response = await fetch(`${this.apiBaseUrl}/api/generate-image`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        prompt: fullPrompt
                    })
                });

                if (!response.ok) throw new Error(`Image generation failed: ${response.statusText}`);

                const data = await response.json();

                // Update server first
                const saveResponse = await fetch(`${this.apiBaseUrl}/api/stories/${this.$route.params.id}/node/${nodeIndex}/image`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ image: data.imageUrl })
                });

                if (!saveResponse.ok) throw new Error('Failed to save image');

                // Update local state after server confirms
                this.story.nodes[nodeIndex].image = data.imageUrl;
            } catch (error) {
                console.error('Error:', error);
                this.error = error.message;
            } finally {
                this.loading = false;
            }
        },
        async handleChoice(nodeIndex) {
            try {
                if (this.loading) return;
                this.loading = true;

                if (nodeIndex === undefined || nodeIndex === null || nodeIndex < 0) {
                    throw new Error('Invalid choice');
                }

                // Create the node at nodeIndex if it doesn't exist yet
                if (!this.story.nodes[nodeIndex]) {
                    const choice = this.story?.nodes[this.currentNode]?.choices?.find(c => c.nextNodeId === nodeIndex);
                    await this.createNewNode(this.currentNode, choice ? choice.text : 'Continue...', nodeIndex);
                }

                // Release loading BEFORE setting currentNode so the watcher
                // can call generateAndSaveImage without being blocked
                this.loading = false;
                this.currentNode = nodeIndex;
            } catch (error) {
                console.error('Error handling choice:', error);
                this.error = error.message;
                this.loading = false;
            }

        },
        async regenerateImage() {
            await this.generateAndSaveImage(this.currentNode);
        },
        async regenerateChoices() {
            if (this.regeneratingChoices || this.story.title === "New Story") return;
            this.regeneratingChoices = true;
            this.error = null;

            try {
                if (!this.story?.nodes[this.currentNode]?.prompt) {
                    throw new Error('No prompt available for current node');
                }

                const response = await fetch(
                    `${this.apiBaseUrl}/api/stories/${this.$route.params.id}/node/${this.currentNode}/choices`,
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            prompt: this.story.nodes[this.currentNode].prompt
                        })
                    }
                );

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || 'Failed to regenerate choices');
                }

                if (!data.success) {
                    throw new Error(data.error || 'Failed to update choices');
                }

                // Update local state with new choices
                this.story.nodes[this.currentNode].choices = data.choices;

                // Fetch fresh story data to ensure consistency

            } catch (error) {
                console.error('Error regenerating choices:', error);
                this.error = error.message;
            } finally {
                this.regeneratingChoices = false;
            }
        },
        async updateStoryTitle() {
            try {
                // Only attempt update if title has changed from default
                if (!this.story?.title || this.story.title.trim() === '') {
                    throw new Error('Story title cannot be empty');
                }

                const response = await fetch(`${this.apiBaseUrl}/api/stories/${this.$route.params.id}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        title: this.story.title,
                        nodes: this.story.nodes, // Include nodes to maintain data integrity
                        lastNodeId: this.story.lastNodeId // Include lastNodeId if it exists
                    })
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || 'Failed to update story title');
                }

                // Update local state to reflect changes
                if (data.success) {
                    this.error = null;
                }
            } catch (error) {
                console.error('Error updating story title:', error);
                this.error = error.message;
                // Revert title if update failed
            }
        },
        confirmDelete() {
            this.showDeleteConfirm = true;
        },
        async deleteStory() {
            try {
                const response = await fetch(`${this.apiBaseUrl}/api/stories/${this.$route.params.id}`, {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });

                if (!response.ok) {
                    throw new Error('Failed to delete story');
                }

                // Redirect to story list after successful deletion
                this.$router.push('/');
            } catch (error) {
                console.error('Error deleting story:', error);
            } finally {
                this.showDeleteConfirm = false;
            }
        },
        handleTitleChange() {
            this.titleChanged = true;
        },

        async saveTitle() {
            try {
                if (!this.story?.title || this.story.title.trim() === '') {
                    throw new Error('Story title cannot be empty');
                }

                await this.updateTitle(this.$route.params.id, this.story.title);
                this.titleChanged = false;
                this.error = null;
            } catch (error) {
                console.error('Error updating story title:', error);
                this.error = error.message;
            }
        },

        async updateTitle(storyId, newTitle) {
            const response = await fetch(`${this.apiBaseUrl}/api/stories/${storyId}/title`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ title: newTitle })
            });

            const data = await response.json();
            if (data.success) {
                // Update local state with new title and prompt
                this.story.title = data.title;
                this.story.nodes[0].prompt = data.newPrompt;
            }
        }
    },
    mounted() {
        this.toast = useToast();
        // Restore node position from URL query param
        const nodeParam = parseInt(this.$route.query.node);
        if (!isNaN(nodeParam) && nodeParam >= 0) {
            this.currentNode = nodeParam;
        }
        this.fetchStory();
    },
};
</script>

<style scoped>
.story-display { max-width: 800px; margin: 0 auto; padding: var(--space-lg); }

.loading {
    padding: var(--space-md);
    color: var(--text-muted);
    font-style: italic;
}

img {
    max-width: 100%;
    height: auto;
    margin: var(--space-md) 0;
}

.image-container {
    position: relative;
    display: inline-block;
}

.regenerate-btn {
    position: absolute;
    top: var(--space-sm);
    right: var(--space-sm);
    padding: var(--space-xs) var(--space-md);
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: var(--text-sm);
    color: var(--text-secondary);
    transition: background-color var(--transition-fast), border-color var(--transition-fast);
}

.regenerate-btn:hover:not(:disabled) {
    background: var(--bg-hover);
    border-color: var(--accent);
}

.regenerate-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.story-title {
    font-size: var(--text-xl);
    padding: var(--space-sm);
    margin: var(--space-md) 0;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    width: 80%;
    max-width: 600px;
    background: var(--bg-primary);
    color: var(--text-primary);
}

.story-title:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
}

.path-info {
    font-size: var(--text-sm);
    color: var(--text-muted);
    margin: var(--space-sm) 0;
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    flex-wrap: wrap;
}

.path-label {
    font-weight: 600;
}

.path-breadcrumbs {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
}

.crumb-link {
    color: var(--accent);
    cursor: pointer;
    font-weight: 500;
}

.crumb-link:hover {
    text-decoration: underline;
}

.crumb-current {
    color: var(--text-primary);
    font-weight: 700;
}

.depth-badge {
    margin-left: auto;
    padding: var(--space-xs) var(--space-sm);
    background: var(--bg-secondary);
    border-radius: var(--radius-full);
    font-size: var(--text-xs);
    color: var(--text-muted);
}

.actions {
    margin-top: var(--space-md);
}

.delete-btn {
    background-color: var(--danger);
    color: var(--text-inverse);
    border: none;
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-weight: 600;
    transition: background-color var(--transition-fast);
}

.delete-btn:hover {
    background-color: var(--danger-hover);
}

.delete-modal {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: var(--bg-overlay);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: var(--z-modal-backdrop);
}

.delete-modal-content {
    background: var(--bg-card);
    padding: var(--space-2xl);
    border-radius: var(--radius-lg);
    text-align: center;
    box-shadow: var(--shadow-xl);
    max-width: 480px;
    margin: var(--space-lg);
}

.delete-modal-actions {
    margin-top: var(--space-md);
}

.confirm-delete {
    background-color: var(--danger);
    color: var(--text-inverse);
    border: none;
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-sm);
    cursor: pointer;
    margin-right: var(--space-md);
    font-weight: 600;
}

.confirm-delete:hover {
    background-color: var(--danger-hover);
}

.cancel-delete {
    background-color: var(--border);
    color: var(--text-primary);
    border: none;
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-weight: 600;
}

.cancel-delete:hover {
    background-color: var(--border-strong);
}

.regenerate-btn {
    margin-top: var(--space-md);
    padding: var(--space-sm) var(--space-md);
    background-color: var(--accent);
    color: var(--text-inverse);
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-left: auto;
    margin-right: auto;
    font-weight: 600;
    transition: background-color var(--transition-fast);
}

.regenerate-btn:hover:not(:disabled) {
    background-color: var(--accent-hover);
}

.regenerate-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
}

.regenerate-btn.disabled {
    opacity: 0.6;
    cursor: not-allowed;
    background-color: var(--border);
}

.disabled-hint {
    font-size: var(--text-xs);
    color: var(--text-muted);
    margin-left: var(--space-xs);
}

.error-message {
    color: var(--danger);
    padding: var(--space-sm) var(--space-md);
    margin: var(--space-sm) 0;
    border-radius: var(--radius-md);
    background-color: var(--danger-soft);
    border: 1px solid var(--danger);
}

.title-container {
    display: flex;
    gap: var(--space-md);
    align-items: center;
    margin-bottom: var(--space-md);
}

.title-container input {
    flex: 1;
    padding: var(--space-sm) var(--space-md);
    font-size: var(--text-lg);
    font-weight: 600;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg-primary);
    color: var(--text-primary);
    transition: border-color var(--transition-fast);
}

.title-container input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
}

.edited {
    border-color: var(--accent);
}

.save-title-btn {
    padding: var(--space-sm) var(--space-md);
    background-color: var(--accent);
    color: var(--text-inverse);
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-weight: 600;
    white-space: nowrap;
    transition: background-color var(--transition-fast);
}

.save-title-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
}

.save-title-btn:hover:not(:disabled) {
    background-color: var(--accent-hover);
}

.prompt-section {
    margin-bottom: var(--space-lg);
}

.prompt-display {
    display: flex;
    align-items: flex-start;
    gap: var(--space-sm);
}

.prompt-text {
    flex: 1;
    font-size: var(--text-md);
    line-height: 1.6;
    color: var(--text-primary);
}

.btn-edit-prompt {
    padding: var(--space-xs) var(--space-sm);
    background: transparent;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text-muted);
    cursor: pointer;
    font-size: var(--text-sm);
    transition: color var(--transition-fast), border-color var(--transition-fast);
}

.btn-edit-prompt:hover {
    color: var(--accent);
    border-color: var(--accent);
}

.prompt-edit {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
}

.prompt-textarea {
    width: 100%;
    padding: var(--space-sm) var(--space-md);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: var(--text-md);
    line-height: 1.6;
    resize: vertical;
    min-height: 80px;
    font-family: var(--font-sans);
}

.prompt-textarea:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
}

.prompt-edit-actions {
    display: flex;
    gap: var(--space-sm);
    justify-content: flex-end;
}
</style>