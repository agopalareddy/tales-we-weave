import router from '@/router';
import { useToast } from '@/stores/useToast.js';
import { useAuthStore } from '@/stores/useAuth.js';

export async function apiFetch(url, options = {}) {
  const token = localStorage.getItem('storybook_token');

  // Initialize headers
  options.headers = {
    ...options.headers,
  };

  // Set JSON Content-Type if body exists and is not already set
  if (options.body && !options.headers['Content-Type'] && !(options.body instanceof FormData)) {
    options.headers['Content-Type'] = 'application/json';
  }

  // Inject Bearer token
  if (token) {
    options.headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const res = await fetch(url, options);

    if (res.status === 401) {
      // Clear auth state in store and localStorage
      const auth = useAuthStore();
      auth.clearAuth();

      try {
        const toast = useToast();
        toast.addToast('error', 'Your session has expired. Please log in again.');
      } catch (e) {
        console.error('Failed to show toast:', e);
      }

      router.push('/login');
      throw new Error('Unauthorized');
    }

    return res;
  } catch (error) {
    console.error('API request failed:', error);
    throw error;
  }
}
