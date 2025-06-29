export const HOLD_DURATION = 500; // 500ms hold to trigger
export const MOVEMENT_THRESHOLD = 10; // pixels - movement above this resets hold timer

export interface HoldDetectionState {
  holdTimer: NodeJS.Timeout | null;
  currentDrawShape: any;
  isHolding: boolean;
  holdDuration: number;
  lastPosition: { x: number; y: number } | null;
  movementThreshold: number;
  holdPosition: { x: number; y: number } | null; // Position where hold was triggered
}

export class HoldDetector {
  private state: HoldDetectionState;
  private onHoldCallback: ((shape: any, holdPosition: { x: number; y: number }) => void) | null = null;

  constructor(holdDuration: number = HOLD_DURATION, movementThreshold: number = MOVEMENT_THRESHOLD) {
    this.state = {
      holdTimer: null,
      currentDrawShape: null,
      isHolding: false,
      holdDuration,
      lastPosition: null,
      movementThreshold,
      holdPosition: null,
    };
  }

  setHoldCallback(callback: (shape: any, holdPosition: { x: number; y: number }) => void): void {
    this.onHoldCallback = callback;
  }

  /**
   * Calculate distance between two points
   */
  private calculateDistance(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Start hold timer
   */
  private startHoldTimer(shape: any): void {
    this.state.holdTimer = setTimeout(() => {
      if (
        this.state.currentDrawShape &&
        this.state.currentDrawShape.id === shape.id &&
        this.state.lastPosition
      ) {
        console.log("🔥 Hold detected! Triggering magic wand gesture!");
        this.state.isHolding = true;
        this.state.holdPosition = { ...this.state.lastPosition };

        // Clear the timer since it's completed
        this.state.holdTimer = null;

        if (this.onHoldCallback) {
          try {
            this.onHoldCallback(shape, this.state.holdPosition);
          } catch (error) {
            // Handle callback errors gracefully
            console.error("Error in hold callback:", error);
          }
        }
      }
    }, this.state.holdDuration);
  }

  startHoldDetection(shape: any, position?: { x: number; y: number }): void {
    // Clear any existing hold timer
    this.cancelHoldDetection();

    this.state.isHolding = false;
    this.state.currentDrawShape = shape;
    this.state.lastPosition = position || null;

    // Start hold timer
    this.startHoldTimer(shape);

    console.log(`⏱️ Hold timer started for ${this.state.holdDuration}ms`);
  }

  /**
   * Update position and reset timer if movement exceeds threshold
   */
  updatePosition(position: { x: number; y: number }): void {
    if (!this.state.currentDrawShape || this.state.isHolding) {
      return;
    }

    // If we have a previous position, check for significant movement
    if (this.state.lastPosition) {
      const distance = this.calculateDistance(this.state.lastPosition, position);
      
      if (distance > this.state.movementThreshold) {
        console.log(`🔄 Movement detected (${distance.toFixed(1)}px > ${this.state.movementThreshold}px), resetting hold timer`);
        
        // Reset the hold timer
        if (this.state.holdTimer) {
          clearTimeout(this.state.holdTimer);
        }
        
        // Update position and restart timer
        this.state.lastPosition = position;
        this.startHoldTimer(this.state.currentDrawShape);
      }
    } else {
      // First position update
      this.state.lastPosition = position;
    }
  }

  cancelHoldDetection(): void {
    if (this.state.holdTimer) {
      clearTimeout(this.state.holdTimer);
      this.state.holdTimer = null;
      console.log("❌ Hold detection cancelled");
    }
    this.state.currentDrawShape = null;
    this.state.isHolding = false;
    this.state.lastPosition = null;
    this.state.holdPosition = null;
  }

  isCurrentlyHolding(): boolean {
    return this.state.isHolding;
  }

  getCurrentShape(): any {
    return this.state.currentDrawShape;
  }

  getHoldPosition(): { x: number; y: number } | null {
    return this.state.holdPosition;
  }

  hasActiveTimer(): boolean {
    return this.state.holdTimer !== null;
  }

  // For testing purposes
  getState(): Readonly<HoldDetectionState> {
    return { ...this.state };
  }

  // For testing purposes - force trigger without waiting
  forceHoldTrigger(): void {
    if (this.state.currentDrawShape && this.state.lastPosition) {
      this.state.isHolding = true;
      this.state.holdPosition = { ...this.state.lastPosition };
      if (this.onHoldCallback) {
        try {
          this.onHoldCallback(this.state.currentDrawShape, this.state.holdPosition);
        } catch (error) {
          // Handle callback errors gracefully
          console.error("Error in forced hold callback:", error);
        }
      }
    }
  }

  // Cleanup method for proper memory management
  cleanup(): void {
    this.cancelHoldDetection();
    this.onHoldCallback = null;
  }
}
