import { NextRequest, NextResponse } from "next/server";
import { extractSmartMessage } from "@/lib/ai";
import { SmartContact } from "@/lib/models";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { image_summary, contacts } = body;

    if (!image_summary) {
      return NextResponse.json(
        { success: false, error: "Missing image_summary parameter" },
        { status: 400 }
      );
    }

    if (!contacts || !Array.isArray(contacts)) {
      return NextResponse.json(
        { success: false, error: "Missing or invalid contacts parameter" },
        { status: 400 }
      );
    }

    console.log("💬 Extract message API called with summary:", image_summary.substring(0, 100) + "...");
    console.log("💬 Available contacts:", contacts.length);

    const message = await extractSmartMessage({ 
      image_summary, 
      contacts: contacts as SmartContact[] 
    });

    console.log("💬 Message extracted successfully:", {
      name: message.name,
      phoneNumber: message.phoneNumber,
      text: message.text.substring(0, 50) + "...",
    });

    return NextResponse.json({
      success: true,
      message,
    });
  } catch (error) {
    console.error("❌ Extract message API error:", error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to extract message" 
      },
      { status: 500 }
    );
  }
}