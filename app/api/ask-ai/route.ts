import { NextRequest, NextResponse } from "next/server";
import { askAI } from "@/lib/ai";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { image_summary, task } = body;

    if (!image_summary) {
      return NextResponse.json(
        { error: "image_summary is required" },
        { status: 400 }
      );
    }

    console.log(
      "🤖 API: Calling askAI with summary:",
      image_summary.substring(0, 100) + "..."
    );
    console.log("🎯 API: Task:", task);

    const result = await askAI({
      image_summary,
    });

    console.log("✅ API: askAI completed successfully");

    return NextResponse.json({
      response: result,
      success: true,
    });
  } catch (error) {
    console.error("❌ Error in ask-ai API:", error);
    return NextResponse.json(
      {
        error: "Failed to process AI request",
        success: false,
      },
      { status: 500 }
    );
  }
}
