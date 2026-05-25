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
            <span v-if="showTree">✕ Hide Map</span>
            <span v-else>🌳 Show Story Map</span>
        </button>

        <!-- Story Tree Panel with NodeGraph -->
        <div v-if="showTree" class="tree-panel-outer">
            <div class="tree-toolbar-inner">
                <div class="tree-title">Story Branches</div>
                <div class="tree-view-toggle">
                    <button 
                        @click="treeViewMode = 'graph'" 
                        class="btn btn-xs" 
                        :class="treeViewMode === 'graph' ? 'btn-primary' : 'btn-ghost'"
                    >🌳 Web Graph</button>
                    <button 
                        @click="treeViewMode = 'list'" 
                        class="btn btn-xs" 
                        :class="treeViewMode === 'list' ? 'btn-primary' : 'btn-ghost'"
                    >📋 List View</button>
                </div>
            </div>

            <!-- Render NodeGraph if graph mode -->
            <NodeGraph 
                v-if="treeViewMode === 'graph'" 
                :nodes="story.nodes" 
                :currentNode="currentNode" 
                :visitedNodes="visitedNodes"
                @select-node="nodeNav"
            />

            <!-- Render standard list if list mode -->
            <div v-else class="tree-content">
                <div v-for="line in flattenTree" :key="line.idx" class="tree-node" :class="{
                    'tree-node--current': line.idx === currentNode,
                    'tree-node--visited': visitedNodes.has(line.idx),
                    'tree-node--empty': !line.data
                }"
                    :style="{ paddingLeft: (line.depth * 20 + 8) + 'px' }"
                    :title="line.data ? (line.data.prompt || '').substring(0, 100) : 'Empty'"
                    @click="line.data && nodeNav(line.idx)"
                >
                    <span class="tree-indent">
                        <span v-if="line.depth > 0" class="tree-line"></span>
                        <span v-if="line.hasMoreSiblings" class="tree-branch"></span>
                    </span>
                    <span class="tree-dot" :class="{ 'tree-dot--has-image': line.data?.image }"></span>
                    <span class="tree-label">
                        {{ line.data ? (line.data.prompt || 'Node ' + line.idx).substring(0, 35) : '—' }}
                    </span>
                    <span class="tree-depth">d{{ line.depth }}</span>
                </div>
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
                <h1 v-if="!isOwner" class="story-title-static">{{ story.title }}</h1>
                <input
                    v-else
                    v-model="story.title"
                    @input="handleTitleChange"
                    :class="{ 'edited': titleChanged }"
                    class="title-input"
                    aria-label="Story title"
                    placeholder="Story title"
                >
                <button v-if="isOwner && titleChanged" @click="saveTitle" class="btn btn-primary btn-sm" :disabled="!story.title.trim()">
                    Save
                </button>
            </div>

            <!-- Publish Control Row -->
            <div v-if="isOwner" class="publish-control-row">
                <span class="badge" :class="story.isPublished ? 'badge-published' : 'badge-draft'">
                    {{ story.isPublished ? 'Published' : 'Draft' }}
                </span>
                <button @click="togglePublishStatus" class="btn btn-sm btn-ghost" :disabled="publishing">
                    {{ story.isPublished ? 'Revert to Draft' : 'Publish Story' }}
                </button>
            </div>

            <div class="prompt-section">
                <div v-if="!editingPrompt" class="prompt-display">
                    <p class="prompt-text">{{ story.nodes[currentNode]?.prompt || 'Loading node...' }}</p>
                    <button v-if="isOwner" @click="toggleEditPrompt" class="btn-edit-prompt" title="Edit prompt">✎</button>
                </div>
                <div v-else class="prompt-edit">
                    <textarea v-model="editPromptBuffer" class="prompt-textarea" rows="3"></textarea>
                    <div class="prompt-edit-actions">
                        <button @click="savePrompt" class="btn btn-primary btn-sm">Save</button>
                        <button @click="cancelEditPrompt" class="btn btn-ghost btn-sm">Cancel</button>
                    </div>
                </div>
            </div>

            <!-- Detailed AI Operations Loading Console -->
            <div v-if="aiProgressActive" class="ai-console card">
                <div class="console-header">
                    <span class="console-dot pulse"></span>
                    <span class="console-title">{{ aiProgressTitle }}</span>
                </div>
                <div class="console-body">
                    <div 
                        v-for="(step, idx) in aiProgressSteps" 
                        :key="idx" 
                        class="console-line"
                        :class="{ 
                            'line-done': idx < aiProgressStepIndex, 
                            'line-active': idx === aiProgressStepIndex,
                            'line-pending': idx > aiProgressStepIndex 
                        }"
                    >
                        <span class="line-status">
                            {{ idx < aiProgressStepIndex ? '✓' : idx === aiProgressStepIndex ? '●' : '○' }}
                        </span>
                        <span class="line-text">{{ step }}</span>
                    </div>
                </div>
            </div>

            <div v-if="story.nodes[currentNode]?.image" class="image-wrapper">
                <img :src="story.nodes[currentNode].image" alt="Story illustration">
                <div v-if="isOwner" class="image-overlay-actions">
                    <button @click="triggerImageUpload" :disabled="loading" class="img-overlay-btn" title="Upload Custom Cover">
                        📤 Upload Custom
                    </button>
                    <button @click="regenerateImage" :disabled="loading" class="img-overlay-btn" title="Regenerate Image with AI">
                        🔄 AI Regen
                    </button>
                </div>
                <!-- Hidden file input -->
                <input 
                    type="file" 
                    ref="fileInput" 
                    @change="handleImageUpload" 
                    style="display:none;" 
                    accept="image/*"
                >
            </div>

            <!-- AI Art Director Override settings -->
            <div v-if="isOwner && story.nodes[currentNode]" class="art-director-section card">
                <div class="art-director-header" @click="toggleVisualPrompt">
                    <span>🎨 AI Art Director Custom Visual Style</span>
                    <span class="toggle-icon">{{ editingVisualPrompt ? '▼' : '▶' }}</span>
                </div>
                <div v-if="editingVisualPrompt" class="art-director-body">
                    <p class="text-muted text-xs mb-sm" style="margin-bottom: var(--space-xs);">
                        Define a custom visual prompt for this node. If defined, the AI will use this instead of the text prompt.
                    </p>
                    <div class="visual-prompt-form">
                        <textarea 
                            v-model="editVisualPromptBuffer" 
                            class="prompt-textarea text-sm"
                            style="font-size: var(--text-sm); min-height: 48px;"
                            placeholder="e.g. A digital fantasy painting of a glowing mystical path, highly detailed, Ghibli style, volumetric light..."
                            rows="2"
                        ></textarea>
                        <div class="visual-prompt-actions">
                            <button @click="saveVisualPrompt" class="btn btn-primary btn-xs mt-xs" style="margin-top: 4px;">
                                Save Style
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div v-if="error" class="error-message">{{ error }}</div>

            <div class="choices-section">
                <!-- Editable choice rows if owner in editing mode -->
                <div v-if="isOwner && choiceEditingMode" class="choices-list-editor">
                    <div v-for="(choice, index) in story.nodes[currentNode]?.choices" :key="index" class="choice-edit-row">
                        <input 
                            v-model="choice.text" 
                            class="choice-edit-input"
                            @change="saveChoiceText(index, choice.text)"
                            placeholder="Choice text..."
                            aria-label="Edit choice text"
                        />
                        <button class="btn-icon btn-danger" @click="deleteChoice(index)" title="Delete choice and prune branch">
                            🗑️
                        </button>
                    </div>
                    
                    <!-- Add Custom Choice Row -->
                    <div class="choice-add-row">
                        <input 
                            v-model="newChoiceText" 
                            class="choice-add-input" 
                            placeholder="Add your own custom choice..."
                            @keyup.enter="addCustomChoice"
                            aria-label="Add custom choice text"
                        />
                        <button class="btn btn-primary btn-sm" @click="addCustomChoice" :disabled="!newChoiceText.trim()">
                            ➕ Add
                        </button>
                    </div>
                </div>

                <!-- Standard choice links if not in editing mode -->
                <div v-else class="choices-display-list">
                    <ChoiceButton
                        v-for="(choice, index) in story.nodes[currentNode]?.choices"
                        :key="index"
                        @click="handleChoice(choice.nextNodeId)"
                    >
                        {{ choice.text }}
                    </ChoiceButton>
                </div>

                <!-- Owner choice management options -->
                <div v-if="isOwner" class="choices-editor-actions">
                    <button @click="choiceEditingMode = !choiceEditingMode" class="btn btn-sm" :class="choiceEditingMode ? 'btn-secondary' : 'btn-ghost'">
                        {{ choiceEditingMode ? '✓ Done Editing' : '🛠️ Edit Choices' }}
                    </button>
                    <button
                        v-if="!choiceEditingMode && story.nodes[currentNode]?.choices?.length"
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
            </div>

            <NavigationLinks />

            <button v-if="isOwner" @click="confirmDelete" class="delete-btn">Delete Story</button>
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
import { useAuthStore } from '@/stores/useAuth.js'
import { apiFetch } from '@/utils/api.js'
import ChoiceButton from './ChoiceButton.vue';
import NavigationLinks from './NavigationLinks.vue';
import NodeGraph from './NodeGraph.vue';

export default {
    name: 'StoryDisplay',
    components: {
        ChoiceButton,
        NavigationLinks,
        NodeGraph
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
            treeViewMode: 'graph', // 'graph' or 'list'
            visitedNodes: new Set(),
            choiceEditingMode: false,
            newChoiceText: '',
            publishing: false,

            // AI Art Director Visual Override
            editingVisualPrompt: false,
            editVisualPromptBuffer: '',

            // AI loading console log checklist
            aiProgressActive: false,
            aiProgressTitle: 'Running operations...',
            aiProgressSteps: [],
            aiProgressStepIndex: 0
        };
    },
    computed: {
        currentNodeData() {
            return this.story?.nodes[this.currentNode];
        },
        isOwner() {
            const auth = useAuthStore();
            return auth.isLoggedIn && this.story && this.story.userId === auth.user?._id;
        },
        isNewStory() {
            return this.story?.title === "New Story";
        },
        regenerateButtonTitle() {
            return this.isNewStory
                ? "Please update the story title from 'New Story' to enable choice regeneration"
                : "Generate new choices for this node";
        },
        flattenTree() {
            if (!this.story?.nodes) return [];
            const result = [];
            const walk = (nodeIdx, depth, parentHasMoreSiblings) => {
                if (nodeIdx >= this.story.nodes.length) return;
                const node = this.story.nodes[nodeIdx];
                const choices = node ? (node.choices || []) : [];
                const validChildren = choices.filter(c => c.nextNodeId !== undefined && c.nextNodeId !== null);
                result.push({
                    idx: nodeIdx,
                    data: node,
                    depth,
                    hasMoreSiblings: parentHasMoreSiblings,
                });
                if (node && depth < 15) {
                    for (let i = 0; i < validChildren.length; i++) {
                        const ch = validChildren[i];
                        walk(ch.nextNodeId, depth + 1, i < validChildren.length - 1);
                    }
                }
            };
            walk(0, 0, false);
            return result;
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

                    // Save reader bookmark progress if user is logged in
                    const auth = useAuthStore();
                    if (auth.isLoggedIn) {
                        try {
                            await apiFetch(`${this.apiBaseUrl}/api/users/progress`, {
                                method: 'POST',
                                body: JSON.stringify({
                                    storyId: this.$route.params.id,
                                    nodeId: newNode
                                })
                            });
                        } catch (e) {
                            console.error('Failed to save progress bookmark:', e);
                        }
                    }
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
                const response = await apiFetch(`${this.apiBaseUrl}/api/stories/${storyId}`);

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

                // Restore progress bookmark if logged in and not overridden by query
                let progressNode = 0;
                const auth = useAuthStore();
                if (auth.isLoggedIn) {
                    try {
                        const progRes = await apiFetch(`${this.apiBaseUrl}/api/users/progress/${storyId}`);
                        if (progRes.ok) {
                            const progData = await progRes.json();
                            if (progData.currentNode !== undefined && progData.currentNode >= 0 && this.story.nodes[progData.currentNode]) {
                                progressNode = progData.currentNode;
                            }
                        }
                    } catch (e) {
                        console.error('Failed to restore progress bookmark:', e);
                    }
                }

                const nodeParam = parseInt(this.$route.query.node);
                const startNode = (!isNaN(nodeParam) && nodeParam >= 0 && this.story.nodes[nodeParam]) 
                    ? nodeParam 
                    : (progressNode > 0 ? progressNode : 0);
                
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
                const res = await apiFetch(`${this.apiBaseUrl}/api/stories/${storyId}/node/${nodeIndex}`, {
                    method: 'PUT',
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
                const nextNodeIndex = (targetNodeIndex !== undefined && targetNodeIndex >= 0)
                    ? targetNodeIndex
                    : this.story.nodes.length;

                // Pad sparse array
                while (this.story.nodes.length <= nextNodeIndex) {
                    this.story.nodes.push(null);
                }

                const response = await apiFetch(`${this.apiBaseUrl}/api/stories/${this.$route.params.id}/node`, {
                    method: 'PUT',
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
                    this.story.nodes[nextNodeIndex] = result.node;
                    this.story.lastNodeId = nextNodeIndex;
                    return result.node;
                }
            } catch (error) {
                console.error('Error creating new node:', error);
                throw error;
            }
        },
        async generateChoices(nodeIndex) {
            try {
                this.aiProgressActive = true;
                this.aiProgressTitle = "Generating Branches...";
                this.aiProgressSteps = [
                    "Reading scene prompt content...",
                    "Analyzing branching directions...",
                    "Querying Gemini AI for choices...",
                    "Reserving future narrative paths!"
                ];
                this.aiProgressStepIndex = 0;

                this.aiProgressStepIndex = 1;
                this.aiProgressStepIndex = 2;
                const response = await apiFetch(`${this.apiBaseUrl}/api/stories/${this.$route.params.id}/node/${nodeIndex}/choices`, {
                    method: 'POST',
                    body: JSON.stringify({
                        prompt: this.story.nodes[nodeIndex].prompt
                    })
                });

                this.aiProgressStepIndex = 3;
                if (!response.ok) {
                    throw new Error('Failed to generate choices');
                }

                const result = await response.json();
                this.story.nodes[nodeIndex].choices = result.choices;
                this.aiProgressStepIndex = 4;
            } catch (error) {
                console.error('Error generating choices:', error);
            } finally {
                setTimeout(() => {
                    this.aiProgressActive = false;
                }, 1000);
            }
        },
        async generateAndSaveImage(nodeIndex) {
            if (this.loading) return;
            this.loading = true;
            this.error = null;

            this.aiProgressActive = true;
            this.aiProgressTitle = "Generating Artwork...";
            this.aiProgressSteps = [
                "Analyzing narrative details from current scene...",
                "Drafting visual composition for fal.ai Flux...",
                "Submitting artwork task to rendering queue...",
                "Generating high fidelity pixels (fal.ai Schnell)...",
                "Downloading completed illustration to server...",
                "Linking visual canvas to narrative story node!"
            ];
            this.aiProgressStepIndex = 0;

            try {
                const currentNode = this.story.nodes[nodeIndex];
                this.aiProgressStepIndex = 1;

                // Check custom visual prompt override first
                let promptSource = currentNode.prompt;
                if (currentNode.visualPrompt && currentNode.visualPrompt.trim()) {
                    promptSource = currentNode.visualPrompt.trim();
                } else {
                    const choices = currentNode.choices?.map(c => c.text).join(' or ') || '';
                    promptSource = `${currentNode.prompt} ${choices ? `With choices: ${choices}` : ''}`;
                }

                this.aiProgressStepIndex = 2;
                const response = await apiFetch(`${this.apiBaseUrl}/api/generate-image`, {
                    method: 'POST',
                    body: JSON.stringify({
                        prompt: promptSource,
                        storyId: this.$route.params.id,
                        nodeIndex: nodeIndex
                    })
                });

                if (!response.ok) throw new Error(`Image generation failed: ${response.statusText}`);

                this.aiProgressStepIndex = 3;
                const data = await response.json();

                this.aiProgressStepIndex = 4;
                const saveResponse = await apiFetch(`${this.apiBaseUrl}/api/stories/${this.$route.params.id}/node/${nodeIndex}/image`, {
                    method: 'PUT',
                    body: JSON.stringify({ image: data.imageUrl })
                });

                if (!saveResponse.ok) throw new Error('Failed to save image');

                this.aiProgressStepIndex = 5;
                this.story.nodes[nodeIndex].image = data.imageUrl;
                this.aiProgressStepIndex = 6;
            } catch (error) {
                console.error('Error:', error);
                this.error = error.message;
            } finally {
                this.loading = false;
                setTimeout(() => {
                    this.aiProgressActive = false;
                }, 1000);
            }
        },
        async handleChoice(nodeIndex) {
            try {
                if (this.loading) return;
                this.loading = true;

                if (nodeIndex === undefined || nodeIndex === null || nodeIndex < 0) {
                    throw new Error('Invalid choice');
                }

                if (!this.story.nodes[nodeIndex]) {
                    const choice = this.story?.nodes[this.currentNode]?.choices?.find(c => c.nextNodeId === nodeIndex);
                    await this.createNewNode(this.currentNode, choice ? choice.text : 'Continue...', nodeIndex);
                }

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

                const response = await apiFetch(
                    `${this.apiBaseUrl}/api/stories/${this.$route.params.id}/node/${this.currentNode}/choices`,
                    {
                        method: 'POST',
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

                this.story.nodes[this.currentNode].choices = data.choices;
            } catch (error) {
                console.error('Error regenerating choices:', error);
                this.error = error.message;
            } finally {
                this.regeneratingChoices = false;
            }
        },
        async updateStoryTitle() {
            try {
                if (!this.story?.title || this.story.title.trim() === '') {
                    throw new Error('Story title cannot be empty');
                }

                const response = await apiFetch(`${this.apiBaseUrl}/api/stories/${this.$route.params.id}`, {
                    method: 'PUT',
                    body: JSON.stringify({
                        title: this.story.title,
                        nodes: this.story.nodes,
                        lastNodeId: this.story.lastNodeId
                    })
                });

                const data = await response.json();
                if (!response.ok) {
                    throw new Error(data.error || 'Failed to update story title');
                }

                if (data.success) {
                    this.error = null;
                }
            } catch (error) {
                console.error('Error updating story title:', error);
                this.error = error.message;
            }
        },
        confirmDelete() {
            this.showDeleteConfirm = true;
        },
        async deleteStory() {
            try {
                const response = await apiFetch(`${this.apiBaseUrl}/api/stories/${this.$route.params.id}`, {
                    method: 'DELETE'
                });

                if (!response.ok) {
                    throw new Error('Failed to delete story');
                }

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
            const response = await apiFetch(`${this.apiBaseUrl}/api/stories/${storyId}/title`, {
                method: 'PUT',
                body: JSON.stringify({ title: newTitle })
            });

            const data = await response.json();
            if (data.success) {
                this.story.title = data.title;
                this.story.nodes[0].prompt = data.newPrompt;
            }
        },
        async togglePublishStatus() {
            if (this.publishing || !this.story) return;
            this.publishing = true;
            this.error = null;
            try {
                const response = await apiFetch(`${this.apiBaseUrl}/api/stories/${this.$route.params.id}/publish`, {
                    method: 'PUT'
                });

                const data = await response.json();
                if (!response.ok) throw new Error(data.error || 'Failed to toggle publish status');

                if (data.success) {
                    this.story.isPublished = data.isPublished;
                    this.toast.addToast('success', this.story.isPublished ? 'Story published!' : 'Story reverted to draft.');
                }
            } catch (error) {
                console.error('Error toggling publish status:', error);
                this.error = error.message;
                this.toast.addToast('error', 'Failed to update publish status');
            } finally {
                this.publishing = false;
            }
        },
        async saveChoiceText(choiceIndex, text) {
            if (!text || !text.trim()) return;
            try {
                const response = await apiFetch(
                    `${this.apiBaseUrl}/api/stories/${this.$route.params.id}/node/${this.currentNode}/choice/${choiceIndex}`,
                    {
                        method: 'PUT',
                        body: JSON.stringify({ text: text.trim() })
                    }
                );

                const data = await response.json();
                if (!response.ok) throw new Error(data.error || 'Failed to edit choice');

                if (data.success) {
                    this.story.nodes[this.currentNode].choices = data.choices;
                    this.toast.addToast('success', 'Choice saved');
                }
            } catch (error) {
                console.error('Error editing choice:', error);
                this.toast.addToast('error', 'Failed to save choice');
            }
        },
        async deleteChoice(choiceIndex) {
            if (!confirm("Are you sure you want to delete this choice? This will prune this choice and all downstream branching nodes!")) return;
            try {
                const response = await apiFetch(
                    `${this.apiBaseUrl}/api/stories/${this.$route.params.id}/node/${this.currentNode}/choice/${choiceIndex}`,
                    {
                        method: 'DELETE'
                    }
                );

                const data = await response.json();
                if (!response.ok) throw new Error(data.error || 'Failed to delete choice');

                if (data.success) {
                    this.story.nodes = data.nodes;
                    this.toast.addToast('success', 'Choice deleted and branch pruned');
                }
            } catch (error) {
                console.error('Error deleting choice:', error);
                this.toast.addToast('error', 'Failed to delete choice');
            }
        },
        async addCustomChoice() {
            if (!this.newChoiceText || !this.newChoiceText.trim()) return;
            try {
                const response = await apiFetch(
                    `${this.apiBaseUrl}/api/stories/${this.$route.params.id}/node/${this.currentNode}/choice`,
                    {
                        method: 'POST',
                        body: JSON.stringify({ text: this.newChoiceText.trim() })
                    }
                );

                const data = await response.json();
                if (!response.ok) throw new Error(data.error || 'Failed to add choice');

                if (data.success) {
                    this.story.nodes = data.nodes;
                    this.newChoiceText = '';
                    this.toast.addToast('success', 'Custom choice added');
                }
            } catch (error) {
                console.error('Error adding choice:', error);
                this.toast.addToast('error', 'Failed to add choice');
            }
        },
        // Upload Custom cover/illustration methods
        triggerImageUpload() {
            this.$refs.fileInput.click();
        },
        async handleImageUpload(e) {
            const file = e.target.files[0];
            if (!file) return;
            if (!file.type.startsWith('image/')) {
                this.toast.addToast('error', 'Please select a valid image file');
                return;
            }
            
            this.loading = true;
            this.error = null;
            this.aiProgressActive = true;
            this.aiProgressTitle = "Uploading Custom Artwork...";
            this.aiProgressSteps = [
                "Reading selected image file...",
                "Encoding image to base64 format...",
                "Uploading media content to storybook server...",
                "Saving file allocation on disk...",
                "Updating node cover illustration!"
            ];
            this.aiProgressStepIndex = 0;
            
            try {
                this.aiProgressStepIndex = 1;
                const reader = new FileReader();
                const base64Promise = new Promise((resolve, reject) => {
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = error => reject(error);
                    reader.readAsDataURL(file);
                });
                
                const base64Data = await base64Promise;
                this.aiProgressStepIndex = 2;
                
                const nodeIndex = this.currentNode;
                const uploadResponse = await apiFetch(`${this.apiBaseUrl}/api/stories/${this.$route.params.id}/node/${nodeIndex}/image`, {
                    method: 'PUT',
                    body: JSON.stringify({ image: base64Data })
                });
                
                this.aiProgressStepIndex = 3;
                if (!uploadResponse.ok) throw new Error('Failed to upload image file');
                
                const data = await uploadResponse.json();
                this.aiProgressStepIndex = 4;
                
                this.story.nodes[nodeIndex].image = data.imageUrl;
                this.aiProgressStepIndex = 5;
                this.toast.addToast('success', 'Artwork uploaded successfully!');
            } catch (error) {
                console.error('Image upload failed:', error);
                this.error = error.message || 'Failed to upload artwork';
                this.toast.addToast('error', 'Failed to upload artwork');
            } finally {
                this.loading = false;
                setTimeout(() => {
                    this.aiProgressActive = false;
                }, 1000);
            }
        },
        // AI Art Director methods
        toggleVisualPrompt() {
            this.editingVisualPrompt = !this.editingVisualPrompt;
            if (this.editingVisualPrompt) {
                const node = this.story?.nodes[this.currentNode];
                this.editVisualPromptBuffer = node?.visualPrompt || '';
            }
        },
        async saveVisualPrompt() {
            const node = this.story?.nodes[this.currentNode];
            if (!node) return;
            
            try {
                const updatedNode = {
                    ...node,
                    visualPrompt: this.editVisualPromptBuffer.trim()
                };
                
                const response = await apiFetch(`${this.apiBaseUrl}/api/stories/${this.$route.params.id}/node/${this.currentNode}`, {
                    method: 'PUT',
                    body: JSON.stringify(updatedNode)
                });
                
                if (!response.ok) throw new Error('Failed to save visual style');
                
                this.story.nodes[this.currentNode].visualPrompt = this.editVisualPromptBuffer.trim();
                this.editingVisualPrompt = false;
                this.toast.addToast('success', 'Visual style overrides saved!');
            } catch (error) {
                console.error('Failed to save visual style:', error);
                this.toast.addToast('error', 'Failed to save visual style');
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

.tree-content {
    font-size: var(--text-xs);
}
.tree-node--child { opacity: 1; }

.tree-indent {
    position: relative;
    width: 12px;
    flex-shrink: 0;
}
.tree-line {
    position: absolute;
    left: 4px;
    top: 0;
    bottom: 0;
    width: 1px;
    background: var(--border);
}
.tree-branch {
    position: absolute;
    left: 4px;
    top: 50%;
    width: 8px;
    height: 1px;
    background: var(--border);
}

.tree-node {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: 2px var(--space-xs);
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: var(--text-xs);
    transition: background var(--transition-fast);
    white-space: nowrap;
}
.tree-node:hover { background: var(--bg-hover); }
.tree-node--current { background: var(--accent-soft); border: 1px solid var(--accent); font-weight: 700; }
.tree-node--visited { color: var(--text-primary); }
.tree-node--empty { color: var(--text-muted); opacity: 0.5; cursor: default; }

.tree-dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: var(--border);
    flex-shrink: 0;
}
.tree-dot--has-image { background: var(--accent); }
.tree-node--current .tree-dot { background: var(--accent); width: 8px; height: 8px; }

.tree-label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 11px;
}
.tree-depth {
    font-size: 10px;
    color: var(--text-muted);
    background: var(--bg-primary);
    padding: 1px 4px;
    border-radius: var(--radius-full);
    flex-shrink: 0;
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
.story-title-static {
    font-size: var(--text-2xl);
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
    flex: 1;
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

/* ── Publish Control ───────────────────── */
.publish-control-row {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-top: calc(-1 * var(--space-xs));
    margin-bottom: var(--space-xs);
}
.badge-published {
    background: var(--accent-soft);
    color: var(--accent);
}
.badge-draft {
    background: var(--bg-hover);
    color: var(--text-muted);
    border: 1px solid var(--border);
}

/* ── Choices Editor ────────────────────── */
.choices-list-editor {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    background: var(--bg-secondary);
    padding: var(--space-md);
    border-radius: var(--radius-lg);
    border: 1px solid var(--border);
}
.choice-edit-row, .choice-add-row {
    display: flex;
    gap: var(--space-xs);
    align-items: center;
}
.choice-edit-input, .choice-add-input {
    flex: 1;
    padding: var(--space-sm) var(--space-md);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: var(--text-sm);
    transition: border-color var(--transition-fast);
}
.choice-edit-input:focus, .choice-add-input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
}
.choices-editor-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: var(--space-md);
}
.btn-icon {
    background: transparent;
    border: none;
    cursor: pointer;
    padding: var(--space-sm);
    font-size: var(--text-base);
    border-radius: var(--radius-md);
    transition: background var(--transition-fast);
}
.btn-icon:hover {
    background: var(--bg-hover);
}
.btn-icon.btn-danger:hover {
    background: var(--danger-soft);
}

/* ── NodeGraph & Map Panel ────────────── */
.tree-panel-outer {
    margin-bottom: var(--space-lg);
    padding: var(--space-md);
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
}
.tree-toolbar-inner {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px dashed var(--border);
    padding-bottom: var(--space-xs);
}
.tree-view-toggle {
    display: flex;
    gap: var(--space-xs);
}
.btn-xs {
    padding: 2px 6px;
    font-size: 10px;
    font-weight: 700;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    cursor: pointer;
    background: transparent;
    color: var(--text-secondary);
}
.btn-xs.btn-primary {
    background: var(--accent-soft);
    border-color: var(--accent);
    color: var(--accent);
}

/* ── AI Loading steps Console ─────────── */
.ai-console {
    background: #1e1e1e !important;
    border: 1px solid #333 !important;
    padding: var(--space-md);
    font-family: var(--font-mono);
    color: #e0e0e0;
    border-radius: var(--radius-md);
    margin-bottom: var(--space-md);
    box-shadow: var(--shadow-md);
}
.console-header {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    border-bottom: 1px solid #333;
    padding-bottom: var(--space-xs);
    margin-bottom: var(--space-sm);
}
.console-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent);
    display: inline-block;
}
.console-dot.pulse {
    animation: blink 1.2s infinite;
}
.console-title {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.05em;
    color: var(--accent);
}
.console-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    font-size: 10px;
}
.console-line {
    display: flex;
    gap: var(--space-sm);
    align-items: center;
    transition: opacity var(--transition-fast);
}
.console-line.line-done {
    color: var(--accent);
    opacity: 0.9;
}
.console-line.line-active {
    color: #ffffff;
    font-weight: 700;
    opacity: 1;
}
.console-line.line-pending {
    color: #555555;
    opacity: 0.6;
}
.line-status {
    width: 12px;
    text-align: center;
}
.line-text {
    flex: 1;
}

/* ── Custom Artwork Uploads ───────────── */
.image-wrapper {
    position: relative;
}
.image-overlay-actions {
    position: absolute;
    bottom: var(--space-sm);
    right: var(--space-sm);
    display: flex;
    gap: var(--space-xs);
}
.img-overlay-btn {
    padding: var(--space-xs) var(--space-sm);
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    cursor: pointer;
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--text-secondary);
    box-shadow: var(--shadow-sm);
    opacity: 0.85;
    transition: all var(--transition-fast);
}
.img-overlay-btn:hover {
    opacity: 1;
    border-color: var(--accent);
    color: var(--accent);
    transform: translateY(-1px);
}
.img-overlay-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

/* ── AI Art Director Controls ────────── */
.art-director-section {
    padding: var(--space-sm) var(--space-md);
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    margin-top: var(--space-xs);
    margin-bottom: var(--space-sm);
    transition: all var(--transition-fast);
}
.art-director-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 11px;
    font-weight: 700;
    color: var(--text-secondary);
    cursor: pointer;
    user-select: none;
    text-transform: uppercase;
    letter-spacing: 0.05em;
}
.art-director-header:hover {
    color: var(--accent);
}
.toggle-icon {
    font-size: 9px;
    color: var(--text-muted);
}
.art-director-body {
    margin-top: var(--space-sm);
    border-top: 1px dashed var(--border-light);
    padding-top: var(--space-sm);
}
.visual-prompt-form {
    display: flex;
    flex-direction: column;
}
.visual-prompt-actions {
    display: flex;
    justify-content: flex-end;
}
.btn-xs.mt-xs {
    margin-top: 4px;
}

@keyframes blink {
    0%, 100% { opacity: 0.3; }
    50% { opacity: 1; }
}
</style>