import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { api } from '../lib/api';
import type { Subscription } from '../types';

type InsurancePurchase = {
  id: string;
  calendar_event_id: string;
  status: string;
  purchased_at: string;
  plan_details: any;
};

type SubscriptionInsuranceContextValue = {
  subscriptions: Subscription[] | null;
  activeInsurance: { purchases: InsurancePurchase[] } | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  refreshSubscriptions: () => Promise<void>;
  refreshInsurance: () => Promise<void>;
  invalidate: () => void;
};

const SubscriptionInsuranceContext = createContext<SubscriptionInsuranceContextValue | undefined>(
  undefined,
);

export function SubscriptionInsuranceProvider({ children }: { children: ReactNode }) {
  const [subscriptions, setSubscriptions] = useState<Subscription[] | null>(null);
  const [activeInsurance, setActiveInsurance] = useState<{ purchases: InsurancePurchase[] } | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      await refreshAll();
    })();
  }, []);

  const refreshAll = async () => {
    try {
      setLoading(true);
      setError(null);
      const [subs, insurance] = await Promise.all([
        api.listSubscriptions().catch(() => []),
        api.getActiveInsurance().catch(() => ({ purchases: [] })),
      ]);
      setSubscriptions(subs);
      setActiveInsurance(insurance);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load subscription data');
    } finally {
      setLoading(false);
    }
  };

  const refreshSubscriptionsOnly = async () => {
    try {
      const subs = await api.listSubscriptions();
      setSubscriptions(subs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load subscriptions');
    }
  };

  const refreshInsuranceOnly = async () => {
    try {
      const insurance = await api.getActiveInsurance();
      setActiveInsurance(insurance);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load insurance data');
    }
  };

  const invalidateData = () => {
    setSubscriptions(null);
    setActiveInsurance(null);
    setError(null);
  };

  const value = useMemo<SubscriptionInsuranceContextValue>(
    () => ({
      subscriptions,
      activeInsurance,
      loading,
      error,
      refresh: refreshAll,
      refreshSubscriptions: refreshSubscriptionsOnly,
      refreshInsurance: refreshInsuranceOnly,
      invalidate: invalidateData,
    }),
    [subscriptions, activeInsurance, loading, error],
  );

  return (
    <SubscriptionInsuranceContext.Provider value={value}>
      {children}
    </SubscriptionInsuranceContext.Provider>
  );
}

export function useSubscriptionInsurance(): SubscriptionInsuranceContextValue {
  const ctx = useContext(SubscriptionInsuranceContext);
  if (!ctx)
    throw new Error('useSubscriptionInsurance must be used within a SubscriptionInsuranceProvider');
  return ctx;
}
