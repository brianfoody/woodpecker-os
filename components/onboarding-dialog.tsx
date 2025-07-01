"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import {
  OnboardingStep,
  OnboardingState,
  getOnboardingState,
  advanceOnboardingStep,
  dismissOnboarding,
} from "@/lib/onboarding-state";

interface OnboardingDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onStepChange: (step: OnboardingStep, contactName?: string) => void;
}

const stepContent = {
  welcome: {
    title: "Welcome to Woodpecker",
    content: (
      <div className="space-y-4">
        <p className="text-lg">
          You are <strong>Bjorn</strong>, a designer. You use Woodpecker to
          start your morning.
        </p>
        <p className="text-lg">
          It helps you avoid your phone, keep your focus and plan your day.
        </p>
      </div>
    ),
    buttonText: "Let's Begin",
  },
  add_contact: {
    title: "Add a Contact",
    content: (
      <div className="space-y-4">
        <p className="text-lg">
          Using your phone, you will act as{" "}
          <strong>Bjorn&apos;s colleague</strong>.
        </p>
        <p className="text-lg">
          Just write your name and number on the canvas, circle it and hold.
        </p>
        <p className="text-lg">Woodpecker will take care of the rest.</p>
        <p className="text-sm hidden md:block">
          Hint: On desktop, press the T key to input text. Then press D to
          revert back to pen for circling.
        </p>
        <p className="text-sm md:hidden">
          Hint: You can tap the text icon to type text and then tap the pen icon
          to circle.
        </p>
      </div>
    ),
    buttonText: "Got it",
  },
  send_message: {
    title: "Send a Message",
    content: (contactName: string) => (
      <div className="space-y-4">
        <p className="text-lg">
          Okay, <strong>{contactName}</strong> has been added to your contacts.
        </p>
        <p className="text-lg">
          {`Now, let's send them a message to remind them of our client meeting at 10am.`}
        </p>
        <p className="text-lg">
          Simply write:{" "}
          <em>&quot;Don&apos;t forget our client meeting at 10:15.&quot;</em>
          And below that:
          <em>&quot;Send to {contactName}&quot;</em>
        </p>
        <p className="text-lg">Circle and hold.</p>
      </div>
    ),
    buttonText: "Got it",
  },
  ask_ai: {
    title: "Research time",
    content: (
      <div className="space-y-4">
        <p className="text-lg">
          Great. Now you&apos;ve messaged your colleague without disrupting your
          morning.
        </p>

        <p className="text-lg">Now it&apos;s time to do some research.</p>
        <p className="text-lg">{`Your meeting is about design for VR.`}</p>
        <p className="text-lg">
          Write: <em>&quot;Give me some examples of VR web design.&quot;</em>
        </p>
        <p className="text-lg">You know the drill now. Circle & hold.</p>
      </div>
    ),
    buttonText: "Got it",
  },
  ask_ai_followup: {
    title: "Follow Up Question",
    content: (
      <div className="space-y-4">
        <p className="text-lg">
          Right, makes sense. But what does it mean for our mates at Bolt.new?
        </p>
        <p className="text-lg">
          Sketch a note beside it asking:{" "}
          <em>&quot;How can bolt.new integrate VR experiences?&quot;</em>
        </p>
        <p className="text-lg">
          Circle <strong>BOTH</strong> the note and the AI answer.
        </p>
      </div>
    ),
    buttonText: "Got it",
  },
  wait_for_reply: {
    title: "Wait for Reply",
    content: (contactName: string) => (
      <div className="space-y-4">
        <p className="text-lg">
          Alright, we&apos;re set. Let&apos;s see if{" "}
          <strong>{contactName}</strong> got back to us.
        </p>
        <p className="text-lg">
          Send a message reply to &quot;Bjorn&quot; from your phone.
        </p>
        <div className="flex items-center justify-center py-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        </div>
        <p className="text-sm text-gray-600 text-center">
          Waiting for reply...
        </p>
      </div>
    ),
    buttonText: null,
  },
  view_reply: {
    title: "View the Reply",
    content: (
      <div className="space-y-4">
        <p className="text-lg">Ah great, they have replied.</p>
        <p className="text-lg">Tap to view.</p>
      </div>
    ),
    buttonText: "Got it",
  },
  complete: {
    title: "You're All Set!",
    content: (
      <div className="space-y-4">
        <p className="text-lg">
          Okay now you&apos;ve got a feel for Woodpecker.
        </p>
        <p className="text-lg">
          Have fun and watch your focus & curiosity grow.
        </p>
      </div>
    ),
    buttonText: "Start Using Woodpecker",
  },
};

export function OnboardingDialog({
  isOpen,
  onClose,
  onStepChange,
}: OnboardingDialogProps) {
  const [onboardingState, setOnboardingState] = useState<OnboardingState>(() =>
    getOnboardingState()
  );

  useEffect(() => {
    if (isOpen) {
      const state = getOnboardingState();
      setOnboardingState(state);
    }
  }, [isOpen]);

  // Sync with external onboarding state changes
  useEffect(() => {
    const checkForUpdates = () => {
      const currentState = getOnboardingState();
      if (currentState.currentStep !== onboardingState.currentStep) {
        setOnboardingState(currentState);
      }
    };

    const interval = setInterval(checkForUpdates, 100);
    return () => clearInterval(interval);
  }, [onboardingState.currentStep]);

  const handleNext = () => {
    const nextSteps: Record<OnboardingStep, OnboardingStep> = {
      welcome: "add_contact",
      add_contact: "add_contact", // Stay here until contact is added
      send_message: "send_message", // Stay here until message is sent
      ask_ai: "ask_ai", // Stay here until AI question is asked
      ask_ai_followup: "ask_ai_followup", // Stay here until followup is asked
      wait_for_reply: "view_reply",
      view_reply: "complete",
      complete: "complete",
    };

    const currentStep = onboardingState.currentStep;
    const nextStep = nextSteps[currentStep];

    // For instructional steps (add_contact, send_message, ask_ai, ask_ai_followup),
    // "Got it" should just close the dialog and wait for the user to perform the action
    const instructionalSteps: OnboardingStep[] = [
      "add_contact",
      "send_message",
      "ask_ai",
      "ask_ai_followup",
    ];

    if (instructionalSteps.includes(currentStep)) {
      // Just close the dialog, don't advance the step yet
      onClose();
    } else {
      // For other steps, advance normally
      if (nextStep !== currentStep) {
        const newState = advanceOnboardingStep(onboardingState, nextStep);
        setOnboardingState(newState);
        onStepChange(nextStep, newState.contactName);
      }
    }
  };

  const handleDismiss = () => {
    const newState = dismissOnboarding();
    setOnboardingState(newState);
    onClose();
  };

  const currentStepData = stepContent[onboardingState.currentStep];

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>{currentStepData.title}</DialogTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              className="h-6 w-6 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="py-4">
          {typeof currentStepData.content === "function"
            ? currentStepData.content(
                onboardingState.contactName || "your colleague"
              )
            : currentStepData.content}
        </div>

        {currentStepData.buttonText && (
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={handleDismiss}>
              Skip Tutorial
            </Button>
            <Button onClick={handleNext}>{currentStepData.buttonText}</Button>
          </div>
        )}

        {onboardingState.currentStep === "wait_for_reply" && (
          <div className="flex justify-end">
            <Button variant="outline" onClick={handleDismiss}>
              Skip Tutorial
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
