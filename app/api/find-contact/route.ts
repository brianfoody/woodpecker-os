import { NextRequest, NextResponse } from "next/server";
import { findSmartContact } from "@/lib/ai";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { contacts, image_summary } = body;

    if (!image_summary) {
      return NextResponse.json(
        { success: false, error: "Image summary is required" },
        { status: 400 }
      );
    }

    if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Contacts array is required and must not be empty",
        },
        { status: 400 }
      );
    }

    console.log("🔍 Finding contact from image summary...");
    console.log("📋 Available contacts:", contacts.length);

    const contact = await findSmartContact({
      contacts,
      image_summary,
    });

    console.log("✅ Contact found:", contact);

    return NextResponse.json({
      success: true,
      contact,
    });
  } catch (error) {
    console.error("❌ Find contact API error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to find contact",
      },
      { status: 500 }
    );
  }
}
