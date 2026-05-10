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
                <span v-for="(pid, pidx) in currentNodeData.pathToRoot" :key="pidx" class="crumb-link" @click="currentNode = pid">
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
                    // Safe access with optional chaining
                    if (!this.story.nodes[newNode]) {
                        await this.createNewNode(newNode);
                    } else if (!this.story.nodes[newNode].image) {
                        await this.generateAndSaveImage(newNode);
                    }
                }
            },
            immediate: true
        }
    },
    methods: {
        async fetchStory() {
            try {
                const storyId = this.$route.params.id;
                const response = await fetch(`${this.apiBaseUrl}/api/stories/${storyId}`);
                this.story = await response.json();

                if (!this.story.nodes[this.currentNode]) {
                    await this.createNewNode(this.currentNode);
                } else if (!this.story.nodes[this.currentNode].image) {
                    await this.generateAndSaveImage(this.currentNode);
                }
            } catch (error) {
                console.error('Error fetching story:', error);
            }
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
        async createNewNode(parentNodeId, choiceText) {
            try {
                if (!this.story) {
                    throw new Error("Story not loaded");
                }
                // Find next available nodeId
                // const maxNodeId = Math.max(...this.story.nodes
                //     .filter(n => n)
                //     .map(n => n.nodeId), -1);
                // const nextNodeIndex = maxNodeId + 1;
                const nextNodeIndex = this.story.nodes.length;

                const response = await fetch(`${this.apiBaseUrl}/api/stories/${this.$route.params.id}/node`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        nodeIndex: nextNodeIndex, // This will be the index in the array
                        nodeId: nextNodeIndex,    // Add this to track the node ID
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
            } catch (error) {
                console.error('Error:', error);
                this.error = error.message;
            } finally {
                this.loading = false;
            }
        },
        async handleChoice(nextNodeId) {
            try {
                if (this.loading) return;
                this.loading = true;

                const currentNode = this.story?.nodes[this.currentNode];
                const choice = currentNode?.choices.find(choice => choice.nextNodeId === nextNodeId);
                if (!choice) {
                    throw new Error('Invalid choice selected');
                }
                // if (!this.story.nodes[nextNodeId]) {
                //     const existingNode = this.story.nodes.find(n => n?.nodeId === nextNodeId);
                //     if (!existingNode) {
                //         const newNode = await this.createNewNode(this.currentNode, choice.text);
                //         if (newNode) {
                //             this.story.nodes[nextNodeId] = newNode;
                //         }
                //     }
                // }
                if (!this.story.nodes[nextNodeId]) {
                    await this.createNewNode(this.currentNode, choice.text);
                    // Let the watcher handle image and choice generation
                }
                // Update current node only after successful creation/fetch
                this.currentNode = nextNodeId;
                this.loading = false;
            } catch (error) {
                console.error('Error handling choice:', error);
                this.error = error.message;
            } finally {
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
        this.fetchStory();
    },
};
</script>

<style scoped>
.loading {
    padding: 1rem;
    color: #666;
    font-style: italic;
}

img {
    max-width: 100%;
    height: auto;
    margin: 1rem 0;
}

.image-container {
    position: relative;
    display: inline-block;
}

.regenerate-btn {
    position: absolute;
    top: 10px;
    right: 10px;
    padding: 8px 16px;
    background: rgba(255, 255, 255, 0.9);
    border: 1px solid #ccc;
    border-radius: 4px;
    cursor: pointer;
}

.regenerate-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.story-title {
    font-size: 1.5rem;
    padding: 0.5rem;
    margin: 1rem 0;
    border: 1px solid #ddd;
    border-radius: 4px;
    width: 80%;
    max-width: 600px;
}

.story-title:focus {
    outline: none;
    border-color: #42b983;
}

.path-info {
    font-size: 0.8em;
    color: #666;
    margin: 0.5rem 0;
}

.actions {
    margin-top: 1rem;
}

.delete-btn {
    background-color: #ff4d4d;
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
}

.delete-modal {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
}

.delete-modal-content {
    background: white;
    padding: 2rem;
    border-radius: 4px;
    text-align: center;
}

.delete-modal-actions {
    margin-top: 1rem;
}

.confirm-delete {
    background-color: #ff4d4d;
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
    margin-right: 1rem;
}

.cancel-delete {
    background-color: #ccc;
    color: black;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
}

/* Add button styling */
.regenerate-btn {
    margin-top: 1rem;
    padding: 0.5rem 1rem;
    background-color: #42b983;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-left: auto;
    margin-right: auto;
}

.regenerate-btn:disabled {
    background-color: #ccc;
    cursor: not-allowed;
}

.regenerate-btn:hover:not(:disabled) {
    background-color: #3aa876;
}

.regenerate-btn.disabled {
    opacity: 0.6;
    cursor: not-allowed;
    background-color: #ccc;
}

.disabled-hint {
    font-size: 0.8em;
    color: #666;
    margin-left: 0.5rem;
}

.error-message {
    color: #dc3545;
    padding: 0.5rem;
    margin: 0.5rem 0;
    border-radius: 4px;
    background-color: #f8d7da;
}

.title-container {
    display: flex;
    gap: 1rem;
    align-items: center;
    margin-bottom: 1rem;
}

.edited {
    border-color: #42b983;
}

.save-title-btn {
    padding: 0.5rem 1rem;
    background-color: #42b983;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
}

.save-title-btn:disabled {
    background-color: #ccc;
    cursor: not-allowed;
}

.save-title-btn:hover:not(:disabled) {
    background-color: #3aa876;
}
</style>