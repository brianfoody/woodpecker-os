"use client";

import * as React from "react";
import { Wand2, Sparkles, Check, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AIAction } from "@/lib/models";

export interface ActionPromptModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  actions: AIAction[];
  onActionSelect: (action: AIAction) => void;
  onCancel?: () => void;
  loading?: boolean;
}

export function ActionPromptModal({
  open,
  onOpenChange,
  title = "Magic Wand Results",
  description = "I've analyzed the selected content and have some suggestions:",
  actions,
  onActionSelect,
  onCancel,
  loading = false,
}: ActionPromptModalProps) {
  const handleActionClick = (action: AIAction) => {
    onActionSelect(action);
    onOpenChange(false);
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    }
    onOpenChange(false);
  };

  const getActionIcon = (action: AIAction) => {
    if (action.icon) {
      return action.icon;
    }

    switch (action.type) {
      case "create":
        return <Sparkles className="h-4 w-4" />;
      case "modify":
        return <Wand2 className="h-4 w-4" />;
      case "delete":
        return <X className="h-4 w-4" />;
      case "suggestion":
        return <Check className="h-4 w-4" />;
      default:
        return <Wand2 className="h-4 w-4" />;
    }
  };

  const getActionVariant = (actionType: AIAction["type"]) => {
    switch (actionType) {
      case "create":
        return "default";
      case "modify":
        return "secondary";
      case "delete":
        return "destructive";
      case "suggestion":
        return "outline";
      default:
        return "outline";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-yellow-500" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Wand2 className="h-4 w-4 animate-spin" />
                Analyzing your selection...
              </div>
            </div>
          ) : actions.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-center text-sm text-muted-foreground">
                <Wand2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No actions suggested for this content.</p>
                <p className="text-xs mt-1">
                  Try selecting different content or drawing a clearer
                  selection.
                </p>
              </div>
            </div>
          ) : (
            actions.map((action) => (
              <div
                key={action.id}
                className="group relative rounded-lg border p-4 hover:bg-accent/50 transition-colors cursor-pointer"
                onClick={() => handleActionClick(action)}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-1">
                    {getActionIcon(action)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium leading-none mb-1">
                      {action.text}
                    </h4>
                    <p className="text-sm text-muted-foreground leading-snug">
                      {action.text}
                    </p>
                  </div>
                  <Button
                    variant={getActionVariant(action.type)}
                    size="sm"
                    className="opacity-60 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleActionClick(action);
                    }}
                  >
                    Action
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={loading}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Example usage and mock data for testing
export const mockAIActions: AIAction[] = [
  {
    id: "1",
    action: "ask_ai",
    text: "Create a new task",
    confidence_score: 0.9,
    type: "create",
  },
  {
    id: "2",
    action: "ask_ai",
    text: "Improve text formatting",
    confidence_score: 0.8,
    type: "modify",
  },
  {
    id: "3",
    action: "ask_ai",
    text: "Add relevant icons",
    confidence_score: 0.7,
    type: "suggestion",
  },
  {
    id: "4",
    action: "ask_ai",
    text: "Remove duplicate content",
    confidence_score: 0.6,
    type: "delete",
  },
];
