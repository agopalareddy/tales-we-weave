# Interactive Storybook 🚀 

[![Course](https://img.shields.io/badge/WUSTL-CSE%20503S-blue.svg)](https://cse.wustl.edu/)
[![Framework](https://img.shields.io/badge/Vue.js-3.x-emerald.svg)](https://vuejs.org/)
[![Runtime](https://img.shields.io/badge/Node.js-%3E%3D%2018-green.svg)](https://nodejs.org/)
[![Package Manager](https://img.shields.io/badge/pnpm-10.x-orange.svg)](https://pnpm.io/)
[![Database](https://img.shields.io/badge/MongoDB-Atlas-success.svg)](https://www.mongodb.com/)
[![AI-Powered](https://img.shields.io/badge/Gemini%20%7C%20fal.ai-Powered-blueviolet.svg)](https://deepmind.google/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> A state-of-the-art AI-powered branching narrative game where readers create pathways using Gemini Flash choice logic and Fal.ai Flux Schnell graphics. Built with Vue 3, Express, and MongoDB.

---

## 📦 Features

- **🌳 Interactive SVG Narrative Node Graph:** A custom-engineered, zoomable, and pannable visual representation of your story tree. Nodes glow to show your active path and color-code dynamically based on visited vs unexplored branches.
- **🎨 AI Art Director Visual Styles:** Authors can expand a dedicated visual prompt panel to save styles (e.g. *Ghibli anime style, oil painting, volumetric lighting*) which seamlessly dictate fal.ai Schnell parameters to produce themed illustrations.
- **💾 Reader Progress Bookmarking:** Registered users have their exact node location saved in the database automatically. Catalog stories feature "Resume" triggers that return readers to their exact bookmarked scene.
- **🛠️ Intelligent Cascading Deletion:** Cleanly delete specific scenes and recursively purge disconnected descendant branches. Links in parents' choice arrays are broken, and custom cover/node uploads are unlinked from the local disk automatically to ensure maximum storage efficiency.
- **🛡️ GDPR Account Purging:** Secure "Danger Zone" user dashboard panel that permanently deletes credentials, all authored stories, and recursively unlinks associated images from server disk.
- **📊 Stats & Profile Dashboard:** Live metrics board displaying author stats (stories authored, nodes navigated, and illustrated scenes created) coupled with secure password updates.
- **⚙️ Detailed AI Console Checklists:** Replaces basic spinners with terminal-style load checkers showing the active generation step (*Consulting Gemini AI...*, *Rendering pixels with Fal.ai Schnell...*, *Securing server file allocation...*).
- **🔍 Catalog Search & Filtering:** Live catalog toolbar featuring real-time debounced searches, genre categorizations, and sorting triggers (Newest, Oldest, Alphabetical).

---

## 🛠️ Installation & Requirements

### Prerequisites
* **Node.js** >= 18.x
* **pnpm** >= 10.x (install via `npm install -g pnpm@10` or `corepack enable pnpm`)
* **MongoDB** (Atlas cluster or local service running on port `27017`)
* **Google Gemini API Key** (for choice/prompt logic)
* **fal.ai Key** (for Flux Schnell artwork generation)

### Copy-Pasteable Installation
Clone the repository and install the standard dependencies:
```bash
# Clone the repository
git clone https://github.com/agopalareddy/tales-we-weave.git
cd tales-we-weave/interactive-storybook

# Install dependencies
pnpm install
```

### Environment Configuration
Create a `.env` configuration file in `/interactive-storybook/` directory:
```bash
cp config.env.example .env
```
Fill in your credentials inside `.env`:
```env
MONGO_URI=your_mongodb_connection_string
GOOGLE_API_KEY=your_gemini_api_key
FAL_KEY=your_fal_ai_api_key
VUE_APP_PORT=8000
```

---

## 🚀 Quick Start / Usage

Start both the Express backend API and the Vue CLI development server concurrently using a single command:
```bash
pnpm run serve
```

The system will initialize:
* **Backend API server** listening on port `8000` (establishing database connections)
* **Vue CLI dev server** compiling assets and opening the browser on `http://localhost:8080/storybook/`

For production builds:
```bash
pnpm run build
```

---

## 📁 Repository Structure

```
interactive-storybook/
├── server/
│   ├── index.js           # Core Express server & API endpoints (DB connection, JWT soft-auth)
│   └── gemini.js          # Gemini Flash-lite integration prompt models
├── src/
│   ├── main.js            # Vue App initialization + Pinia registration + Router hooks
│   ├── style.css          # Core design tokens system (light & dark custom properties)
│   ├── App.vue            # Top navigation header & layout views router-view
│   ├── router/
│   │   └── index.js       # Global history routing configurations
│   ├── utils/
│   │   └── api.js         # Unified, auth-resilient apiFetch client wrapper
│   ├── stores/
│   │   ├── useAuth.js     # Pinia authenticated sessions store
│   │   └── useToast.js    # Queue reactive toasts provider
│   ├── components/
│   │   ├── NodeGraph.vue  # Zoomable SVG bezier story tree canvas
│   │   └── StoryDisplay.vue # Narrative viewer, prompts, editor, visual styles, deletion
│   └── views/
│       ├── FAQ.vue        # Accordion frequently asked questions dashboard
│       ├── Profile.vue    # Dashboard stats cards, passwords, danger account deletion
│       └── MyStories.vue  # Gated personal workspace stories list
├── uploads/               # Disk storage directory for custom uploaded cover illustrations
├── package.json           # Tasks compilation scripts and dependencies listing
├── pnpm-lock.yaml         # pnpm dependency lockfile (deterministic installs)
└── pnpm-workspace.yaml    # pnpm configuration (overrides, build permissions, hoisting)
```

---

## 🤝 Contributing & License

### Contributions
This repository is primarily developed as part of **CSE 503S: Rapid Prototyping and Creative Programming** at Washington University in St. Louis. Pull requests and feature upgrades are welcome! Please open a GitHub Issue to outline your changes before making submissions.

### License
Distributed under the **MIT License**. See `LICENSE` for more information.

---

## 📬 Support & Status
* **Project Status:** Production Ready / Active
* **Support Channel:** Open a [GitHub Issue](https://github.com/agopalareddy/tales-we-weave/issues) for any bug reports or visual enhancement requests.