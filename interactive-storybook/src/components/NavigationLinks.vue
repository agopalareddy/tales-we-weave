<template>
    <nav class="nav-links">
        <router-link to="/">← Back to Story List</router-link>
        <router-link to="/my-stories" v-if="isLoggedIn">My Stories</router-link>
    </nav>
</template>

<script>
import { useAuthStore } from '@/stores/useAuth.js';

export default {
    name: 'NavigationLinks',
    computed: {
        isLoggedIn() {
            try {
                return useAuthStore().isLoggedIn;
            } catch {
                return false;
            }
        },
    },
};
</script>

<style scoped>
.nav-links {
    padding: var(--space-lg) 0;
    display: flex;
    gap: var(--space-lg);
}

.nav-links a {
    text-decoration: none;
    color: var(--text-secondary);
    font-weight: 600;
    font-size: var(--text-sm);
    transition: color var(--transition-fast);
}

.nav-links a:hover {
    color: var(--accent);
}
</style>