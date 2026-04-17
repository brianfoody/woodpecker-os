/**
 * Handwriting Context Manager v2
 * Uses WebSocket recognizer and synchronizer pattern
 */

import { Editor } from "tldraw";
import { InkRecognizer } from "./iink-recognizer";
import { TLDrawInkSynchronizer } from "./iink-synchronizer";
import { StrokeBounds } from "./stroke-converter";

export interface RecognitionSegment {
  text: string;
  timestamp: number;
  bounds: StrokeBounds;
}

export interface IntentDetectionResult {
  shouldRespond: boolean;
  fullQuestion: string;
  confidence: number;
  responsePosition?: { x: number; y: number };
}

export interface ContextWindow {
  temporal: string; // Recent text (time-based)
  spatial: string; // Nearby text (position-based)
  conversation: string; // Previous Q&A context
}

export class HandwritingContextManagerV2 {
  private editor: Editor;
  private synchronizer: TLDrawInkSynchronizer;
  private recognitionBuffer: RecognitionSegment[] = [];
  private conversationHistory: Array<{
    question: string;
    answer: string;
    timestamp: number;
  }> = [];
  private recognitionTimer: NodeJS.Timeout | null = null;
  private isProcessingIntent = false;
  private lastRecognizedText = "";
  private lastRecognizedPosition: { x: number; y: number } = { x: 0, y: 0 };
  private chatMode = false;

  // Configuration - defaults (overridden in chat mode)
  private debounceDelay = 1000; // ms - 1 second for WebSocket sync
  private confidenceThreshold = 0.7;
  private conversationHistoryLimit = 3;
  private readonly CONTEXT_WINDOW_TIME = 30000; // 30 seconds
  private readonly SPATIAL_PROXIMITY_THRESHOLD = 200; // pixels
  private readonly MAX_BUFFER_SIZE = 100; // Max segments to keep

  // Callbacks
  public onIntentDetected?: (result: IntentDetectionResult) => Promise<void>;

  constructor(editor: Editor) {
    this.editor = editor;
    // Skip existing strokes when initializing to avoid recognizing old content
    this.synchronizer = new TLDrawInkSynchronizer(editor, { skipExistingStrokes: true });

    // Set up text recognition callback
    this.synchronizer.onTextRecognized = (
      text: string,
      position: { x: number; y: number }
    ) => {
      console.log("📝 Text recognized:", text);
      this.lastRecognizedText = text;
      this.lastRecognizedPosition = position;
      this.handleRecognizedText(text, position);
    };

    // Initialize recognizer
    this.initializeRecognizer();
  }

  private async initializeRecognizer() {
    try {
      // Get viewport dimensions from the editor
      const viewport = this.editor.getViewportScreenBounds();
      const viewWidth = Math.round(viewport.width || 800);
      const viewHeight = Math.round(viewport.height || 600);

      console.log(
        `📐 Initializing recognizer with viewport: ${viewWidth}x${viewHeight}`
      );

      const recognizer = await InkRecognizer.getRecognizer(
        viewWidth,
        viewHeight
      );

      if (!recognizer) {
        throw new Error("Failed to create recognizer instance");
      }

      // Wait for recognizer to be fully ready
      await new Promise((resolve) => setTimeout(resolve, 200));

      this.synchronizer.setRecognizer(recognizer);
      console.log(
        "✅ Handwriting context manager initialized with WebSocket recognizer"
      );
    } catch (error) {
      console.error("❌ Failed to initialize recognizer:", error);
      // Retry after a delay
      setTimeout(() => {
        console.log("🔄 Retrying recognizer initialization...");
        this.initializeRecognizer();
      }, 2000);
    }
  }

  /**
   * Enable or disable chat mode
   */
  setChatMode(enabled: boolean) {
    this.chatMode = enabled;
    if (enabled) {
      this.debounceDelay = 500;
      this.confidenceThreshold = 0.3;
      this.conversationHistoryLimit = 10;
    } else {
      this.debounceDelay = 1000;
      this.confidenceThreshold = 0.7;
      this.conversationHistoryLimit = 3;
    }
  }

  getChatMode(): boolean {
    return this.chatMode;
  }

  /**
   * Trigger synchronization when editor changes
   */
  sync() {
    // Debounce synchronization
    if (this.recognitionTimer) {
      clearTimeout(this.recognitionTimer);
    }

    this.recognitionTimer = setTimeout(() => {
      this.synchronizer.sync();
    }, this.debounceDelay);
  }

  /**
   * Handle recognized text from the synchronizer
   */
  private async handleRecognizedText(
    text: string,
    position: { x: number; y: number }
  ) {
    if (!text || text.trim().length === 0) return;

    // Calculate bounds (approximate)
    const bounds: StrokeBounds = {
      x: position.x,
      y: position.y - 30, // Approximate text height
      width: text.length * 10, // Approximate width
      height: 30,
    };

    // Add to recognition buffer
    const segment: RecognitionSegment = {
      text: text.trim(),
      timestamp: Date.now(),
      bounds,
    };

    this.recognitionBuffer.push(segment);
    this.trimBuffer();

    // Check for intent with context
    await this.checkIntentWithContext(segment);
  }

  /**
   * Check if the user's input indicates they want an AI response
   */
  private async checkIntentWithContext(newSegment: RecognitionSegment) {
    // Prevent concurrent intent processing
    if (this.isProcessingIntent) {
      console.log("⏳ Already processing intent, skipping...");
      return;
    }

    this.isProcessingIntent = true;

    // Build context window
    const context = this.buildContextWindow(newSegment);

    try {
      // Local intent detection — no API call needed.
      // In chat mode, always respond. Otherwise, respond if text looks like a question.
      const text = newSegment.text.trim();
      const looksLikeQuestion =
        text.endsWith("?") ||
        /^(what|who|how|why|when|where|which|can|could|would|should|is|are|do|does|did|will|tell|explain|describe|show)\b/i.test(text);

      const shouldRespond = this.chatMode || looksLikeQuestion;
      const fullQuestion = context.temporal
        ? `${context.temporal} ${text}`
        : text;

      const result: IntentDetectionResult = {
        shouldRespond,
        fullQuestion,
        confidence: shouldRespond ? 0.9 : 0.3,
      };

      if (result.shouldRespond && result.confidence > this.confidenceThreshold) {
        // Calculate response position (below the question)
        result.responsePosition = {
          x: newSegment.bounds.x,
          y: newSegment.bounds.y + newSegment.bounds.height + 30,
        };

        // Trigger callback
        if (this.onIntentDetected) {
          await this.onIntentDetected(result);

          // Add to conversation history
          this.conversationHistory.push({
            question: result.fullQuestion,
            answer: "", // Will be filled when response is generated
            timestamp: Date.now(),
          });
        }
      }
    } catch (error) {
      console.error("Intent detection failed:", error);
    } finally {
      this.isProcessingIntent = false;
    }
  }

  /**
   * Build context window for intent detection
   */
  private buildContextWindow(
    currentSegment: RecognitionSegment
  ): ContextWindow {
    const now = Date.now();

    // Temporal context: recent text
    const temporalSegments = this.recognitionBuffer
      .filter((seg) => now - seg.timestamp < this.CONTEXT_WINDOW_TIME)
      .map((seg) => seg.text)
      .join(" ");

    // Spatial context: nearby text
    const spatialSegments = this.getTextNearPosition(currentSegment.bounds);

    // Conversation context: recent Q&As
    const conversationContext = this.conversationHistory
      .slice(-this.conversationHistoryLimit)
      .map((conv) => `Q: ${conv.question}\nA: ${conv.answer}`)
      .join("\n\n");

    return {
      temporal: temporalSegments,
      spatial: spatialSegments,
      conversation: conversationContext,
    };
  }

  /**
   * Get text near a specific position
   */
  private getTextNearPosition(targetBounds: StrokeBounds): string {
    return this.recognitionBuffer
      .filter((segment) => {
        // Calculate distance between bounds centers
        const segCenterX = segment.bounds.x + segment.bounds.width / 2;
        const segCenterY = segment.bounds.y + segment.bounds.height / 2;
        const targetCenterX = targetBounds.x + targetBounds.width / 2;
        const targetCenterY = targetBounds.y + targetBounds.height / 2;

        const distance = Math.sqrt(
          Math.pow(segCenterX - targetCenterX, 2) +
            Math.pow(segCenterY - targetCenterY, 2)
        );

        return distance < this.SPATIAL_PROXIMITY_THRESHOLD;
      })
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((seg) => seg.text)
      .join(" ");
  }

  /**
   * Update conversation history with AI response
   */
  updateLastResponse(answer: string) {
    if (this.conversationHistory.length > 0) {
      this.conversationHistory[this.conversationHistory.length - 1].answer =
        answer;
    }
  }

  /**
   * Trim buffer to prevent memory issues
   */
  private trimBuffer() {
    if (this.recognitionBuffer.length > this.MAX_BUFFER_SIZE) {
      // Keep most recent segments
      this.recognitionBuffer = this.recognitionBuffer.slice(
        -this.MAX_BUFFER_SIZE
      );
    }
  }

  /**
   * Clear all recognition data
   */
  async clear() {
    this.recognitionBuffer = [];
    this.conversationHistory = [];
    if (this.recognitionTimer) {
      clearTimeout(this.recognitionTimer);
      this.recognitionTimer = null;
    }
    await this.synchronizer.clear();
  }

  /**
   * Get current recognition state (for debugging)
   */
  getState() {
    return {
      recognizedSegments: this.recognitionBuffer.length,
      conversationHistory: this.conversationHistory.length,
      lastText: this.lastRecognizedText,
      lastPosition: this.lastRecognizedPosition,
    };
  }

  /**
   * Destroy the manager
   */
  destroy() {
    if (this.recognitionTimer) {
      clearTimeout(this.recognitionTimer);
    }
    this.synchronizer.destroy();
  }
}
