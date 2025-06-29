import { NextRequest, NextResponse } from 'next/server';

// This would integrate with Twilio in production
// For now, we'll simulate SMS functionality

interface Message {
  id: string;
  recipient: string;
  content: string;
  timestamp: number;
  status: 'sending' | 'sent' | 'delivered' | 'failed';
}

// In-memory storage (use database in production)
let messages: Message[] = [];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { recipient, content } = body;

    // Validate input
    if (!recipient || typeof recipient !== 'string') {
      return NextResponse.json(
        { error: 'Recipient is required' },
        { status: 400 }
      );
    }

    if (!content || typeof content !== 'string') {
      return NextResponse.json(
        { error: 'Message content is required' },
        { status: 400 }
      );
    }

    // Create new message
    const message: Message = {
      id: generateMessageId(),
      recipient,
      content,
      timestamp: Date.now(),
      status: 'sending',
    };

    // Simulate sending message (replace with Twilio integration)
    await simulateSendMessage(message);

    messages.push(message);

    return NextResponse.json({
      success: true,
      message: {
        id: message.id,
        recipient: message.recipient,
        status: message.status,
        timestamp: message.timestamp,
      },
    });

  } catch (error) {
    console.error('Messages API error:', error);
    return NextResponse.json(
      { error: 'Failed to send message' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    const paginatedMessages = messages
      .slice(offset, offset + limit)
      .map(msg => ({
        id: msg.id,
        recipient: msg.recipient,
        content: msg.content,
        timestamp: msg.timestamp,
        status: msg.status,
      }));

    return NextResponse.json({
      messages: paginatedMessages,
      total: messages.length,
      limit,
      offset,
    });

  } catch (error) {
    console.error('Messages GET API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch messages' },
      { status: 500 }
    );
  }
}

// Simulate message sending (replace with Twilio)
async function simulateSendMessage(message: Message): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => {
      // Simulate success/failure
      const success = Math.random() > 0.1; // 90% success rate
      message.status = success ? 'sent' : 'failed';
      
      // Simulate delivery confirmation after sending
      if (success) {
        setTimeout(() => {
          message.status = 'delivered';
        }, 2000);
      }
      
      resolve();
    }, 1000);
  });
}

function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}