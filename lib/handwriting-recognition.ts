// NOTE: This file contains the full iink-ts integration
// Currently using handwriting-recognition-simple.ts as a placeholder
// due to API compatibility issues with iink-ts v3
// To use this file:
// 1. Ensure you have MyScript API keys in .env
// 2. Check iink-ts documentation for v3 API changes
// 3. Update the Editor initialization code below

import * as iink from "iink-ts";

export interface RecognitionResult {
  text: string;
  exports?: any;
  timestamp: number;
}

export class HandwritingRecognitionService {
  private editor: any = null;
  private isInitialized = false;
  private offscreenElement: HTMLElement | null = null;

  async initialize() {
    if (this.isInitialized) return;

    try {
      // Create an offscreen div element for the editor
      this.offscreenElement = document.createElement('div');
      this.offscreenElement.style.position = 'absolute';
      this.offscreenElement.style.left = '-9999px';
      this.offscreenElement.style.width = '800px';
      this.offscreenElement.style.height = '600px';
      document.body.appendChild(this.offscreenElement);

      // Create configuration for recognition
      const configuration = {
        server: {
          scheme: 'https',
          host: 'cloud.myscript.com',
          applicationKey: process.env.NEXT_PUBLIC_MYSCRIPT_APP_KEY || '',
          hmacKey: process.env.NEXT_PUBLIC_MYSCRIPT_HMAC_KEY || '',
        },
        recognition: {
          type: 'TEXT',
          protocol: 'WEBSOCKET',
          lang: 'en_US',
        },
        rendering: {
          renderer: 'canvas',
        },
      };

      // Initialize editor with DOM element
      const Editor = (iink as any).Editor;
      this.editor = new Editor(this.offscreenElement, configuration);
      
      // Wait for editor to be ready
      await new Promise((resolve) => {
        this.editor.events.addEventListener('loaded', resolve, { once: true });
      });
      
      this.isInitialized = true;
      console.log("✅ HandwritingRecognitionService initialized");
    } catch (error) {
      console.error(
        "❌ Failed to initialize HandwritingRecognitionService:",
        error
      );
      throw error;
    }
  }

  async recognizeStrokes(
    pointerEvents: any[]
  ): Promise<RecognitionResult | null> {
    if (!this.editor || !this.isInitialized) {
      console.warn("HandwritingRecognitionService not initialized");
      return null;
    }

    try {
      // Clear previous content
      await this.editor.clear();

      // Add pointer events to the editor
      for (const event of pointerEvents) {
        await this.editor.pointerEvent(event);
      }

      // Wait for recognition to complete
      await this.editor.waitForIdle();

      // Get exports (recognition results)
      const exports = await this.editor.export_(['text/plain']);

      // Extract plain text
      const text = exports?.['text/plain'] || "";

      return {
        text: text.trim(),
        exports,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error("❌ Recognition failed:", error);
      return null;
    }
  }

  destroy() {
    if (this.editor) {
      this.editor.close();
      this.editor = null;
    }
    if (this.offscreenElement && this.offscreenElement.parentNode) {
      this.offscreenElement.parentNode.removeChild(this.offscreenElement);
      this.offscreenElement = null;
    }
    this.isInitialized = false;
  }
}

// Singleton instance
export const handwritingRecognitionService = new HandwritingRecognitionService();
