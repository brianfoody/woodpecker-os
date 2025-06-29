import { NextRequest, NextResponse } from "next/server";
import { chooseTaskForSelectedArea } from "@/lib/ai";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { task } = body;

    if (!task) {
      return NextResponse.json({ error: "task is required" }, { status: 400 });
    }

    const result = await chooseTaskForSelectedArea({ task });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error in execute-task API:", error);
    return NextResponse.json(
      { error: "Failed to execute task" },
      { status: 500 }
    );
  }
}
