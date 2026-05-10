<template>
    <div v-if="storyLoading" class="flex-center story-state">
        <div class="spinner"></div>
        <p class="text-muted mt-md">Loading story...</p>
    </div>
    <div v-else-if="storyNotFound" class="flex-center story-state">
        <p style="font-size: var(--text-lg);">Story not found</p>
        <router-link to="/" class="btn btn-primary mt-md">Back to Stories</router-link>
    </div>
    <div v-else-if="storyError" class="flex-center story-state">
        <p class="error-message">{{ storyError }}</p>
        <button class="btn btn-primary mt-md" @click="fetchStory">Try Again</button>
    </div>
    <div v-else-if="story" class="story-view">
        <!-- Story Tree Toggle -->
        <button class="tree-toggle" @click="showTree = !showTree" :aria-expanded="showTree">
            <span v-if="showTree">✕ Hide Tree</span>
            <span v-else>🌳 Show Story Tree</span>
        </button>

        <!-- Story Tree Panel -->
        <div v-if="showTree" class="tree-panel">
            <div class="tree-title">Story Branches</div>
            <div class="tree-content">
                <ul class="tree-root">
                    <li v-for="node in treeNodes" :key="node.idx">
                        <div
                            class="tree-node"
                            :class="{
                                'tree-node--current': node.idx === currentNode,
                                'tree-node--visited': visitedNodes.has(node.idx),
                                'tree-node--empty': !node.data
                            }"
                            @click="node.data && nodeNav(node.idx)"
                            :title="node.data ? (node.data.prompt || '').substring(0, 100) : 'Empty'"
                        >
                            <span class="tree-dot" :class="{ 'tree-dot--has-image': node.data?.image }"></span>
                            <span class="tree-label">
                                {{ node.data ? (node.data.prompt || 'Node ' + node.idx).substring(0, 30) : '—' }}
                            </span>
                            <span class="tree-depth">d{{ node.data?.depth || 0 }}</span>
                        </div>
                        <ul v-if="node.children.length" class="tree-children">
                            <li v-for="child in node.children" :key="child.idx">
                                <div
                                    class="tree-node tree-node--child"
                                    :class="{
                                        'tree-node--current': child.idx === currentNode,
                                        'tree-node--visited': visitedNodes.has(child.idx),
                                        'tree-node--empty': !child.data
                                    }"
                                    @click="child.data && nodeNav(child.idx)"
                                    :title="child.data ? (child.data.prompt || '').substring(0, 100) : 'Empty'"
                                >
                                    <span class="tree-dot" :class="{ 'tree-dot--has-image': child.data?.image }"></span>
                                    <span class="tree-label">
                                        {{ child.data ? (child.data.prompt || 'Node ' + child.idx).substring(0, 25) : '—' }}
                                    </span>
                                    <span class="tree-depth">d{{ child.data?.depth || 0 }}</span>
                                </div>
                            </li>
                        </ul>
                    </li>
                </ul>
            </div>
        </div>

        <!-- Main Story Content -->
        <div class="story-main">
            <div class="path-info" v-if="currentNodeData && currentNodeData.pathToRoot?.length">
                <span class="path-label">Path:</span>
                <span class="path-breadcrumbs">
                    <span v-for="(pid, pidx) in currentNodeData.pathToRoot" :key="pidx" class="crumb-link" @click="nodeNav(pid)">
                        Node {{ pid }}
                    </span>
                    <span class="crumb-arrow">→</span>
                    <span class="crumb-current">Node {{ currentNode }}</span>
                </span>
                <span class="depth-badge">Depth {{ currentNodeData.depth }}</span>
            </div>

            <div class="title-row">
                <input
                    v-model="story.title"
                    @input="handleTitleChange"
                    :class="{ 'edited': titleChanged }"
                    class="title-input"
                    aria-label="Story title"
                    placeholder="Story title"
                >
                <button v-if="titleChanged" @click="saveTitle" class="btn btn-primary btn-sm" :disabled="!story.title.trim()">
                    Save
                </button>
            </div>

            <div class="prompt-section">
                <div v-if="!editingPrompt" class="prompt-display">
                    <p class="prompt-text">{{ story.nodes[currentNode]?.prompt || 'Loading node...' }}</p>
                    <button @click="toggleEditPrompt" class="btn-edit-prompt" title="Edit prompt">✎</button>
                </div>
                <div v-else class="prompt-edit">
                    <textarea v-model="editPromptBuffer" class="prompt-textarea" rows="3"></textarea>
                    <div class="prompt-edit-actions">
                        <button @click="savePrompt" class="btn btn-primary btn-sm">Save</button>
                        <button @click="cancelEditPrompt" class="btn btn-ghost btn-sm">Cancel</button>
                    </div>
                </div>
            </div>

            <div v-if="loading" class="text-muted" style="padding: var(--space-md); text-align: center;">Generating image…</div>

            <div v-if="story.nodes[currentNode]?.image" class="image-wrapper">
                <img :src="story.nodes[currentNode].image" alt="Story illustration">
                <button @click="regenerateImage" :disabled="loading" class="img-regen-btn" title="Regenerate image">
                    🔄
                </button>
            </div>

            <div v-if="error" class="error-message">{{ error }}</div>

            <div class="choices-section">
                <ChoiceButton
                    v-for="(choice, index) in story.nodes[currentNode]?.choices"
                    :key="index"
                    @click="handleChoice(choice.nextNodeId)"
                >
                    {{ choice.text }}
                </ChoiceButton>
                <button
                    v-if="story.nodes[currentNode]?.choices?.length"
                    @click="regenerateChoices"
                    :disabled="isNewStory"
                    :title="regenerateButtonTitle"
                    class="choice-regen-btn"
                    :class="{ 'disabled': isNewStory }"
                >
                    🔄 Regenerate Choices
                    <span v-if="isNewStory" class="disabled-hint">(update title first)</span>
                </button>
            </div>

            <NavigationLinks />

            <button @click="confirmDelete" class="delete-btn">Delete Story</button>
        </div>

        <!-- Delete confirmation modal -->
        <div v-if="showDeleteConfirm" class="delete-modal">
            <div class="delete-modal-content">
                <h3>Delete Story?</h3>
                <p>Are you sure you want to delete "{{ story.title }}"? This cannot be undone.</p>
                <div class="delete-modal-actions">
                    <button @click="deleteStory" class="btn btn-danger">Delete</button>
                    <button @click="showDeleteConfirm = false" class="btn btn-ghost">Cancel</button>
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
            showTree: false,
            visitedNodes: new Set(),
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
        },
        treeNodes() {
            if (!this.story?.nodes) return [];
            const buildTree = (nodeIdx, depth) => {
                if (nodeIdx >= this.story.nodes.length) return null;
                const node = this.story.nodes[nodeIdx];
                const result = {
                    idx: nodeIdx,
                    data: node,
                    children: [],
                };
                if (node && depth < 10) {
                    const choices = node.choices || [];
                    for (const ch of choices) {
                        if (ch.nextNodeId !== undefined && ch.nextNodeId !== null) {
                            const child = buildTree(ch.nextNodeId, depth + 1);
                            if (child) result.children.push(child);
                        }
                    }
                }
                return result;
            };
            return [buildTree(0, 0)];
        },
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
                if (newNode !== undefined && newNode !== null) {
                    this.visitedNodes.add(newNode);
                }
                if (this.story?.nodes) {
                    if (!this.story.nodes[newNode]) {
                        await this.createNewNode(newNode);
                    } else if (!this.story.nodes[newNode].image) {
                        await this.generateAndSaveImage(newNode);
                    }
                }
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
        const nodeParam = parseInt(this.$route.query.node);
        if (!isNaN(nodeParam) && nodeParam >= 0) {
            this.currentNode = nodeParam;
        }
        this.visitedNodes.add(this.currentNode);
        this.fetchStory();
    },
};
</script>

<style scoped>
/* ── Layout ────────────────────────────── */
.story-state {
    padding: var(--space-3xl);
    flex-direction: column;
    gap: var(--space-md);
    min-height: 40vh;
}

.story-view {
    max-width: 720px;
    margin: 0 auto;
    padding: var(--space-lg);
}

.story-main {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
}

/* ── Tree Toggle & Panel ──────────────── */
.tree-toggle {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-xs) var(--space-md);
    margin-bottom: var(--space-md);
    font-size: var(--text-sm);
    color: var(--text-muted);
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all var(--transition-fast);
}
.tree-toggle:hover {
    color: var(--accent);
    border-color: var(--accent);
}

.tree-panel {
    margin-bottom: var(--space-lg);
    padding: var(--space-md);
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    max-height: 300px;
    overflow: auto;
}
.tree-title {
    font-size: var(--text-sm);
    font-weight: 700;
    color: var(--text-secondary);
    margin-bottom: var(--space-sm);
    text-transform: uppercase;
    letter-spacing: 0.05em;
}
.tree-root { list-style: none; padding: 0; margin: 0; }
.tree-children { list-style: none; padding-left: var(--space-xl); margin: 0; border-left: 1px dashed var(--border); }

.tree-node {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: 3px var(--space-xs);
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: var(--text-xs);
    transition: background var(--transition-fast);
}
.tree-node:hover { background: var(--bg-hover); }
.tree-node--current { background: var(--accent-soft); border: 1px solid var(--accent); font-weight: 700; }
.tree-node--visited { color: var(--text-primary); }
.tree-node--empty { color: var(--text-muted); opacity: 0.5; cursor: default; }
.tree-node--child { padding-left: var(--space-md); }

.tree-dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: var(--border);
    flex-shrink: 0;
}
.tree-dot--has-image { background: var(--accent); }
.tree-node--current .tree-dot { background: var(--accent); width: 10px; height: 10px; }

.tree-label {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.tree-depth {
    font-size: 10px;
    color: var(--text-muted);
    background: var(--bg-primary);
    padding: 1px 4px;
    border-radius: var(--radius-full);
}

/* ── Path Info ─────────────────────────── */
.path-info {
    font-size: var(--text-xs);
    color: var(--text-muted);
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    flex-wrap: wrap;
    padding: var(--space-sm) 0;
}
.path-label { font-weight: 600; }
.path-breadcrumbs { display: flex; align-items: center; gap: var(--space-xs); }
.crumb-link { color: var(--accent); cursor: pointer; font-weight: 500; }
.crumb-link:hover { text-decoration: underline; }
.crumb-arrow { color: var(--text-muted); margin: 0 2px; }
.crumb-current { color: var(--text-primary); font-weight: 700; }
.depth-badge {
    margin-left: auto;
    padding: 1px var(--space-sm);
    background: var(--bg-secondary);
    border-radius: var(--radius-full);
    font-size: var(--text-xs);
    color: var(--text-muted);
}

/* ── Title ─────────────────────────────── */
.title-row {
    display: flex;
    gap: var(--space-sm);
    align-items: center;
}
.title-input {
    flex: 1;
    padding: var(--space-sm) var(--space-md);
    font-size: var(--text-xl);
    font-weight: 700;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg-primary);
    color: var(--text-primary);
}
.title-input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.edited { border-color: var(--accent); }

/* ── Prompt ────────────────────────────── */
.prompt-section { /* spacing handled by story-main gap */ }
.prompt-display { display: flex; align-items: flex-start; gap: var(--space-sm); }
.prompt-text { flex: 1; font-size: var(--text-md); line-height: 1.65; color: var(--text-primary); margin: 0; }
.btn-edit-prompt {
    padding: 2px var(--space-sm);
    background: transparent;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text-muted);
    cursor: pointer;
    font-size: var(--text-sm);
    transition: color var(--transition-fast), border-color var(--transition-fast);
    flex-shrink: 0;
}
.btn-edit-prompt:hover { color: var(--accent); border-color: var(--accent); }
.prompt-edit { display: flex; flex-direction: column; gap: var(--space-sm); }
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
    min-height: 72px;
    font-family: var(--font-sans);
}
.prompt-textarea:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.prompt-edit-actions { display: flex; gap: var(--space-sm); justify-content: flex-end; }

/* ── Image ─────────────────────────────── */
.image-wrapper {
    position: relative;
    border-radius: var(--radius-lg);
    overflow: hidden;
    background: var(--bg-secondary);
}
.image-wrapper img {
    display: block;
    width: 100%;
    height: auto;
    max-height: 400px;
    object-fit: contain;
}
.img-regen-btn {
    position: absolute;
    top: var(--space-sm);
    right: var(--space-sm);
    padding: var(--space-xs) var(--space-sm);
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    cursor: pointer;
    font-size: var(--text-sm);
    opacity: 0.8;
    transition: opacity var(--transition-fast), border-color var(--transition-fast);
}
.img-regen-btn:hover { opacity: 1; border-color: var(--accent); }
.img-regen-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* ── Choices ───────────────────────────── */
.choices-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
}
.choice-regen-btn {
    align-self: center;
    margin-top: var(--space-sm);
    padding: var(--space-sm) var(--space-lg);
    background: var(--bg-secondary);
    border: 1px dashed var(--border-strong);
    border-radius: var(--radius-md);
    color: var(--text-muted);
    font-size: var(--text-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
}
.choice-regen-btn:hover:not(:disabled) {
    border-color: var(--accent);
    color: var(--accent);
    background: var(--accent-soft);
}
.choice-regen-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.disabled-hint { font-size: var(--text-xs); color: var(--text-muted); margin-left: var(--space-xs); }

/* ── Delete ────────────────────────────── */
.delete-btn {
    align-self: flex-end;
    padding: var(--space-xs) var(--space-md);
    background: transparent;
    border: 1px solid var(--danger);
    border-radius: var(--radius-sm);
    color: var(--danger);
    font-size: var(--text-xs);
    cursor: pointer;
    transition: all var(--transition-fast);
}
.delete-btn:hover { background: var(--danger); color: var(--text-inverse); }

/* ── Delete Modal ──────────────────────── */
.delete-modal {
    position: fixed; inset: 0;
    background: var(--bg-overlay);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: var(--z-modal-backdrop);
    padding: var(--space-lg);
}
.delete-modal-content {
    background: var(--bg-card);
    padding: var(--space-2xl);
    border-radius: var(--radius-lg);
    text-align: center;
    box-shadow: var(--shadow-xl);
    max-width: 420px;
    width: 100%;
}
.delete-modal-content h3 { margin-bottom: var(--space-md); }
.delete-modal-actions {
    margin-top: var(--space-lg);
    display: flex;
    gap: var(--space-sm);
    justify-content: center;
}

/* ── Shared ────────────────────────────── */
.error-message {
    color: var(--danger);
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-md);
    background: var(--danger-soft);
    border: 1px solid var(--danger);
    font-size: var(--text-sm);
}

.loading {
    padding: var(--space-md);
    color: var(--text-muted);
    font-style: italic;
}
</style>