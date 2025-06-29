import { NextRequest, NextResponse } from 'next/server';
import { summariseImage } from '@/lib/ai';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { base64PngImage } = body;

    if (!base64PngImage) {
      return NextResponse.json(
        { error: 'base64PngImage is required' },
        { status: 400 }
      );
    }

    const result = await summariseImage({ base64PngImage });
    
    return NextResponse.json({ description: result });
  } catch (error) {
    console.error('Error in summarise-image API:', error);
    return NextResponse.json(
      { error: 'Failed to process image' },
      { status: 500 }
    );
  }
}