import { NextRequest, NextResponse } from 'next/server';
import { processAIRequest } from '@/lib/ai-processing';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { content, actionType, context } = body;

    // Validate input
    if (!content || typeof content !== 'string') {
      return NextResponse.json(
        { error: 'Content is required and must be a string' },
        { status: 400 }
      );
    }

    if (!actionType || !['ask_ai', 'send_message', 'add_contact'].includes(actionType)) {
      return NextResponse.json(
        { error: 'Valid actionType is required' },
        { status: 400 }
      );
    }

    // Process AI request
    const result = await processAIRequest(content, actionType, context);

    return NextResponse.json(result);

  } catch (error) {
    console.error('AI API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ 
    message: 'AI API endpoint is running',
    supportedActions: ['ask_ai', 'send_message', 'add_contact'],
    timestamp: Date.now()
  });
}