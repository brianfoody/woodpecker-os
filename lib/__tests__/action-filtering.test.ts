import { filterActions } from "../action-filtering";
import type { AIAction } from "@/lib/models";

// Helper function to create mock actions
const createMockAction = (id: string, confidence: number, action = "test_action"): AIAction => ({
  id,
  action,
  text: `Action ${id}`,
  confidence_score: confidence,
  type: "suggestion",
});

describe("filterActions", () => {
  describe("empty or null input", () => {
    it("should return empty array for empty input", () => {
      const result = filterActions([]);
      expect(result).toEqual([]);
    });

    it("should return empty array for null input", () => {
      const result = filterActions(null as any);
      expect(result).toEqual([]);
    });

    it("should return empty array for undefined input", () => {
      const result = filterActions(undefined as any);
      expect(result).toEqual([]);
    });
  });

  describe("confidence filtering", () => {
    it("should keep all actions when all are below 0.5", () => {
      const actions = [
        createMockAction("1", 0.3),
        createMockAction("2", 0.1),
        createMockAction("3", 0.4),
      ];

      const result = filterActions(actions);

      expect(result).toHaveLength(3);
      // Should be sorted by confidence (highest first)
      expect(result[0].confidence_score).toBe(0.4);
      expect(result[1].confidence_score).toBe(0.3);
      expect(result[2].confidence_score).toBe(0.1);
    });

    it("should drop actions below 0.5 when some are above 0.5", () => {
      const actions = [
        createMockAction("1", 0.8),
        createMockAction("2", 0.3),
        createMockAction("3", 0.6),
        createMockAction("4", 0.2),
        createMockAction("5", 0.7),
      ];

      const result = filterActions(actions);

      expect(result).toHaveLength(3);
      // Should only include actions >= 0.5, sorted by confidence
      expect(result[0].confidence_score).toBe(0.8);
      expect(result[1].confidence_score).toBe(0.7);
      expect(result[2].confidence_score).toBe(0.6);
      
      // Should not include actions below 0.5
      expect(result.some(action => action.confidence_score < 0.5)).toBe(false);
    });

    it("should include actions with exactly 0.5 confidence", () => {
      const actions = [
        createMockAction("1", 0.5),
        createMockAction("2", 0.3),
        createMockAction("3", 0.7),
      ];

      const result = filterActions(actions);

      expect(result).toHaveLength(2);
      expect(result[0].confidence_score).toBe(0.7);
      expect(result[1].confidence_score).toBe(0.5);
    });
  });

  describe("max 3 actions limit", () => {
    it("should limit to 3 actions when more than 3 are provided", () => {
      const actions = [
        createMockAction("1", 0.9),
        createMockAction("2", 0.8),
        createMockAction("3", 0.7),
        createMockAction("4", 0.6),
        createMockAction("5", 0.5),
      ];

      const result = filterActions(actions);

      expect(result).toHaveLength(3);
      // Should include the top 3 by confidence
      expect(result[0].confidence_score).toBe(0.9);
      expect(result[1].confidence_score).toBe(0.8);
      expect(result[2].confidence_score).toBe(0.7);
    });

    it("should keep all actions when less than 3 are provided", () => {
      const actions = [
        createMockAction("1", 0.8),
        createMockAction("2", 0.6),
      ];

      const result = filterActions(actions);

      expect(result).toHaveLength(2);
      expect(result[0].confidence_score).toBe(0.8);
      expect(result[1].confidence_score).toBe(0.6);
    });

    it("should limit to 3 actions even when all are below 0.5", () => {
      const actions = [
        createMockAction("1", 0.4),
        createMockAction("2", 0.3),
        createMockAction("3", 0.2),
        createMockAction("4", 0.1),
        createMockAction("5", 0.05),
      ];

      const result = filterActions(actions);

      expect(result).toHaveLength(3);
      expect(result[0].confidence_score).toBe(0.4);
      expect(result[1].confidence_score).toBe(0.3);
      expect(result[2].confidence_score).toBe(0.2);
    });
  });

  describe("sorting", () => {
    it("should sort actions by confidence score in descending order", () => {
      const actions = [
        createMockAction("1", 0.5),
        createMockAction("2", 0.9),
        createMockAction("3", 0.1),
        createMockAction("4", 0.7),
      ];

      const result = filterActions(actions);

      expect(result[0].confidence_score).toBe(0.9);
      expect(result[1].confidence_score).toBe(0.7);
      expect(result[2].confidence_score).toBe(0.5);
      // 0.1 should be filtered out because there are actions >= 0.5
    });

    it("should maintain stable sort for actions with same confidence", () => {
      const actions = [
        createMockAction("1", 0.8),
        createMockAction("2", 0.8),
        createMockAction("3", 0.8),
      ];

      const result = filterActions(actions);

      expect(result).toHaveLength(3);
      expect(result.every(action => action.confidence_score === 0.8)).toBe(true);
    });
  });

  describe("complex scenarios", () => {
    it("should handle mix of high and low confidence with more than 3 high confidence actions", () => {
      const actions = [
        createMockAction("1", 0.9),
        createMockAction("2", 0.3),
        createMockAction("3", 0.8),
        createMockAction("4", 0.1),
        createMockAction("5", 0.7),
        createMockAction("6", 0.6),
        createMockAction("7", 0.2),
      ];

      const result = filterActions(actions);

      expect(result).toHaveLength(3);
      // Should only include top 3 actions >= 0.5
      expect(result[0].confidence_score).toBe(0.9);
      expect(result[1].confidence_score).toBe(0.8);
      expect(result[2].confidence_score).toBe(0.7);
    });

    it("should handle exactly 3 actions all above 0.5", () => {
      const actions = [
        createMockAction("1", 0.9),
        createMockAction("2", 0.8),
        createMockAction("3", 0.7),
      ];

      const result = filterActions(actions);

      expect(result).toHaveLength(3);
      expect(result[0].confidence_score).toBe(0.9);
      expect(result[1].confidence_score).toBe(0.8);
      expect(result[2].confidence_score).toBe(0.7);
    });

    it("should handle single action", () => {
      const actions = [createMockAction("1", 0.6)];

      const result = filterActions(actions);

      expect(result).toHaveLength(1);
      expect(result[0].confidence_score).toBe(0.6);
    });

    it("should handle edge case with exactly 0.5 confidence mixed with others", () => {
      const actions = [
        createMockAction("1", 0.5),
        createMockAction("2", 0.4999),
        createMockAction("3", 0.5001),
      ];

      const result = filterActions(actions);

      expect(result).toHaveLength(2);
      expect(result[0].confidence_score).toBe(0.5001);
      expect(result[1].confidence_score).toBe(0.5);
      // 0.4999 should be filtered out
    });
  });
});