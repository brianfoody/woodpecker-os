import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { SmartMessage } from "@/lib/models";
import { classifyMessagePriority } from "@/lib/ai";

// Get Twilio credentials from environment variables
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const tollFreeNumber = process.env.TWILIO_PHONE_NUMBER;
const groqApiKey = process.env.GROQ_API_KEY;

// Validate that all required environment variables are present
if (!accountSid || !authToken || !tollFreeNumber || !!groqApiKey) {
  console.error("❌ Missing required Twilio environment variables");
  console.error(
    "Required: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER"
  );
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
          error:
            "Twilio is not properly configured. Please check environment variables.",
        },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { phoneNumber, limit = 10 } = body;

    if (!phoneNumber) {
      return NextResponse.json(
        { success: false, error: "Phone number is required" },
        { status: 400 }
      );
    }

    console.log(
      `📱 Read contact messages API called for ${phoneNumber}, limit: ${limit}`
    );

    // Fetch messages between the toll-free number and the contact's phone number
    const twilioParams: any = {
      limit: limit,
    };

    // Get both sent and received messages for this phone number
    const [sentMessages, receivedMessages] = await Promise.all([
      // Messages sent TO the contact (from our toll-free number)
      client.messages.list({
        ...twilioParams,
        from: tollFreeNumber,
        to: phoneNumber,
      }),
      // Messages received FROM the contact (to our toll-free number)
      client.messages.list({
        ...twilioParams,
        from: phoneNumber,
        to: tollFreeNumber,
      }),
    ]);

    console.log(
      `📱 Retrieved ${sentMessages.length} sent and ${receivedMessages.length} received messages`
    );

    // Combine and sort all messages by date
    const allMessages = [...sentMessages, ...receivedMessages].sort(
      (a, b) => new Date(a.dateSent).getTime() - new Date(b.dateSent).getTime()
    );

    // Convert to SmartMessage format
    const messages: SmartMessage[] = allMessages.map((msg) => ({
      name: "", // Will be filled in by the caller
      phoneNumber: msg.direction === "inbound" ? msg.from : msg.to,
      text: msg.body,
      sentAt: new Date(msg.dateSent),
      status: msg.status,
      direction: msg.direction as "inbound" | "outbound",
    }));

    // Classify message priorities for inbound messages only
    const classifiedMessages: SmartMessage[] = await Promise.all(
      messages.map((message) => {
        if (message.direction === "inbound") {
          return classifyMessagePriority({ message });
        }
        return message;
      })
    );

    return NextResponse.json({
      success: true,
      messages: classifiedMessages,
      totalCount: allMessages.length,
    });
  } catch (error) {
    console.error("❌ Read contact messages API error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to read contact messages",
      },
      { status: 500 }
    );
  }
}
