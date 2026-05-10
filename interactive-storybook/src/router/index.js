import { createRouter, createWebHistory } from "vue-router";
import StoryList from "../components/StoryList.vue";
import StoryDisplay from "../components/StoryDisplay.vue";
import LoginView from "../views/Login.vue";
import RegisterView from "../views/Register.vue";

const routes = [
  { path: "/", component: StoryList },
  { path: "/story/:id", component: StoryDisplay },
  { path: "/login", component: LoginView },
  { path: "/register", component: RegisterView },
  {
    path: "/my-stories",
    component: () => import("../views/MyStories.vue"),
  },
];

const router = createRouter({
  history: createWebHistory("/storybook/"),
  routes,
});

export default router;