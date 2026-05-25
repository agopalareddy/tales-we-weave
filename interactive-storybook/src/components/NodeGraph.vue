<template>
  <div class="node-graph-container">
    <div class="graph-toolbar">
      <span class="graph-title">🌳 Interactive Story Web</span>
      <div class="zoom-controls">
        <button @click="resetView" class="btn btn-sm btn-ghost" title="Reset View">🎯 Reset</button>
        <button @click="zoomIn" class="btn btn-sm btn-ghost" title="Zoom In">➕</button>
        <button @click="zoomOut" class="btn btn-sm btn-ghost" title="Zoom Out">➖</button>
      </div>
    </div>

    <svg 
      class="graph-svg" 
      ref="svgCanvas"
      @mousedown="startPan"
      @mousemove="pan"
      @mouseup="endPan"
      @mouseleave="endPan"
      @wheel.prevent="handleWheel"
      aria-label="Interactive Storyboard Node Graph"
    >
      <!-- Definitions for markers and glows -->
      <defs>
        <!-- Arrowhead markers -->
        <marker 
          id="arrow" 
          viewBox="0 0 10 10" 
          refX="18" 
          refY="5" 
          markerWidth="6" 
          markerHeight="6" 
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--border)" />
        </marker>
        <marker 
          id="arrow-active" 
          viewBox="0 0 10 10" 
          refX="18" 
          refY="5" 
          markerWidth="6" 
          markerHeight="6" 
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent)" />
        </marker>
        
        <!-- Drop Shadow Filters -->
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.1" />
        </filter>
        <filter id="accent-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="var(--accent)" flood-opacity="0.4" />
        </filter>
      </defs>

      <!-- Grid Background (optional for aesthetic grounding) -->
      <g :transform="'translate(' + panX + ',' + panY + ') scale(' + zoomScale + ')'">
        <!-- Connecting Edges (Bezier paths) -->
        <path 
          v-for="edge in layoutEdges" 
          :key="edge.id" 
          :d="edge.path" 
          class="graph-edge"
          :class="{ 
            'edge-visited': visitedNodes.has(edge.source) && visitedNodes.has(edge.target),
            'edge-active': edge.target === currentNode || (edge.source === currentNode && visitedNodes.has(edge.target))
          }"
          :marker-end="edge.target === currentNode ? 'url(#arrow-active)' : 'url(#arrow)'"
        />

        <!-- Node Elements -->
        <g 
          v-for="node in layoutNodes" 
          :key="node.nodeId"
          :transform="'translate(' + node.x + ',' + node.y + ')'"
          class="graph-node-group"
          :class="{
            'node-current': node.nodeId === currentNode,
            'node-visited': visitedNodes.has(node.nodeId),
            'node-unvisited': !visitedNodes.has(node.nodeId)
          }"
          @click="selectNode(node.nodeId)"
        >
          <!-- Node Card Shape -->
          <rect 
            x="-45" 
            y="-22" 
            width="90" 
            height="44" 
            rx="6" 
            class="node-card"
            :filter="node.nodeId === currentNode ? 'url(#accent-glow)' : 'url(#shadow)'"
          />

          <!-- Node Status Indicator Dot -->
          <circle 
            cx="-30" 
            cy="0" 
            r="4" 
            class="node-status-dot"
            :class="{ 'has-image': node.image }"
          />

          <!-- Node Label Text -->
          <text x="-16" y="-3" class="node-id-text">NODE {{ node.nodeId }}</text>
          <text x="-16" y="10" class="node-prompt-text">
            {{ truncatePrompt(node.prompt) }}
          </text>
          <text x="-16" y="18" class="node-depth-text">Depth {{ node.depth }}</text>
        </g>
      </g>
    </svg>
    <div class="graph-legend">
      <span class="legend-item"><span class="legend-color current"></span>Current</span>
      <span class="legend-item"><span class="legend-color visited"></span>Visited</span>
      <span class="legend-item"><span class="legend-color unvisited"></span>Unvisited</span>
      <span class="legend-item"><span class="legend-color art"></span>🖼️ Art Scene</span>
    </div>
  </div>
</template>

<script>
export default {
  name: 'NodeGraph',
  props: {
    nodes: { type: Array, required: true },
    currentNode: { type: Number, required: true },
    visitedNodes: { type: Object, required: true } // Sets are passed as objects in vue props
  },
  emits: ['select-node'],
  data() {
    return {
      panX: 40,
      panY: 80,
      zoomScale: 1.0,
      isPanning: false,
      startX: 0,
      startY: 0
    }
  },
  computed: {
    layoutNodes() {
      if (!this.nodes) return [];
      
      const layout = {};
      let leafCount = 0;
      
      const walk = (nodeId) => {
        if (nodeId === null || nodeId === undefined || nodeId >= this.nodes.length) return null;
        const node = this.nodes[nodeId];
        if (!node) return null;
        
        const children = (node.choices || [])
          .map(c => c.nextNodeId)
          .filter(id => id !== undefined && id !== null && id < this.nodes.length && this.nodes[id]);
          
        const item = {
          nodeId,
          prompt: node.prompt || '',
          image: node.image,
          depth: node.depth || 0,
          children,
          x: (node.depth || 0) * 160 + 60,
          y: 0
        };
        
        layout[nodeId] = item;
        
        if (children.length === 0) {
          // Leaf node!
          item.y = leafCount * 80 + 30;
          leafCount++;
        } else {
          let sumY = 0;
          let validChildrenCount = 0;
          for (const childId of children) {
            const childItem = walk(childId);
            if (childItem) {
              sumY += childItem.y;
              validChildrenCount++;
            }
          }
          item.y = validChildrenCount > 0 ? (sumY / validChildrenCount) : (leafCount * 80 + 30);
        }
        
        return item;
      };
      
      walk(0);
      
      return Object.values(layout);
    },
    layoutEdges() {
      const edges = [];
      const nodesList = this.layoutNodes;
      const nodeMap = {};
      nodesList.forEach(n => { nodeMap[n.nodeId] = n; });
      
      nodesList.forEach(n => {
        n.children.forEach(childId => {
          const child = nodeMap[childId];
          if (child) {
            const x1 = n.x + 45; // Start at right edge of parent node card
            const y1 = n.y;
            const x2 = child.x - 45; // End at left edge of child node card
            const y2 = child.y;
            
            // Smooth horizontal cubic bezier curve
            const cp1x = x1 + 50;
            const cp1y = y1;
            const cp2x = x2 - 50;
            const cp2y = y2;
            
            edges.push({
              id: `${n.nodeId}-${child.nodeId}`,
              path: `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`,
              source: n.nodeId,
              target: child.nodeId
            });
          }
        });
      });
      return edges;
    }
  },
  methods: {
    truncatePrompt(p) {
      if (!p) return 'Empty Scene...';
      const clean = p.replace(/^(Once upon a time|Then, |After that, )/gi, '');
      return clean.length > 12 ? clean.substring(0, 10) + '...' : clean;
    },
    selectNode(nodeId) {
      this.$emit('select-node', nodeId);
    },
    // Pan & Zoom Engine
    startPan(e) {
      if (e.button !== 0) return; // Left click only
      this.isPanning = true;
      this.startX = e.clientX - this.panX;
      this.startY = e.clientY - this.panY;
      this.$refs.svgCanvas.style.cursor = 'grabbing';
    },
    pan(e) {
      if (!this.isPanning) return;
      this.panX = e.clientX - this.startX;
      this.panY = e.clientY - this.startY;
    },
    endPan() {
      if (!this.isPanning) return;
      this.isPanning = false;
      if (this.$refs.svgCanvas) {
        this.$refs.svgCanvas.style.cursor = 'grab';
      }
    },
    handleWheel(e) {
      const zoomFactor = 1.1;
      const nextScale = e.deltaY < 0 ? this.zoomScale * zoomFactor : this.zoomScale / zoomFactor;
      
      // Enforce zoom boundaries
      if (nextScale >= 0.4 && nextScale <= 2.5) {
        // Zoom centered on current mouse cursor inside SVG
        const rect = this.$refs.svgCanvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        this.panX = mouseX - (mouseX - this.panX) * (nextScale / this.zoomScale);
        this.panY = mouseY - (mouseY - this.panY) * (nextScale / this.zoomScale);
        this.zoomScale = nextScale;
      }
    },
    zoomIn() {
      const nextScale = this.zoomScale * 1.2;
      if (nextScale <= 2.5) this.zoomScale = nextScale;
    },
    zoomOut() {
      const nextScale = this.zoomScale / 1.2;
      if (nextScale >= 0.4) this.zoomScale = nextScale;
    },
    resetView() {
      this.panX = 40;
      this.panY = 80;
      this.zoomScale = 1.0;
    }
  }
}
</script>

<style scoped>
.node-graph-container {
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  height: 380px;
  width: 100%;
  position: relative;
  box-shadow: var(--shadow-sm);
}

.graph-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-xs) var(--space-md);
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  z-index: 10;
}
.graph-title {
  font-size: var(--text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-secondary);
}
.zoom-controls {
  display: flex;
  gap: var(--space-xs);
}

.graph-svg {
  flex: 1;
  width: 100%;
  height: 100%;
  cursor: grab;
  user-select: none;
  background: radial-gradient(var(--border-light) 1px, transparent 1px);
  background-size: 20px 20px;
}

/* --- SVG Graph Elements styling --- */
.graph-edge {
  fill: none;
  stroke: var(--border);
  stroke-width: 1.5;
  transition: stroke var(--transition-normal), stroke-width var(--transition-normal);
}
.edge-visited {
  stroke: var(--text-muted);
  stroke-width: 2.0;
}
.edge-active {
  stroke: var(--accent);
  stroke-width: 2.5;
}

.graph-node-group {
  cursor: pointer;
}
.node-card {
  fill: var(--bg-secondary);
  stroke: var(--border);
  stroke-width: 1.5;
  transition: fill var(--transition-fast), stroke var(--transition-fast);
}
.graph-node-group:hover .node-card {
  stroke: var(--accent-hover);
  fill: var(--bg-hover);
}

.node-current .node-card {
  fill: var(--accent-soft);
  stroke: var(--accent);
  stroke-width: 2.0;
}
.node-visited .node-card {
  stroke: var(--text-secondary);
}
.node-unvisited {
  opacity: 0.7;
}

.node-status-dot {
  fill: var(--border);
  transition: fill var(--transition-fast);
}
.node-status-dot.has-image {
  fill: var(--accent);
}
.node-current .node-status-dot {
  fill: var(--accent);
}

.node-id-text {
  font-size: 8px;
  font-weight: 800;
  fill: var(--text-muted);
  letter-spacing: 0.05em;
}
.node-current .node-id-text {
  fill: var(--accent);
}
.node-prompt-text {
  font-size: 9px;
  font-weight: 600;
  fill: var(--text-primary);
}
.node-depth-text {
  font-size: 7px;
  fill: var(--text-muted);
  font-weight: 500;
}

.graph-legend {
  display: flex;
  justify-content: center;
  gap: var(--space-md);
  padding: var(--space-xs);
  background: var(--bg-secondary);
  border-top: 1px solid var(--border);
  font-size: 10px;
}
.legend-item {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  color: var(--text-secondary);
  font-weight: 500;
}
.legend-color {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  display: inline-block;
  border: 1px solid var(--border);
}
.legend-color.current { background: var(--accent-soft); border-color: var(--accent); }
.legend-color.visited { background: var(--bg-secondary); border-color: var(--text-secondary); }
.legend-color.unvisited { background: var(--bg-secondary); opacity: 0.7; }
.legend-color.art { background: var(--accent); border-color: var(--accent); }
</style>
