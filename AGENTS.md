# AGENTS.md — Interactive Storybook

> Comprehensive reference for AI agents and developers working on this project.
> Generated from extensive live debugging, Playwright testing, and codebase audit.

---

## 1. Project Overview

**Name**: Interactive Storybook  
**Stack**: Vue.js 3 (Options API) + Vue Router 4 + Pinia + Express + MongoDB + Gemini AI + fal.ai  
**Purpose**: AI-powered branching narrative application. Users create stories, generate AI text (Gemini flash-lite-latest) and images (fal.ai flux/schnell), and navigate choices in a tree.  
**Course**: CSE 503S — Rapid Prototyping and Creative Programming, Washington University in St. Louis

### Key distinction
This is NOT "Storybook.js" (the UI component library). The name "interactive-storybook" refers to the application's domain (a book of interactive stories). There are zero `.stories.*` files and zero `@storybook/*` packages.

---

## 2. Repository Structure

```
CSE503S_Interactive_Storybook/
├── README.md
├── frontend/              # UNUSED Vite scaffold (dead code, HelloWorld boilerplate)
├── backend/               # UNUSED standalone Express (dead code, broken)
│   ├── config.env         # ⚠️ CONTAINS REAL CREDENTIALS — NEVER COMMIT
│   └── config.env.example # Template for above
└── interactive-storybook/ # ★ THE REAL APPLICATION
    ├── public/index.html
    ├── package.json
    ├── vue.config.js          # publicPath: '/storybook/'
    ├── config.env.example     # Template for all env vars
    ├── .env                   # ⚠️ LIVE CREDENTIALS — chmod 600, NEVER commit
    ├── server/
    │   ├── index.js           # Express server (812 lines, all API routes)
    │   └── gemini.js          # Gemini flash-lite-latest integration
    ├── dist/                  # Vue CLI production build output
    ├── uploads/               # Reserved for future image storage migration
    └── src/
        ├── main.js            # createApp + createPinia + router
        ├── style.css          # Design system (CSS custom properties, utilities, transitions)
        ├── App.vue            # Root: router-view + ToastContainer
        ├── router/index.js    # Routes: /, /story/:id, /login, /register, /my-stories
        ├── stores/
        │   ├── useAuth.js     # Pinia auth: token validation, login, register, logout
        │   └── useToast.js    # Module-level reactive toast queue (NOT Pinia)
        ├── components/
        │   ├── StoryDisplay.vue    # ★ Most complex component (~900 lines). Story viewer, choices, image regen, tree visualization, title edit
        │   ├── StoryList.vue       # Story grid with loading/error/empty/success states
        │   ├── StoryCard.vue       # Story card with gradient placeholder
        │   ├── CreateStoryCard.vue # Dashed-border "add" card
        │   ├── CreateStoryDialog.vue # Multi-step modal: title → AI suggestions → create
        │   ├── ChoiceButton.vue    # Single choice button with slot
        │   ├── NavigationLinks.vue # Back to list + My Stories link
        │   ├── ToastContainer.vue  # Teleport + TransitionGroup toast host
        │   └── ToastItem.vue       # Individual toast (success/error/info/warning)
        └── views/
            ├── Login.vue       # Username/password login form
            ├── Register.vue    # Registration with confirm password
            └── MyStories.vue   # User's own stories (auth-gated via /api/my-stories)
```

---

## 3. Deployment

| Property | Value |
|----------|-------|
| **Platform** | GCP Compute Engine e2-small (2GB RAM) |
| **Region** | us-central1-a |
| **Hostname** | `project-showcase-server` |
| **Public IP** | `34.68.198.196` |
| **HTTPS** | Let's Encrypt via certbot (`34-68-198-196.nip.io`) |
| **SSH** | `ssh -i ~/.ssh/google_compute_engine adurs@34.68.198.196` OR `ssh gcp-showcase` |
| **App path** | `/opt/storybook-full/` |
| **Process** | PM2 (`pm2 list` — storybook pid) |
| **Web server** | Nginx on port 80/443 (sites-enabled/showcase) |
| **Static files** | `/storybook/` → `/opt/storybook-full/interactive-storybook/dist/` |
| **API proxy** | `/api/` → `http://127.0.0.1:8000` |
| **Platform URLs** | Landing: `/`, Storybook: `/storybook/`, Chat: `/chat/client.html`, Calendar: `/calendar/` |
| **GitHub** | `https://github.com/agopalareddy/CSE503S_Interactive_Storybook` |

### GCP Git Workflow
- Push to GitHub from local: `git push origin master`
- Deploy on GCP: `ssh gcp-showcase "cd /opt/storybook-full && git pull --rebase origin master && cd interactive-storybook && npm run build && pm2 restart storybook"`
- GCP server-only changes (not in source tree): modify `.env` directly

### Nginx Config
```nginx
location /storybook/ {
    alias /opt/storybook-full/interactive-storybook/dist/;
    try_files $uri $uri/ /storybook/index.html;
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
location /api/ {
    proxy_pass http://127.0.0.1:8000;
    proxy_read_timeout 90;
}
```

---

## 4. Environment Variables (.env)

**NEVER** commit `.env`. **ALWAYS** `chmod 600 .env` on the server.

| Variable | Purpose | Required |
|----------|---------|----------|
| `MONGO_URI` | MongoDB Atlas connection string | ✅ |
| `GOOGLE_API_KEY` | Gemini AI API key | ✅ |
| `FAL_KEY` | fal.ai flux/schnell key | ✅ |
| `VUE_APP_PORT` | Server port (default: 8000) | No |
| `FAL_DAILY_LIMIT` | Max images/day (default: 100) | No |
| `FAL_MONTHLY_LIMIT` | Max images/month (default: 500) | No |

The file `config.env.example` in the repo documents all required keys.

---

## 5. 🐛 Common Bugs & Their Fixes (CRITICAL — READ BEFORE EDITING)

### 5.1 2nd Choice Bug (node index mismatch)
**Symptom**: Choosing the 2nd option → "Continue your story here…" default prompt, no image, broken breadcrumb.  
**Root cause**: `handleChoice` passed `choice.nextNodeId` (which may skip indices) but `createNewNode` used `this.story.nodes.length` (always sequential). Server used `$push` which ignored the target index.  
**Fix (lines ~366 and ~246 in StoryDisplay.vue)**:
- `createNewNode` now accepts `targetNodeIndex` parameter, pads array before creating
- `handleChoice` passes `nodeIndex` as 3rd arg to `createNewNode`  
**Fix (lines ~458 in server/index.js)**:
- Server `PUT /api/stories/:id/node` changed from `$push` to `$set` at `['nodes.' + targetIndex]`

### 5.2 pathToRoot TypeError
**Symptom**: `TypeError: parentNode.pathToRoot is not iterable` on node creation.  
**Root cause**: Spread operator `[...parentNode.pathToRoot]` crashes when `pathToRoot` is undefined (can happen on old nodes or partial updates).  
**Fix (lines ~452-455 in server/index.js)**:
```javascript
depth: parentNode
    ? (parentNode.depth !== undefined ? parentNode.depth + 1 : 1)
    : 0,
pathToRoot: parentNode
    ? [...(parentNode.pathToRoot || []), parentNode.nodeId]
    : [],
```

### 5.3 Expired Auth Token Causes "Failed to fetch/create" Errors
**Symptom**: "Failed to fetch stories" on My Stories page, "Failed to create story" when creating. AI suggestions appear but creation fails.  
**Root cause**: `isLoggedIn` only checked `!!token.value`, not whether the token was still valid. Expired tokens in localStorage caused 401s from auth-gated endpoints.  
**Fix**: 
- `useAuth.js`: `isLoggedIn` requires BOTH `!!token.value && !!user.value`
- `validateToken()` called on store init (calls `/api/me`), clears invalid tokens
- MyStories and CreateStoryDialog handle 401 by clearing auth + redirecting to `/login`

### 5.4 ESLint Build Failure on `oldNode` Unused
**Symptom**: `vue-cli-service build` fails with ESLint error about unused `oldNode`.  
**Fix**: Remove unused parameter: `handler(newNode)` not `handler(newNode, oldNode)`

### 5.5 fal.ai 429 Daily Limit
**Symptom**: Image generation fails with 429 Too Many Requests.  
**Check**: `curl /api/fal/usage` — shows `daily.count` vs `daily.limit`.  
**Fix**: Edit `.env` on server (`FAL_DAILY_LIMIT=100`) or wait for UTC midnight reset.

---

## 6. Story Node System Architecture

### Node Structure
```javascript
{
  nodeId: Number,        // Unique ID matching array index
  prompt: String,        // Story text for this scene
  choices: Array,        // [{ text: String, nextNodeId: Number }]
  image: String,         // Base64 data URI (⚠️ will bloat MongoDB!)
  parentNodeId: Number,  // Parent node index (null for root)
  depth: Number,         // Distance from root (0-based)
  pathToRoot: Array      // [nodeId, nodeId, ...] breadcrumb trail
}
```

### Node Creation Flow
1. User clicks choice → `handleChoice(nodeIndex)` in StoryDisplay.vue
2. If node doesn't exist at `nodeIndex`: calls `createNewNode(parentNodeId, choiceText, targetNodeIndex)`
3. Frontend: pads array, sends `PUT /api/stories/:id/node` with nodeIndex in body
4. Server: pads array on DB side, uses `$set` at exact index
5. Watcher on `currentNode` fires → generates image if missing
6. Watcher on `currentNodeData` fires → generates choices if empty

### ⚠️ Array Padding
The story uses a **sparse array** where `nodes[0]` is root and intermediate indices may be null (untaken paths). Always use `while (nodes.length <= target) nodes.push(null)` before setting a node at a specific index.

### Path Tracking
- Root node: `pathToRoot: []`, `parentNodeId: null`, `depth: 0`
- Child of root clicked via 1st choice: `pathToRoot: [0]`, `parentNodeId: 0`, `depth: 1`
- Breadcrumb display: "Node 0 → Node 1 → Node 3"

---

## 7. API Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/health` | None | DB connection check |
| GET | `/api/stories` | None | All public stories |
| POST | `/api/stories` | ✅ Bearer | Create new story |
| GET | `/api/stories/:id` | None | Get one story |
| PUT | `/api/stories/:id` | None | Update story (title, nodes) |
| DELETE | `/api/stories/:id` | None | ⚠️ Delete story (public!) |
| GET | `/api/my-stories` | ✅ Bearer | Current user's stories |
| GET | `/api/me` | ✅ Bearer | Current user profile |
| POST | `/api/login` | None | Login → returns { token, _id, username } |
| POST | `/api/register` | None | Register → returns { token, _id, username } |
| POST | `/api/generate-prompt` | None | Gemini: 3 opening ideas from title |
| POST | `/api/generate-image` | None | fal.ai: image from prompt |
| PUT | `/api/stories/:id/title` | None | Title update + AI prompt regen |
| POST | `/api/stories/:id/node/:n/choices` | None | Gemini: generate 2 choices for node |
| PUT | `/api/stories/:id/node/:n/image` | None | Save base64 image to node |
| PUT | `/api/stories/:id/node/:n` | None | Update existing node |
| PUT | `/api/stories/:id/node` | None | Create new node at target index |
| GET | `/api/fal/usage` | None | fal.ai usage stats |

### Auth Headers
All `✅ Bearer` endpoints require: `Authorization: Bearer <token>`  
Token is generated server-side with `crypto.randomBytes(32).toString('hex')`  
Stored in localStorage as `storybook_token`

---

## 8. CSS Design System

All styles use CSS custom properties defined in `src/style.css`. **NEVER** hardcode colors. Always reference:

| Token | Usage |
|-------|-------|
| `--accent` / `--accent-hover` / `--accent-soft` | Primary brand (green) |
| `--danger` / `--danger-hover` / `--danger-soft` | Errors/deletion |
| `--warning` / `--success` / `--info` | Toasts/states |
| `--bg-primary` / `--bg-secondary` / `--bg-card` / `--bg-hover` | Backgrounds |
| `--text-primary` / `--text-secondary` / `--text-muted` / `--text-inverse` | Text |
| `--border` / `--border-strong` | Borders |
| `--space-xs` … `--space-4xl` | Spacing (4px base) |
| `--radius-sm` / `--radius-md` / `--radius-lg` / `--radius-xl` / `--radius-full` | Corners |
| `--shadow-sm` … `--shadow-xl` | Shadows |
| `--transition-fast` / `--transition-normal` / `--transition-slow` | Animations |
| `--font-sans` / `--font-mono` | Typography |
| `--z-dropdown` … `--z-tooltip` | Z-index stack |

**Dark theme** is fully defined (`.theme-dark` class) but not actively used (no toggle implemented).

---

## 9. Store Patterns

### useAuth (Pinia)
- `token` — reactive ref synced to localStorage
- `isLoggedIn` — computed: `!!token.value && !!user.value`
- `validateToken()` — async, called on init, clears invalid tokens
- `clearAuth()` — removes token + user from localStorage

### useToast (Module-level reactive)
- `toasts = reactive([])` at module scope (shared state, NOT Pinia)
- `addToast(type, message, duration=3000)` — auto-removes after duration
- Toast types: `success`, `error`, `warning`, `info`

---

## 10. Testing with Playwright

```bash
# Open browser to the storybook
playwright-cli open https://34-68-198-196.nip.io/storybook/

# Navigate and interact
playwright-cli goto https://34-68-198-196.nip.io/storybook/story/ID?node=0
playwright-cli click e123          # Use ref from snapshot
playwright-cli click "getByRole('button', { name: 'text...' })"

# Debug
playwright-cli console             # Check browser console
playwright-cli requests            # See network calls
playwright-cli snapshot            # Get full page YAML snapshot
playwright-cli close
```

### Test user credentials
- Username: `playwright_test`, Password: `test1234`  
- ⚠️ Registration returns "Username already exists" if username is taken

---

## 11. Build & Deploy

```bash
# Local build
cd interactive-storybook && npm run build
# Output: dist/ (index.html + js/ + css/)

# Push + deploy (one command)
git add -A && git commit -m "message" && git push origin master && \
ssh gcp-showcase "cd /opt/storybook-full && git pull --rebase origin master && \
cd interactive-storybook && npm run build && pm2 restart storybook"

# Important: pm2 restart is needed after ANY server/index.js change
# Static Vue changes only need npm run build (browser cache may need refresh)
```

### ⚠️ Build Failure Checks
- ESLint errors (style issues) WILL fail the build
- Run `npm run lint` locally before pushing
- Common issues: unused variables, missing semicolons

---

## 12. Security Notes

### DO NOT
- Commit `.env` or `config.env` to git (both contain live credentials)
- Expose API keys in client-side JS (use `VUE_APP_` prefix cautiously — it bundles into the build!)
- Leave endpoints without auth that modify data (current: DELETE /api/stories/:id has no auth!)

### Credentials Location
- `.env` in `interactive-storybook/` at `/opt/storybook-full/interactive-storybook/.env` on GCP
- `chmod 600` enforced on server
- GitHub remote: `https://github.com/agopalareddy/CSE503S_Interactive_Storybook`
- Local git auth via `gh auth token` or SSH

---

## 13. Dependencies to be careful with

- **`bcrypt`**: Native module — must match Node.js version. Server crashes silently if mismatched.
- **`concurrently`**: Used in `npm run serve` only (dev). Not in production.
- **`pnpm-lock.yaml`**: Exists but `npm` is used for deployment. Do NOT commit a pnpm install.
- **Pinia**: Imported as `import { createPinia } from "pinia"` in main.js. Must be registered BEFORE router.
- **Vue Router**: Uses `createWebHistory("/storybook/")` — the base path MUST match `publicPath` in vue.config.js.

---

## 14. UI Component Nuances

### StoryDisplay.vue
- `apiBaseUrl` is `''` (empty string) — all API calls use relative `/api/` paths
- Story tree panel: collapsible, uses `flattenTree` computed (depth-first walk with spill controls)
- `visitedNodes` is a `Set` tracking which nodes the user has seen
- URL sync: `this.$router.replace({ query: { node: newNode } })` on every navigation
- Image regen: `.img-regen-btn` is a compact 🔄 button in the image wrapper (position: absolute)

### StoryCard.vue
- Uses deterministic hash from `_id` for gradient placeholder color
- Fallback genre display: "Adventure" if `story.genre` is missing
- `formattedDate` uses `toLocaleDateString` with graceful NaN handling

### CreateStoryDialog.vue
- 3-step wizard: Step 1 (title) → Step 2 (opening) → Step 3 (creating with progress)
- AI suggestions: calls `/api/generate-prompt`, shows 3 cards, allows selection
- Fallback suggestions if API fails (3 hardcoded templates)
- `selectedPrompt` computed prioritizes custom text over selected suggestion

### ChoiceButton.vue
- Uses `<slot>` for content (text injected from parent)
- Optional `label` prop for `aria-label`
- `emits: ['click']` — parent handles navigation via `@click="handleChoice(choice.nextNodeId)"`

---

## 15. Known Limitations

- **Base64 images in MongoDB**: Images are stored as full data URIs in documents. This bloats the DB. Future: migrate to `uploads/` directory or cloud storage.
- **No HTTPS redirect**: HTTP still works alongside HTTPS. Consider adding nginx redirect.
- **No CSRF protection**: API accepts cross-origin requests (CORS `*`).
- **DELETE /api/stories/:id has NO auth**: Anyone can delete any story.
- **No password complexity requirements**: Minimum 4 chars only.
- **No email verification**: Users can register with any credentials.
- **No session expiration**: Tokens never expire (until manually cleared).
- **Dark theme defined but unused**: `.theme-dark` class exists in style.css but no toggle.
- **Story display limit**: Tree visualization capped at depth 15 to prevent infinite recursion.

---

## 16. Quick Reference: Fixing Common Issues

```bash
# Server crash
ssh gcp-showcase "pm2 logs storybook --lines 20"
ssh gcp-showcase "pm2 restart storybook"

# See fal.ai usage
curl https://34-68-198-196.nip.io/api/fal/usage

# Increase fal.ai limit
ssh gcp-showcase "sed -i 's/FAL_DAILY_LIMIT=.*/FAL_DAILY_LIMIT=200/' /opt/storybook-full/interactive-storybook/.env && pm2 restart storybook"

# Check MongoDB connection
curl https://34-68-198-196.nip.io/api/health

# See all stories in DB
curl -s https://34-68-198-196.nip.io/api/stories | python3 -m json.tool | head -30

# Validate specific story node structure
curl -s https://34-68-198-196.nip.io/api/stories/STORY_ID | python3 -c "
import sys,json; d=json.load(sys.stdin)
for i,n in enumerate(d['nodes']):
    print(f'  [{i}] depth={n.get(\"depth\")} img={\"Y\" if n and n.get(\"image\",\"\").startswith(\"data:\") else \"N\"} ch={len(n.get(\"choices\",[])) if n else 0}')"
```

---

## 17. Git History (Recent Milestones)

```
1f08608 fix: auth token validation and 401 handling
33002b4 fix: safe fallback for pathToRoot/depth on node creation
538f640 fix: increase fal.ai daily limit to 100
5f59e56 fix: tree depth uses line.depth for empty nodes
8a5b896 fix: recursive tree visualization with indent lines
9f5f149 fix: remove unused oldNode parameter
fef6800 feat: add story tree visualization and fix layout
160511e fix: server node creation uses set instead of push
a0e39d9 fix: resolve 2nd choice bug - node index mismatch
814f71b fix: comprehensive codebase improvements
```

---

*Generated 2026-05-10. Update this file whenever you discover new patterns, fix new bugs, or change architecture.*
