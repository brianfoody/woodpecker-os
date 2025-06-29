import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { SmartMessage } from "@/lib/models";

// Get Twilio credentials from environment variables
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const tollFreeNumber = process.env.TWILIO_PHONE_NUMBER;

// Validate that all required environment variables are present
if (!accountSid || !authToken || !tollFreeNumber) {
  console.error("❌ Missing required Twilio environment variables");
  console.error("Required: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER");
}

// Initialize Twilio client only if credentials are available
const client = accountSid && authToken ? twilio(accountSid, authToken) : null;

export async function POST(request: NextRequest) {
  try {
    // Check if Twilio is properly configured
    if (!client || !tollFreeNumber) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Twilio is not properly configured. Please check environment variables." 
        },
        { status: 500 }
      );
    }

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