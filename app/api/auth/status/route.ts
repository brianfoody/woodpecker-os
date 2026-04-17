import { NextResponse } from "next/server";
import { isGoogleConnected, isMicrosoftConnected } from "@/lib/token-storage";

export async function GET() {
  return NextResponse.json({
    google: isGoogleConnected(),
    microsoft: isMicrosoftConnected(),
  });
}
