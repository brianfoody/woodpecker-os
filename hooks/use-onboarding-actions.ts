"use client";

import { useCallback } from "react";
import {
  OnboardingStep,
  OnboardingState,
  getOnboardingState,
  advanceOnboardingStep,
} from "@/lib/onboarding-state";

export function useOnboardingActions() {
  const handleContactAdded = useCallback((contactName: string) => {
    const state = getOnboardingState();
    if (state.isActive && state.currentStep === 'add_contact') {
      console.log('📋 Onboarding: Contact added, advancing to send_message step');
      const newState = advanceOnboardingStep(state, 'send_message', contactName);
      return newState;
    }
    return null;
  }, []);

  const handleMessageSent = useCallback(() => {
    const state = getOnboardingState();
    if (state.isActive && state.currentStep === 'send_message') {
      console.log('📋 Onboarding: Message sent, advancing to ask_ai step');
      const newState = advanceOnboardingStep(state, 'ask_ai');
      return newState;
    }
    return null;
  }, []);

  const handleAIQuestionAsked = useCallback(() => {
    const state = getOnboardingState();
    if (state.isActive && state.currentStep === 'ask_ai') {
      console.log('📋 Onboarding: AI question asked, advancing to ask_ai_followup step');
      const newState = advanceOnboardingStep(state, 'ask_ai_followup');
      return newState;
    }
    return null;
  }, []);

  const handleAIFollowupAsked = useCallback(() => {
    const state = getOnboardingState();
    if (state.isActive && state.currentStep === 'ask_ai_followup') {
      console.log('📋 Onboarding: AI followup asked, advancing to wait_for_reply step');
      const newState = advanceOnboardingStep(state, 'wait_for_reply');
      return newState;
    }
    return null;
  }, []);

  const handleMessageReceived = useCallback(() => {
    const state = getOnboardingState();
    if (state.isActive && state.currentStep === 'wait_for_reply') {
      console.log('📋 Onboarding: Message received, advancing to view_reply step');
      const newState = advanceOnboardingStep(state, 'view_reply');
      return newState;
    }
    return null;
  }, []);

  const handleReplyViewed = useCallback(() => {
    const state = getOnboardingState();
    if (state.isActive && state.currentStep === 'view_reply') {
      console.log('📋 Onboarding: Reply viewed, completing onboarding');
      const newState = advanceOnboardingStep(state, 'complete');
      return newState;
    }
    return null;
  }, []);

  const checkActionForOnboarding = useCallback((actionType: string, additionalData?: any) => {
    const state = getOnboardingState();
    if (!state.isActive) return null;

    switch (actionType) {
      case 'add_contact':
        return handleContactAdded(additionalData?.contactName || 'Unknown');
      case 'send_message':
        return handleMessageSent();
      case 'ask_ai':
        if (state.currentStep === 'ask_ai') {
          return handleAIQuestionAsked();
        } else if (state.currentStep === 'ask_ai_followup') {
          return handleAIFollowupAsked();
        }
        return null;
      case 'message_received':
        return handleMessageReceived();
      case 'view_reply':
        return handleReplyViewed();
      default:
        return null;
    }
  }, [
    handleContactAdded,
    handleMessageSent,
    handleAIQuestionAsked,
    handleAIFollowupAsked,
    handleMessageReceived,
    handleReplyViewed,
  ]);

  const isOnboardingActive = useCallback(() => {
    const state = getOnboardingState();
    return state.isActive;
  }, []);

  const getCurrentOnboardingStep = useCallback((): OnboardingStep | null => {
    const state = getOnboardingState();
    return state.isActive ? state.currentStep : null;
  }, []);

  return {
    checkActionForOnboarding,
    isOnboardingActive,
    getCurrentOnboardingStep,
    handleContactAdded,
    handleMessageSent,
    handleAIQuestionAsked,
    handleAIFollowupAsked,
    handleMessageReceived,
    handleReplyViewed,
  };
}