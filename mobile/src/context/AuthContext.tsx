import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { api } from '../lib/api';
import { clearToken, loadToken, setToken } from '../lib/authToken';
import type { Customer } from '../types';

type AuthContextValue = {
  customer: Customer | null;
  loading: boolean;
  /** False while a freshly-signed-in customer is still working through the
   * onboarding steps (Welcome/PlanSelection/.../Consent) after OTP; true for
   * a returning customer whose token was restored from storage on boot.
   * RootNavigator uses this (alongside `customer`) to decide whether to keep
   * rendering the onboarding stack or switch to the authenticated app. */
  onboardingComplete: boolean;
  signIn: (phoneNumber: string) => Promise<void>;
  /** Re-fetches the customer profile from the backend. Needed after actions
   * that update it server-side without the app knowing directly -- e.g.
   * connecting a Google account, which may fill in the customer's real name
   * from their Google profile. */
  refreshCustomer: () => Promise<void>;
  completeOnboarding: () => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboardingComplete, setOnboardingComplete] = useState(false);

  useEffect(() => {
    (async () => {
      const token = await loadToken();
      if (token) {
        try {
          setCustomer(await api.getMe());
          // A restored session belongs to a returning customer, not someone
          // mid-onboarding, so skip straight to the authenticated app.
          setOnboardingComplete(true);
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
      onboardingComplete,
      signIn: async (phoneNumber: string) => {
        const { access_token, customer: signedInCustomer } = await api.devLogin(phoneNumber);
        await setToken(access_token);
        setCustomer(signedInCustomer);
        setOnboardingComplete(false);
      },
      refreshCustomer: async () => {
        setCustomer(await api.getMe());
      },
      completeOnboarding: () => setOnboardingComplete(true),
      signOut: async () => {
        await clearToken();
        setCustomer(null);
        setOnboardingComplete(false);
      },
    }),
    [customer, loading, onboardingComplete],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
