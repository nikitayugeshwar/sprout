'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth, tokenStore } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // `loading` starts true so guarded pages render a skeleton instead of
  // flashing the signed-out state before the token has been checked.
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    if (!tokenStore.get()) {
      setLoading(false);
      return;
    }
    auth
      .me()
      .then((r) => setUser(r.user))
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  const adopt = useCallback((result) => {
    tokenStore.set(result.token);
    setUser(result.user);
    return result;
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      login: (email, password) => auth.login(email, password).then(adopt),
      register: (name, email, password) => auth.register(name, email, password).then(adopt),
      startDemo: () => auth.demo().then(adopt),
      logout: async () => {
        await auth.logout().catch(() => {});
        tokenStore.clear();
        setUser(null);
        router.push('/');
      },
    }),
    [user, loading, adopt, router],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
