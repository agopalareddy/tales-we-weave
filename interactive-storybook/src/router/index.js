import { createRouter, createWebHistory } from "vue-router";
import StoryList from "../components/StoryList.vue"; // Assuming you'll have this component
import StoryDisplay from "../components/StoryDisplay.vue";

const routes = [
  { path: "/", component: StoryList },
  { path: "/story/:id", component: StoryDisplay }, // Dynamic route for stories
  // ... more routes for login, registration, etc.
];

const router = createRouter({
  history: createWebHistory("/storybook/"),
  routes,
});

export default router;