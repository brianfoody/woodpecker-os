/**
 * WebSocket-based recognizer for iink-ts
 * Based on the official TLDraw example
 */

import {
  RecognizerWebSocketSSR,
  type TRecognizerWebSocketSSRConfiguration,
  type TRecognizerWebSocketSSRMessage,
  type TServerWebsocketConfiguration,
  type TRecognizerWebSocketSSRRecognitionConfiguration,
  type TScheme,
  type PartialDeep,
} from "iink-ts";

export class InkRecognizer extends RecognizerWebSocketSSR {
  private static instance: InkRecognizer | undefined;
  private static initializing = false;

  messages: TRecognizerWebSocketSSRMessage[] = [];
  private lastRecognizedText: string = "";
  private strokeCount: number = 0;

  constructor(config: TRecognizerWebSocketSSRConfiguration) {
    super(config);
  }

  protected messageCallback(message: MessageEvent<string>) {
    super.messageCallback(message);
    const websocketMessage: TRecognizerWebSocketSSRMessage = JSON.parse(
      message.data
    );
    this.messages.push(websocketMessage);
    console.log("📨 Received WebSocket message:", websocketMessage.type);
  }

  static async getRecognizer(
    viewWidth: number = 800,
    viewHeight: number = 600
  ): Promise<InkRecognizer> {
    if (InkRecognizer.instance) {
      return InkRecognizer.instance;
    }

    if (InkRecognizer.initializing) {
      // Wait for existing initialization to complete
      while (InkRecognizer.initializing) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return InkRecognizer.instance!;
    }

    InkRecognizer.initializing = true;

    try {
      const serverConfig: PartialDeep<TServerWebsocketConfiguration> = {
        scheme: "https" as TScheme,
        host: "cloud.myscript.com",
        applicationKey: process.env.NEXT_PUBLIC_MYSCRIPT_APP_KEY || "",
        hmacKey: process.env.NEXT_PUBLIC_MYSCRIPT_HMAC_KEY || "",
      };

      const recognitionConfig: PartialDeep<TRecognizerWebSocketSSRRecognitionConfiguration> =
        {
          type: "TEXT",
          lang: "en_US",
          export: {
            jiix: {
              strokes: true,
              text: {
                chars: true,
                words: true,
              },
            },
          },
        };

      const configuration: TRecognizerWebSocketSSRConfiguration = {
        server: serverConfig as TServerWebsocketConfiguration,
        recognition:
          recognitionConfig as TRecognizerWebSocketSSRRecognitionConfiguration,
      };

      console.log("🚀 Initializing WebSocket recognizer with config:", {
        host: serverConfig.host,
        hasAppKey: !!serverConfig.applicationKey,
        hasHmacKey: !!serverConfig.hmacKey,
        recognitionType: recognitionConfig.type,
      });

      const recognizerInstance = new InkRecognizer(configuration);
      InkRecognizer.instance = recognizerInstance;

      // Initialize with viewport dimensions
      const width = Math.max(100, viewWidth || 800);
      const height = Math.max(100, viewHeight || 600);

      console.log(
        `📐 Initializing recognizer with dimensions: ${width}x${height}`
      );
      await recognizerInstance.init(height, width);

      console.log("✅ WebSocket recognizer initialized successfully");

      return recognizerInstance;
    } catch (error) {
      console.error("❌ Failed to initialize recognizer:", error);
      throw error;
    } finally {
      InkRecognizer.initializing = false;
    }
  }

  // Override parent methods to maintain type compatibility

  destroy() {
    super.destroy();
    InkRecognizer.instance = undefined;
    InkRecognizer.initializing = false;
  }

  updateStrokeCount(count: number) {
    this.strokeCount = count;
  }

  extractNewText(fullText: string): string {
    // If we have previous text, try to extract only the new part
    if (this.lastRecognizedText && fullText.startsWith(this.lastRecognizedText)) {
      const newText = fullText.substring(this.lastRecognizedText.length).trim();
      console.log("📝 Extracted new text:", newText);
      return newText;
    }
    
    // Otherwise return the full text
    return fullText;
  }

  updateLastRecognizedText(text: string) {
    this.lastRecognizedText = text;
  }

  resetTextTracking() {
    this.lastRecognizedText = "";
    this.strokeCount = 0;
    console.log("🔄 Reset text tracking");
  }
}
