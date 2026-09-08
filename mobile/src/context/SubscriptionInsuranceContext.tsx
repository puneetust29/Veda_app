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

type BillPayment = {
  id: string;
  bill_event_id: string;
  status: string;
  paid_at: string;
  amount: number;
  bill_details: any;
  payment_intent_id: string;
};

type SubscriptionInsuranceContextValue = {
  subscriptions: Subscription[] | null;
  activeInsurance: { purchases: InsurancePurchase[] } | null;
  activeBills: { bills: BillPayment[] } | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  refreshSubscriptions: () => Promise<void>;
  refreshInsurance: () => Promise<void>;
  refreshBills: () => Promise<void>;
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
  const [activeBills, setActiveBills] = useState<{ bills: BillPayment[] } | null>(null);
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
      const [subs, insurance, bills] = await Promise.all([
        api.listSubscriptions().catch(() => []),
        api.getActiveInsurance().catch(() => ({ purchases: [] })),
        api.getActiveBills().catch(() => ({ bills: [] })),
      ]);
      setSubscriptions(subs);
      setActiveInsurance(insurance);
      setActiveBills(bills);
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

  const refreshBillsOnly = async () => {
    try {
      const bills = await api.getActiveBills();
      setActiveBills(bills);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load bill payment data');
    }
  };

  const invalidateData = () => {
    setSubscriptions(null);
    setActiveInsurance(null);
    setActiveBills(null);
    setError(null);
  };

  const value = useMemo<SubscriptionInsuranceContextValue>(
    () => ({
      subscriptions,
      activeInsurance,
      activeBills,
      loading,
      error,
      refresh: refreshAll,
      refreshSubscriptions: refreshSubscriptionsOnly,
      refreshInsurance: refreshInsuranceOnly,
      refreshBills: refreshBillsOnly,
      invalidate: invalidateData,
    }),
    [subscriptions, activeInsurance, activeBills, loading, error],
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
