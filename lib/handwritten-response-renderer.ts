import { Editor, createShapeId, TLShapeId } from 'tldraw';

export interface ResponsePosition {
  x: number;
  y: number;
}

export interface TypewriterOptions {
  speed?: number; // ms per character
  font?: string;
  size?: 's' | 'm' | 'l' | 'xl';
  color?: string;
}

export class HandwrittenResponseRenderer {
  private editor: Editor;
  private currentCursorId: TLShapeId | null = null;
  private currentResponseId: TLShapeId | null = null;
  
  constructor(editor: Editor) {
    this.editor = editor;
  }

  /**
   * Show a blinking cursor at the specified position
   */
  async showTypingCursor(position: ResponsePosition): Promise<TLShapeId> {
    // Remove any existing cursor
    if (this.currentCursorId) {
      try {
        this.editor.deleteShape(this.currentCursorId);
      } catch (error) {
        console.warn('Failed to delete previous cursor:', error);
      }
    }

    // Create cursor shape (a simple line that blinks)
    const cursorId = createShapeId();
    this.currentCursorId = cursorId;

    this.editor.createShapes([{
      id: cursorId,
      type: 'geo',
      x: position.x,
      y: position.y,
      props: {
        geo: 'rectangle',
        w: 2,
        h: 20,
        fill: 'solid',
        color: 'black',
        dash: 'draw',
        size: 's',
      },
    }]);

    // Start blinking animation
    this.startCursorBlinking(cursorId);

    return cursorId;
  }

  /**
   * Animate cursor blinking
   */
  private startCursorBlinking(cursorId: TLShapeId) {
    let visible = true;
    const blinkInterval = setInterval(() => {
      try {
        const shape = this.editor.getShape(cursorId);
        if (!shape) {
          clearInterval(blinkInterval);
          return;
        }

        this.editor.updateShape({
          id: cursorId,
          type: 'geo',
          props: {
            ...shape.props,
            color: visible ? 'black' : 'grey',
          },
        });

        visible = !visible;
      } catch {
        clearInterval(blinkInterval);
      }
    }, 500); // Blink every 500ms

    // Store interval for cleanup
    (this as any).cursorBlinkInterval = blinkInterval;
  }

  /**
   * Hide the typing cursor
   */
  hideCursor() {
    if (this.currentCursorId) {
      try {
        this.editor.deleteShape(this.currentCursorId);
        this.currentCursorId = null;
        
        // Clear blinking interval
        if ((this as any).cursorBlinkInterval) {
          clearInterval((this as any).cursorBlinkInterval);
          delete (this as any).cursorBlinkInterval;
        }
      } catch (error) {
        console.warn('Failed to hide cursor:', error);
      }
    }
  }

  /**
   * Render AI response with typewriter effect
   */
  async renderResponse(
    text: string,
    position: ResponsePosition,
    options: TypewriterOptions = {}
  ): Promise<TLShapeId> {
    const {
      speed = 30,
      font = 'sans',
      size = 'm',
      color = 'black',
    } = options;

    // Hide cursor
    this.hideCursor();

    // Create handwritten text shape for response
    const responseId = createShapeId();
    this.currentResponseId = responseId;

    this.editor.createShapes([{
      id: responseId,
      type: 'handwritten-text',
      x: position.x,
      y: position.y,
      props: {
        text: '',
        font: font as 'kalam' | 'caveat' | 'sans',
        size,
        color,
        autoSize: true,
        w: 500,
        h: 200,
      },
    }]);

    // Animate typing
    await this.animateTyping(responseId, text, speed);

    // Position cursor for next input
    this.positionForNextInput(responseId);

    return responseId;
  }

  /**
   * Animate typing effect
   */
  private async animateTyping(
    shapeId: TLShapeId,
    text: string,
    speed: number
  ): Promise<void> {
    return new Promise((resolve) => {
      let currentIndex = 0;

      const typeInterval = setInterval(() => {
        if (currentIndex > text.length) {
          clearInterval(typeInterval);
          resolve();
          return;
        }

        try {
          const currentText = text.substring(0, currentIndex);
          
          this.editor.updateShape({
            id: shapeId,
            type: 'handwritten-text',
            props: {
              text: currentText,
            },
          });

          currentIndex++;
        } catch (error) {
          console.error('Error during typing animation:', error);
          clearInterval(typeInterval);
          resolve();
        }
      }, speed);
    });
  }

  /**
   * Position cursor for next user input
   */
  private positionForNextInput(previousShapeId: TLShapeId) {
    try {
      const shape = this.editor.getShape(previousShapeId);
      if (!shape || shape.type !== 'handwritten-text') return;

      // Get shape bounds
      const bounds = this.editor.getShapeGeometry(shape).bounds;
      
      // Position cursor below and slightly to the left (for new line)
      const nextPosition: ResponsePosition = {
        x: shape.x - 20, // Slightly to the left for natural writing flow
        y: shape.y + bounds.height + 40, // Below with some padding
      };

      // You could emit this position or store it for the next input
      // For now, we'll just log it
      console.log('Next input position:', nextPosition);
    } catch (error) {
      console.error('Failed to position for next input:', error);
    }
  }

  /**
   * Create a quick response without animation
   */
  quickResponse(
    text: string,
    position: ResponsePosition,
    options: TypewriterOptions = {}
  ): TLShapeId {
    const responseId = createShapeId();

    this.editor.createShapes([{
      id: responseId,
      type: 'handwritten-text',
      x: position.x,
      y: position.y,
      props: {
        text,
        font: (options.font || 'sans') as 'kalam' | 'caveat' | 'sans',
        size: options.size || 'm',
        color: options.color || 'black',
        autoSize: true,
        w: 400,
        h: 50,
      },
    }]);

    return responseId;
  }

  /**
   * Clear all responses (for cleanup)
   */
  clearResponses() {
    this.hideCursor();
    this.currentResponseId = null;
  }
}