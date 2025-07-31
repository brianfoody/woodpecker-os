import { NextRequest, NextResponse } from 'next/server';
import { askAI } from '@/lib/ai';

export async function POST(request: NextRequest) {
  try {
    const { current, temporal, spatial, conversation } = await request.json();

    // Validate input
    if (!current || typeof current !== 'string') {
      return NextResponse.json(
        { error: 'Current text is required' },
        { status: 400 }
      );
    }

    // Build context-aware prompt
    const prompt = `You are analyzing handwritten notes to determine if the user is asking a question that needs an immediate answer.

Current text (just written): "${current}"
Recent context (last 30 seconds): "${temporal || ''}"
Nearby text: "${spatial || ''}"
Previous conversation:
${conversation || 'No previous conversation'}

Analyze the current text WITH its context to determine:
1. Is the user asking a question that expects an immediate answer?
2. What is the complete question including necessary context?
3. How confident are you (0-1) that they want an answer now?

Important considerations:
- If current text references something from context (like "what is the price?" referring to "AAPL" mentioned earlier), include that in the full question
- Look for question indicators: "?", "what", "how", "when", "why", "where", "is", "are", "can", "will", "should"
- Consider if they're just making notes vs. asking for information
- Statements like "I need to check X later" are NOT immediate questions
- "Actually, what is X?" or "X?" are immediate questions

Examples:
- Current: "what is the price right now?" + Context: "AAPL stock" = { shouldRespond: true, fullQuestion: "What is the current AAPL stock price?", confidence: 0.95 }
- Current: "remind me to check weather" = { shouldRespond: false, fullQuestion: "", confidence: 0.1 }
- Current: "?" + Context: "Eiffel Tower height" = { shouldRespond: true, fullQuestion: "What is the height of the Eiffel Tower?", confidence: 0.85 }
- Current: "how tall is it?" + Nearby: "Empire State Building" = { shouldRespond: true, fullQuestion: "How tall is the Empire State Building?", confidence: 0.9 }

Return ONLY valid JSON in this format:
{ "shouldRespond": boolean, "fullQuestion": string, "confidence": number }`;

    // Get AI analysis
    const response = await askAI({ image_summary: prompt });
    
    // Parse AI response
    let result;
    try {
      // Extract JSON from response (AI might include extra text)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in AI response');
      }
      result = JSON.parse(jsonMatch[0]);
    } catch {
      console.error('Failed to parse AI response:', response);
      // Fallback response
      result = {
        shouldRespond: false,
        fullQuestion: '',
        confidence: 0,
      };
    }

    // Validate result structure
    if (typeof result.shouldRespond !== 'boolean') result.shouldRespond = false;
    if (typeof result.fullQuestion !== 'string') result.fullQuestion = '';
    if (typeof result.confidence !== 'number') result.confidence = 0;

    // Clamp confidence between 0 and 1
    result.confidence = Math.max(0, Math.min(1, result.confidence));

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in detect-intent API:', error);
    return NextResponse.json(
      { 
        error: 'Failed to detect intent',
        shouldRespond: false,
        fullQuestion: '',
        confidence: 0,
      },
      { status: 500 }
    );
  }
}