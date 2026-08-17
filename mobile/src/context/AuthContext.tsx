import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { api } from '../lib/api';
import { clearToken, loadToken, setToken } from '../lib/authToken';
import type { Customer } from '../types';

type AuthContextValue = {
  customer: Customer | null;
  loading: boolean;
  signIn: (phoneNumber: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await loadToken();
      if (token) {
        try {
          setCustomer(await api.getMe());
        } catch {
          await clearToken();
        }
      }
      setLoading(false);
    })();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      customer,
      loading,
      signIn: async (phoneNumber: string) => {
        const { access_token, customer: signedInCustomer } = await api.devLogin(phoneNumber);
        await setToken(access_token);
        setCustomer(signedInCustomer);
      },
      signOut: async () => {
        await clearToken();
        setCustomer(null);
      },
    }),
    [customer, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
