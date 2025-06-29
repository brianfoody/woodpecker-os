import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { SmartMessage } from "@/lib/models";

// Twilio credentials - should be moved to environment variables in production
const accountSid = "ACb9b91dc848704f3c17431f2ad83d970d";
const authToken = "8a79d4e253465d1d6730c71ed3a4cc80";
const tollFreeNumber = "+18776915217";

// Initialize Twilio client
const client = twilio(accountSid, authToken);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message } = body as { message: SmartMessage };

    if (!message) {
      return NextResponse.json(
        { success: false, error: "Missing message parameter" },
        { status: 400 }
      );
    }

    if (!message.phoneNumber || !message.text || !message.name) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Message must include phoneNumber, text, and name" 
        },
        { status: 400 }
      );
    }

    console.log("📱 Send message API called:", {
      to: message.phoneNumber,
      name: message.name,
      text: message.text.substring(0, 50) + "...",
    });

    // Send message via Twilio
    const twilioMessage = await client.messages.create({
      from: tollFreeNumber,
      to: message.phoneNumber,
      body: message.text,
    });

    console.log("✅ Message sent successfully via Twilio:", {
      sid: twilioMessage.sid,
      status: twilioMessage.status,
      to: twilioMessage.to,
    });

    return NextResponse.json({
      success: true,
      result: {
        sid: twilioMessage.sid,
        status: twilioMessage.status,
        to: twilioMessage.to,
        body: twilioMessage.body,
      },
    });
  } catch (error) {
    console.error("❌ Send message API error:", error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to send message" 
      },
      { status: 500 }
    );
  }
}