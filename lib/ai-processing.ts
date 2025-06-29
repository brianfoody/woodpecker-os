import Groq from 'groq-sdk';

// Initialize Groq client for server-side use only
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || '',
});

export interface AIRequest {
  content: string;
  actionType: 'ask_ai' | 'send_message' | 'add_contact';
  context?: any;
}

export interface AIResponse {
  content: string;
  actionType: string;
  metadata?: any;
  success: boolean;
}

// Process AI requests through Groq
export async function processAIRequest(
  content: string, 
  actionType: 'ask_ai' | 'send_message' | 'add_contact',
  context?: any
): Promise<AIResponse> {
  try {
    let systemPrompt = '';
    let userPrompt = content;

    // Customize prompts based on action type
    switch (actionType) {
      case 'ask_ai':
        systemPrompt = `You are an intelligent AI assistant integrated into a drawing canvas interface. 
        Provide helpful, concise responses to user questions. Keep responses under 150 words unless more detail is specifically requested.
        Focus on being practical and actionable in your advice.`;
        break;
        
      case 'send_message':
        systemPrompt = `You are helping to compose a text message. 
        Make the message clear, friendly, and appropriate for SMS communication.
        Keep it concise but complete. If the user's input is unclear, ask for clarification.`;
        userPrompt = `Help me compose a text message: ${content}`;
        break;
        
      case 'add_contact':
        systemPrompt = `You are helping to create a contact entry. 
        Extract name, phone number, and any other relevant contact information from the user's input.
        Format the response as structured contact information.`;
        userPrompt = `Extract contact information from: ${content}`;
        break;
    }

    // Make API call to Groq
    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      model: 'llama-3.1-8b-instant',
      temperature: 0.7,
      max_tokens: 300,
      top_p: 1,
      stream: false,
    });

    const responseContent = completion.choices[0]?.message?.content || 'Sorry, I could not process your request.';

    return {
      content: responseContent,
      actionType,
      metadata: {
        model: 'llama-3.1-8b-instant',
        timestamp: Date.now(),
        context,
      },
      success: true,
    };

  } catch (error) {
    console.error('AI processing error:', error);
    
    return {
      content: getErrorMessage(actionType, error),
      actionType,
      metadata: {
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      },
      success: false,
    };
  }
}

// Generate appropriate error messages
function getErrorMessage(actionType: string, error: any): string {
  const baseMessage = 'I encountered an error processing your request.';
  
  switch (actionType) {
    case 'ask_ai':
      return `${baseMessage} Please try rephrasing your question or check your internet connection.`;
    case 'send_message':
      return `${baseMessage} I couldn't help compose your message right now.`;
    case 'add_contact':
      return `${baseMessage} I couldn't extract contact information from your input.`;
    default:
      return baseMessage;
  }
}

// Batch process multiple AI requests
export async function batchProcessAIRequests(
  requests: AIRequest[]
): Promise<AIResponse[]> {
  const promises = requests.map(req => 
    processAIRequest(req.content, req.actionType, req.context)
  );
  
  try {
    return await Promise.all(promises);
  } catch (error) {
    console.error('Batch processing error:', error);
    return requests.map(req => ({
      content: getErrorMessage(req.actionType, error),
      actionType: req.actionType,
      success: false,
    }));
  }
}

// Stream AI responses (for real-time updates)
export async function* streamAIResponse(
  content: string,
  actionType: 'ask_ai' | 'send_message' | 'add_contact'
): AsyncGenerator<string, void, unknown> {
  try {
    const systemPrompt = getSystemPrompt(actionType);
    
    const stream = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content }
      ],
      model: 'llama-3.1-8b-instant',
      temperature: 0.7,
      max_tokens: 300,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  } catch (error) {
    console.error('Streaming error:', error);
    yield getErrorMessage(actionType, error);
  }
}

function getSystemPrompt(actionType: string): string {
  switch (actionType) {
    case 'ask_ai':
      return `You are an intelligent AI assistant integrated into a drawing canvas interface. 
      Provide helpful, concise responses to user questions. Keep responses under 150 words unless more detail is specifically requested.
      Focus on being practical and actionable in your advice.`;
    case 'send_message':
      return `You are helping to compose a text message. 
      Make the message clear, friendly, and appropriate for SMS communication.
      Keep it concise but complete.`;
    case 'add_contact':
      return `You are helping to create a contact entry. 
      Extract name, phone number, and any other relevant contact information from the user's input.
      Format the response as structured contact information.`;
    default:
      return 'You are a helpful AI assistant.';
  }
}