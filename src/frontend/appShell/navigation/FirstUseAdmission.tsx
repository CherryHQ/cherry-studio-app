import { createContext, type PropsWithChildren, use, useLayoutEffect, useState } from 'react';

import { usePreference } from '@/frontend/data';
import { editionCapabilities } from '@/shared/data/managedPolicy';

import { useFirstUseEligibility } from './useFirstUseEligibility';

type FirstUseAdmission = 'admitted' | 'checking' | 'new' | 'resume';
type Eligibility = ReturnType<typeof useFirstUseEligibility>;

const FirstUseAdmissionContext = createContext<FirstUseAdmission>('admitted');

export function useFirstUseAdmission() {
  return use(FirstUseAdmissionContext);
}

function EligibilityObserver({ onChange }: { onChange: (value: Eligibility) => void }) {
  const eligibility = useFirstUseEligibility();
  useLayoutEffect(() => onChange(eligibility), [eligibility, onChange]);
  return null;
}

/** Keeps the route tree mounted as preference and database readiness settle. */
export function FirstUseAdmissionProvider({
  children,
  observe,
}: PropsWithChildren<{ observe: boolean }>) {
  const [status] = usePreference('app.onboarding.status');
  const [eligibility, setEligibility] = useState<Eligibility>('loading');
  const canOnboard = editionCapabilities().providerOnboarding;
  const hasFinished = status === 'completed' || status === 'skipped';
  const admission =
    !canOnboard || hasFinished
      ? 'admitted'
      : status !== 'unseen'
        ? 'resume'
        : eligibility === 'existing'
          ? 'admitted'
          : eligibility === 'new'
            ? 'new'
            : 'checking';

  return (
    <FirstUseAdmissionContext value={admission}>
      {observe && canOnboard && status === 'unseen' ? (
        <EligibilityObserver onChange={setEligibility} />
      ) : null}
      {children}
    </FirstUseAdmissionContext>
  );
}
