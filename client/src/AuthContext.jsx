import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api, { tokenStore } from './api';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!tokenStore.get());

  const logout = useCallback(() => {
    if (tokenStore.get()) api.post('/auth/logout').catch(() => {});
    tokenStore.clear();
    setUser(null);
  }, []);

  useEffect(() => {
    const onForcedLogout = () => setUser(null);
    window.addEventListener('auth:logout', onForcedLogout);
    return () => window.removeEventListener('auth:logout', onForcedLogout);
  }, []);

  useEffect(() => {
    if (!tokenStore.get()) return;
    api
      .get('/auth/me')
      .then((r) => setUser(r.data.user))
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  const authenticate = async (path, body) => {
    const { data } = await api.post(path, body);
    tokenStore.set(data.token);
    setUser(data.user);
  };

  const value = {
    user,
    loading,
    login: (email, password) => authenticate('/auth/login', { email, password }),
    signup: (name, email, password) => authenticate('/auth/signup', { name, email, password }),
    logout,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
