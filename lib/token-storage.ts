import { readFileSync, writeFileSync, existsSync } from "fs";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

interface StoredTokens {
  google?: {
    access_token: string;
    refresh_token: string;
    expiry_date: number;
    scope: string;
  };
  microsoft?: {
    access_token: string;
    refresh_token: string;
    expiry_date: number;
    scope: string;
  };
}

const TOKEN_PATH =
  process.env.WOODPECKER_TOKEN_PATH || "./.woodpecker-tokens.json";
const ALGORITHM = "aes-256-gcm";

function getEncryptionKey(): Buffer {
  const key = process.env.WOODPECKER_ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      "WOODPECKER_ENCRYPTION_KEY environment variable is required"
    );
  }
  return Buffer.from(key, "hex");
}

function encrypt(text: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

function decrypt(encryptedText: string): string {
  const key = getEncryptionKey();
  const [ivHex, authTagHex, encrypted] = encryptedText.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

function readTokens(): StoredTokens {
  if (!existsSync(TOKEN_PATH)) {
    return {};
  }
  try {
    const raw = readFileSync(TOKEN_PATH, "utf8");
    const decrypted = decrypt(raw);
    return JSON.parse(decrypted);
  } catch {
    return {};
  }
}

function writeTokens(tokens: StoredTokens): void {
  const encrypted = encrypt(JSON.stringify(tokens));
  writeFileSync(TOKEN_PATH, encrypted, "utf8");
}

export function getGoogleTokens() {
  return readTokens().google || null;
}

export function getMicrosoftTokens() {
  return readTokens().microsoft || null;
}

export function saveGoogleTokens(tokens: {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
  scope: string;
}) {
  const stored = readTokens();
  stored.google = tokens;
  writeTokens(stored);
}

export function saveMicrosoftTokens(tokens: {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
  scope: string;
}) {
  const stored = readTokens();
  stored.microsoft = tokens;
  writeTokens(stored);
}

export async function refreshGoogleToken(): Promise<string> {
  const tokens = getGoogleTokens();
  if (!tokens?.refresh_token) {
    throw new Error("No Google refresh token available");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: tokens.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to refresh Google token");
  }

  const data = await response.json();
  saveGoogleTokens({
    access_token: data.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: Date.now() + data.expires_in * 1000,
    scope: tokens.scope,
  });

  return data.access_token;
}

export async function refreshMicrosoftToken(): Promise<string> {
  const tokens = getMicrosoftTokens();
  if (!tokens?.refresh_token) {
    throw new Error("No Microsoft refresh token available");
  }

  const tenantId = process.env.MICROSOFT_TENANT_ID || "common";
  const response = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.MICROSOFT_CLIENT_ID!,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
        refresh_token: tokens.refresh_token,
        grant_type: "refresh_token",
      }),
    }
  );

  if (!response.ok) {
    throw new Error("Failed to refresh Microsoft token");
  }

  const data = await response.json();
  saveMicrosoftTokens({
    access_token: data.access_token,
    refresh_token: data.refresh_token || tokens.refresh_token,
    expiry_date: Date.now() + data.expires_in * 1000,
    scope: tokens.scope,
  });

  return data.access_token;
}

export async function getValidGoogleToken(): Promise<string> {
  const tokens = getGoogleTokens();
  if (!tokens) {
    throw new Error("Google not connected");
  }
  if (Date.now() >= tokens.expiry_date - 60000) {
    return refreshGoogleToken();
  }
  return tokens.access_token;
}

export async function getValidMicrosoftToken(): Promise<string> {
  const tokens = getMicrosoftTokens();
  if (!tokens) {
    throw new Error("Microsoft not connected");
  }
  if (Date.now() >= tokens.expiry_date - 60000) {
    return refreshMicrosoftToken();
  }
  return tokens.access_token;
}

export function isGoogleConnected(): boolean {
  const tokens = getGoogleTokens();
  return !!tokens?.refresh_token;
}

export function isMicrosoftConnected(): boolean {
  const tokens = getMicrosoftTokens();
  return !!tokens?.refresh_token;
}
