// Simplified handwriting recognition service
// This is a placeholder implementation until we properly configure iink-ts

export interface RecognitionResult {
  text: string;
  exports?: any;
  timestamp: number;
}

export class HandwritingRecognitionService {
  private isInitialized = false;
  private mockPhrases = [
    "What is the AAPL stock price?",
    "How tall is the Eiffel Tower?",
    "What's the weather like today?",
    "Calculate 15% tip on $45",
    "When was Shakespeare born?",
    "What is the population of Tokyo?",
    "How many calories in an apple?",
    "What time is it in London?",
    "Who won the World Cup in 2022?",
    "What is the speed of light?",
  ];
  private phraseIndex = 0;

  async initialize() {
    if (this.isInitialized) return;
    
    // For now, just mark as initialized
    // In production, this would initialize the iink-ts SDK
    this.isInitialized = true;
    console.log("✅ HandwritingRecognitionService initialized (placeholder mode)");
  }

  async recognizeStrokes(pointerEvents: any[]): Promise<RecognitionResult | null> {
    if (!this.isInitialized) {
      console.warn("HandwritingRecognitionService not initialized");
      return null;
    }

    // Placeholder implementation
    // In production, this would send strokes to MyScript API
    console.log(`📝 Would recognize ${pointerEvents.length} pointer events`);
    
    // For demo purposes, you can also just return empty text to disable auto-responses
    // return null; // Uncomment this line to disable mock recognition
    
    // Or cycle through different mock phrases
    const text = this.mockPhrases[this.phraseIndex];
    this.phraseIndex = (this.phraseIndex + 1) % this.mockPhrases.length;
    
    console.log(`📝 Mock recognition result: "${text}"`);
    
    return {
      text,
      exports: {},
      timestamp: Date.now(),
    };
  }

  destroy() {
    this.isInitialized = false;
  }
}

// Singleton instance
export const handwritingRecognitionService = new HandwritingRecognitionService();