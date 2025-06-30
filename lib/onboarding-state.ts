export type OnboardingStep = 
  | 'welcome'
  | 'add_contact'
  | 'send_message'
  | 'ask_ai'
  | 'ask_ai_followup'
  | 'wait_for_reply'
  | 'view_reply'
  | 'complete';

export interface OnboardingState {
  currentStep: OnboardingStep;
  isActive: boolean;
  contactName?: string;
  hasCompletedOnboarding: boolean;
}

const STORAGE_KEY = 'woodpecker-onboarding';

export function getOnboardingState(): OnboardingState {
  if (typeof window === 'undefined') {
    return {
      currentStep: 'welcome',
      isActive: false,
      hasCompletedOnboarding: false,
    };
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        currentStep: parsed.currentStep || 'welcome',
        isActive: parsed.isActive || false,
        contactName: parsed.contactName,
        hasCompletedOnboarding: parsed.hasCompletedOnboarding || false,
      };
    }
  } catch (error) {
    console.warn('Failed to load onboarding state:', error);
  }

  return {
    currentStep: 'welcome',
    isActive: false,
    hasCompletedOnboarding: false,
  };
}

export function saveOnboardingState(state: OnboardingState): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('Failed to save onboarding state:', error);
  }
}

export function startOnboarding(): OnboardingState {
  const state: OnboardingState = {
    currentStep: 'welcome',
    isActive: true,
    hasCompletedOnboarding: false,
  };
  saveOnboardingState(state);
  return state;
}

export function advanceOnboardingStep(
  currentState: OnboardingState,
  newStep: OnboardingStep,
  contactName?: string
): OnboardingState {
  const newState: OnboardingState = {
    ...currentState,
    currentStep: newStep,
    contactName: contactName || currentState.contactName,
    hasCompletedOnboarding: newStep === 'complete',
    isActive: newStep !== 'complete',
  };
  saveOnboardingState(newState);
  return newState;
}

export function dismissOnboarding(): OnboardingState {
  const state: OnboardingState = {
    currentStep: 'complete',
    isActive: false,
    hasCompletedOnboarding: true,
  };
  saveOnboardingState(state);
  return state;
}

export function shouldShowOnboarding(): boolean {
  const state = getOnboardingState();
  return !state.hasCompletedOnboarding;
}