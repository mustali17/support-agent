import axios from 'axios';

const TOKEN_KEY = 'support_token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' });

api.interceptors.request.use((cfg) => {
  const t = tokenStore.get();
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

// Expired/invalid token on a protected call -> drop it and notify the app.
api.interceptors.response.use(
  (r) => r,
  (err) => {
    const isAuthForm = /\/auth\/(login|signup)$/.test(err.config?.url || '');
    if (err.response?.status === 401 && !isAuthForm) {
      tokenStore.clear();
      window.dispatchEvent(new Event('auth:logout'));
    }
    return Promise.reject(err);
  }
);

export const errorMessage = (err) =>
  err.response?.data?.error || (err.request ? 'Cannot reach the server' : 'Something went wrong');

export default api;
