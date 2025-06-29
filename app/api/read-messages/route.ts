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
    const { lastRetrievedAt } = body;

    console.log(
      "📱 Read messages API called with lastRetrievedAt:",
      lastRetrievedAt
    );

    // Parse the lastRetrievedAt date if provided
    let dateAfter: Date | undefined;
    if (lastRetrievedAt) {
      dateAfter = new Date(lastRetrievedAt);
      if (isNaN(dateAfter.getTime())) {
        return NextResponse.json(
          { success: false, error: "Invalid lastRetrievedAt date format" },
          { status: 400 }
        );
      }
    }

    // Fetch messages sent to the toll-free number
    const twilioParams: any = {
      to: tollFreeNumber,
      limit: 50, // Get more messages to ensure we don't miss any
    };

    // Add date filter if provided
    if (dateAfter) {
      twilioParams.dateSentAfter = dateAfter;
    }

    const messages = await client.messages.list(twilioParams);

    console.log(`📱 Retrieved ${messages.length} total messages from Twilio`);

    // Filter for inbound messages and convert to SmartMessage format
    let inboundMessages: SmartMessage[] = messages
      .filter((msg) => msg.direction === "inbound")
      .map((msg) => ({
        name: "", // Will be filled in by matching with contacts
        phoneNumber: msg.from,
        text: msg.body,
        sentAt: new Date(msg.dateSent),
        status: msg.status,
      }))
      .sort((a, b) => (a.sentAt?.getTime() || 0) - (b.sentAt?.getTime() || 0)); // Sort by date ascending

    console.log(`📱 Found ${inboundMessages.length} total inbound messages`);

    // Additional client-side filtering to ensure we only return NEW messages
    if (dateAfter) {
      const filterTimestamp = dateAfter.getTime();
      inboundMessages = inboundMessages.filter((msg) => {
        const messageTimestamp = msg.sentAt?.getTime() || 0;
        return messageTimestamp > filterTimestamp;
      });

      console.log(
        `📱 After client-side filtering: ${
          inboundMessages.length
        } new messages (after ${dateAfter.toISOString()})`
      );
    }

    // Calculate the new lastRetrievedAt timestamp (latest message date or current time)
    const newLastRetrievedAt =
      inboundMessages.length > 0
        ? inboundMessages[inboundMessages.length - 1].sentAt
        : new Date();

    return NextResponse.json({
      success: true,
      messages: inboundMessages,
      lastRetrievedAt: newLastRetrievedAt,
    });
  } catch (error) {
    console.error("❌ Read messages API error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to read messages",
      },
      { status: 500 }
    );
  }
}