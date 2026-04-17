import { NextRequest, NextResponse } from "next/server";
import { saveGoogleTokens } from "@/lib/token-storage";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(`/settings?error=google_${error}`, request.url)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/settings?error=google_no_code", request.url)
    );
  }

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        code,
        grant_type: "authorization_code",
        redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
      }),
    });

    if (!response.ok) {
      const errData = await response.text();
      console.error("Google token exchange failed:", errData);
      return NextResponse.redirect(
        new URL("/settings?error=google_token_exchange", request.url)
      );
    }

    const data = await response.json();

    saveGoogleTokens({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expiry_date: Date.now() + data.expires_in * 1000,
      scope: data.scope,
    });

    return NextResponse.redirect(
      new URL("/settings?success=google", request.url)
    );
  } catch (err) {
    console.error("Google OAuth callback error:", err);
    return NextResponse.redirect(
      new URL("/settings?error=google_callback", request.url)
    );
  }
}
