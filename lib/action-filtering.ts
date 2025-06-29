import type { AIAction } from "@/lib/models";

/**
 * Filters AI actions based on confidence score and limits to maximum 3 actions
 * Rules:
 * 1. Maximum 3 actions
 * 2. If any actions have confidence >= 0.5, drop all actions < 0.5
 * 3. Sort by confidence score (highest first)
 */
export function filterActions(actions: AIAction[]): AIAction[] {
  if (!actions || actions.length === 0) {
    return [];
  }

  // Sort by confidence score (highest first)
  const sortedActions = [...actions].sort((a, b) => b.confidence_score - a.confidence_score);

  // Check if any actions have confidence >= 0.5
  const hasHighConfidenceActions = sortedActions.some(action => action.confidence_score >= 0.5);

  let filteredActions: AIAction[];

  if (hasHighConfidenceActions) {
    // If we have high confidence actions, only keep those >= 0.5
    filteredActions = sortedActions.filter(action => action.confidence_score >= 0.5);
  } else {
    // If all actions are below 0.5, keep all of them
    filteredActions = sortedActions;
  }

  // Limit to maximum 3 actions
  return filteredActions.slice(0, 3);
}