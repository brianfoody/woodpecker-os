import { handwritingRecognitionService } from './handwriting-recognition-simple';
import { 
  TLDrawStroke, 
  convertMultipleStrokes, 
  calculateStrokeBounds, 
  groupRelatedStrokes,
  StrokeBounds 
} from './stroke-converter';

export interface RecognitionSegment {
  text: string;
  timestamp: number;
  bounds: StrokeBounds;
  strokeIds: string[];
}

export interface IntentDetectionResult {
  shouldRespond: boolean;
  fullQuestion: string;
  confidence: number;
  responsePosition?: { x: number; y: number };
}

export interface ContextWindow {
  temporal: string;  // Recent text (time-based)
  spatial: string;   // Nearby text (position-based)
  conversation: string; // Previous Q&A context
}

export class HandwritingContextManager {
  private recognitionBuffer: RecognitionSegment[] = [];
  private pendingStrokes: Map<string, TLDrawStroke> = new Map();
  private recognitionTimer: NodeJS.Timeout | null = null;
  private conversationHistory: Array<{ question: string; answer: string; timestamp: number }> = [];
  private isProcessingIntent = false;
  
  // Configuration
  private readonly DEBOUNCE_DELAY = 250; // ms
  private readonly CONTEXT_WINDOW_TIME = 30000; // 30 seconds
  private readonly SPATIAL_PROXIMITY_THRESHOLD = 200; // pixels
  private readonly MAX_BUFFER_SIZE = 100; // Max segments to keep
  
  // Callbacks
  public onIntentDetected?: (result: IntentDetectionResult) => Promise<void>;
  
  constructor() {
    // Initialize recognition service
    handwritingRecognitionService.initialize().catch(error => {
      console.error('Failed to initialize handwriting recognition:', error);
    });
  }

  /**
   * Add a new stroke for recognition
   */
  addStroke(stroke: TLDrawStroke) {
    this.pendingStrokes.set(stroke.id, stroke);
    this.scheduleRecognition();
  }

  /**
   * Update an existing stroke
   */
  updateStroke(stroke: TLDrawStroke) {
    this.pendingStrokes.set(stroke.id, stroke);
    this.scheduleRecognition();
  }

  /**
   * Remove a stroke
   */
  removeStroke(strokeId: string) {
    this.pendingStrokes.delete(strokeId);
    // Also remove from recognition buffer
    this.recognitionBuffer = this.recognitionBuffer.filter(
      segment => !segment.strokeIds.includes(strokeId)
    );
  }

  /**
   * Schedule recognition with debouncing
   */
  private scheduleRecognition() {
    if (this.recognitionTimer) {
      clearTimeout(this.recognitionTimer);
    }
    
    this.recognitionTimer = setTimeout(() => {
      this.recognizePendingStrokes();
    }, this.DEBOUNCE_DELAY);
  }

  /**
   * Perform recognition on pending strokes
   */
  private async recognizePendingStrokes() {
    if (this.pendingStrokes.size === 0) return;
    
    const strokes = Array.from(this.pendingStrokes.values());
    
    // Group related strokes (likely same word/line)
    const strokeGroups = groupRelatedStrokes(strokes);
    
    for (const group of strokeGroups) {
      try {
        // Convert to iInk format
        const pointerEvents = convertMultipleStrokes(group);
        
        // Perform recognition
        const result = await handwritingRecognitionService.recognizeStrokes(pointerEvents);
        
        if (result && result.text) {
          // Calculate bounds for the group
          const bounds = calculateStrokeBounds(group);
          
          // Add to recognition buffer
          const segment: RecognitionSegment = {
            text: result.text,
            timestamp: Date.now(),
            bounds,
            strokeIds: group.map(s => s.id),
          };
          
          this.recognitionBuffer.push(segment);
          this.trimBuffer();
          
          // Clear recognized strokes from pending
          group.forEach(stroke => this.pendingStrokes.delete(stroke.id));
          
          // Check for intent with context
          await this.checkIntentWithContext(segment);
        }
      } catch (error) {
        console.error('Recognition failed for stroke group:', error);
      }
    }
  }

  /**
   * Check if the user's input indicates they want an AI response
   */
  private async checkIntentWithContext(newSegment: RecognitionSegment) {
    // Prevent concurrent intent processing
    if (this.isProcessingIntent) {
      console.log('⏳ Already processing intent, skipping...');
      return;
    }
    
    this.isProcessingIntent = true;
    
    // Build context window
    const context = this.buildContextWindow(newSegment);
    
    try {
      const response = await fetch('/api/detect-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current: newSegment.text,
          temporal: context.temporal,
          spatial: context.spatial,
          conversation: context.conversation,
        }),
      });
      
      if (!response.ok) throw new Error(`Intent detection failed: ${response.status}`);
      
      const result: IntentDetectionResult = await response.json();
      
      if (result.shouldRespond && result.confidence > 0.7) {
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
            answer: '', // Will be filled when response is generated
            timestamp: Date.now(),
          });
        }
      }
    } catch (error) {
      console.error('Intent detection failed:', error);
    } finally {
      this.isProcessingIntent = false;
    }
  }

  /**
   * Build context window for intent detection
   */
  private buildContextWindow(currentSegment: RecognitionSegment): ContextWindow {
    const now = Date.now();
    
    // Temporal context: recent text
    const temporalSegments = this.recognitionBuffer
      .filter(seg => now - seg.timestamp < this.CONTEXT_WINDOW_TIME)
      .map(seg => seg.text)
      .join(' ');
    
    // Spatial context: nearby text
    const spatialSegments = this.getTextNearPosition(currentSegment.bounds);
    
    // Conversation context: recent Q&As
    const conversationContext = this.conversationHistory
      .slice(-3)
      .map(conv => `Q: ${conv.question}\nA: ${conv.answer}`)
      .join('\n\n');
    
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
      .filter(segment => {
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
      .map(seg => seg.text)
      .join(' ');
  }

  /**
   * Update conversation history with AI response
   */
  updateLastResponse(answer: string) {
    if (this.conversationHistory.length > 0) {
      this.conversationHistory[this.conversationHistory.length - 1].answer = answer;
    }
  }

  /**
   * Trim buffer to prevent memory issues
   */
  private trimBuffer() {
    if (this.recognitionBuffer.length > this.MAX_BUFFER_SIZE) {
      // Keep most recent segments
      this.recognitionBuffer = this.recognitionBuffer.slice(-this.MAX_BUFFER_SIZE);
    }
  }

  /**
   * Clear all recognition data
   */
  clear() {
    this.recognitionBuffer = [];
    this.pendingStrokes.clear();
    this.conversationHistory = [];
    if (this.recognitionTimer) {
      clearTimeout(this.recognitionTimer);
      this.recognitionTimer = null;
    }
  }

  /**
   * Get current recognition state (for debugging)
   */
  getState() {
    return {
      pendingStrokes: this.pendingStrokes.size,
      recognizedSegments: this.recognitionBuffer.length,
      conversationHistory: this.conversationHistory.length,
    };
  }
}