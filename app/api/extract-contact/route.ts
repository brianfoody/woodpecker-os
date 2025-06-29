import { NextRequest, NextResponse } from "next/server";
import { extractContact } from "@/lib/ai";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { image_summary } = body;

    if (!image_summary) {
      return NextResponse.json(
        { success: false, error: "Missing image_summary parameter" },
        { status: 400 }
      );
    }

    console.log("🤖 Extract contact API called with summary:", image_summary.substring(0, 100) + "...");

    const contact = await extractContact({ image_summary });

    console.log("📱 Contact extracted successfully:", contact);

    return NextResponse.json({
      success: true,
      contact,
    });
  } catch (error) {
    console.error("❌ Extract contact API error:", error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to extract contact" 
      },
      { status: 500 }
    );
  }
}