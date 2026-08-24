import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import type { PlanTier } from '../types';

export type AppPermission = {
  id: string;
  label: string;
  category: 'Navigation' | 'Communication' | 'Health';
  icon: string;
  /** Brand-ish accent color for this app's icon chip, echoing the real app
   * icons shown in the Figma "Your X setup." screen. */
  color: string;
  connected: boolean;
};

const DEFAULT_APPS: AppPermission[] = [
  { id: 'google-maps', label: 'Google maps', category: 'Navigation', icon: 'location', color: '#1a73e8', connected: true },
  { id: 'find-my', label: 'Find My', category: 'Navigation', icon: 'navigate', color: '#34a853', connected: true },
  { id: 'waze', label: 'Waze', category: 'Navigation', icon: 'car', color: '#33ccff', connected: false },
  { id: 'whatsapp', label: 'Whatsapp', category: 'Communication', icon: 'logo-whatsapp', color: '#25d366', connected: true },
  { id: 'outlook', label: 'Outlook', category: 'Communication', icon: 'mail', color: '#0072c6', connected: true },
  { id: 'notion', label: 'Notion', category: 'Communication', icon: 'document-text', color: '#111111', connected: true },
  { id: 'contacts', label: 'Contacts', category: 'Communication', icon: 'person-circle', color: '#4285f4', connected: true },
  { id: 'gmail', label: 'Gmail', category: 'Communication', icon: 'mail', color: '#ea4335', connected: false },
  { id: 'boots', label: 'Boots', category: 'Health', icon: 'medkit', color: '#0033a0', connected: true },
  { id: 'my-health', label: 'My Health', category: 'Health', icon: 'heart', color: '#e01e5a', connected: true },
];

type OnboardingState = {
  phoneNumber: string;
  setPhoneNumber: (value: string) => void;
  firstName: string;
  setFirstName: (value: string) => void;
  planTier: PlanTier;
  setPlanTier: (tier: PlanTier) => void;
  apps: AppPermission[];
  toggleApp: (id: string) => void;
  setAllApps: (connected: boolean) => void;
};

const OnboardingContext = createContext<OnboardingState | undefined>(undefined);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [phoneNumber, setPhoneNumber] = useState('');
  // The prototype greets a hardcoded "Emily" once verified; we mirror that
  // here since there's no real identity lookup in this dev flow yet.
  const [firstName, setFirstName] = useState('Emily');
  const [planTier, setPlanTier] = useState<PlanTier>('lite');
  const [apps, setApps] = useState<AppPermission[]>(DEFAULT_APPS);

  const value = useMemo<OnboardingState>(
    () => ({
      phoneNumber,
      setPhoneNumber,
      firstName,
      setFirstName,
      planTier,
      setPlanTier,
      apps,
      toggleApp: (id: string) =>
        setApps((prev) => prev.map((app) => (app.id === id ? { ...app, connected: !app.connected } : app))),
      setAllApps: (connected: boolean) => setApps((prev) => prev.map((app) => ({ ...app, connected }))),
    }),
    [phoneNumber, firstName, planTier, apps],
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding(): OnboardingState {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding must be used within an OnboardingProvider');
  return ctx;
}
