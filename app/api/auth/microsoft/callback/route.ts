import { NextRequest, NextResponse } from "next/server";
import { saveMicrosoftTokens } from "@/lib/token-storage";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(`/settings?error=microsoft_${error}`, request.url)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/settings?error=microsoft_no_code", request.url)
    );
  }

  try {
    const tenantId = process.env.MICROSOFT_TENANT_ID || "common";
    const response = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: process.env.MICROSOFT_CLIENT_ID!,
          client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
          code,
          grant_type: "authorization_code",
          redirect_uri: process.env.MICROSOFT_REDIRECT_URI!,
        }),
      }
    );

    if (!response.ok) {
      const errData = await response.text();
      console.error("Microsoft token exchange failed:", errData);
      return NextResponse.redirect(
        new URL("/settings?error=microsoft_token_exchange", request.url)
      );
    }

    const data = await response.json();

    saveMicrosoftTokens({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expiry_date: Date.now() + data.expires_in * 1000,
      scope: data.scope,
    });

    return NextResponse.redirect(
      new URL("/settings?success=microsoft", request.url)
    );
  } catch (err) {
    console.error("Microsoft OAuth callback error:", err);
    return NextResponse.redirect(
      new URL("/settings?error=microsoft_callback", request.url)
    );
  }
}
