import { NextRequest, NextResponse } from "next/server";

// Environment variables for container service
const CONTAINER_SERVICE_URL = process.env.CONTAINER_SERVICE_URL || "http://localhost:8000";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobId, imageBase64, description } = body;

    console.log("🌐 Website creation request received:", {
      jobId,
      descriptionLength: description?.length || 0,
      imageDataLength: imageBase64?.length || 0,
    });

    // Validate required fields
    if (!jobId) {
      return NextResponse.json(
        { success: false, error: "Job ID is required" },
        { status: 400 }
      );
    }

    if (!imageBase64) {
      return NextResponse.json(
        { success: false, error: "Image data is required" },
        { status: 400 }
      );
    }

    if (!description) {
      return NextResponse.json(
        { success: false, error: "Description is required" },
        { status: 400 }
      );
    }

    // Check if container service is configured
    if (!CONTAINER_SERVICE_URL || CONTAINER_SERVICE_URL === "http://localhost:8000") {
      console.warn("⚠️ Container service URL not configured, using mock response");
      
      // Return mock response for development
      return NextResponse.json({
        success: true,
        jobId: jobId,
        status: "creating",
        message: "Website creation started (mock mode)",
      });
    }

    console.log("🌐 Calling container service at:", CONTAINER_SERVICE_URL);

    // Call the container service
    const containerResponse = await fetch(`${CONTAINER_SERVICE_URL}/create-website`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jobId,
        imageBase64,
        description,
        credentials: {
          email: process.env.BOLT_EMAIL,
          password: process.env.BOLT_PASSWORD,
        },
      }),
      // 10 second timeout for the initial request
      signal: AbortSignal.timeout(10000),
    });

    if (!containerResponse.ok) {
      throw new Error(
        `Container service responded with status ${containerResponse.status}`
      );
    }

    const result = await containerResponse.json();

    console.log("✅ Container service accepted job:", result);

    return NextResponse.json({
      success: true,
      jobId: result.jobId || jobId,
      status: result.status || "creating",
      message: "Website creation started successfully",
    });
  } catch (error) {
    console.error("❌ Website creation API error:", error);

    // Handle specific error types
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        return NextResponse.json(
          {
            success: false,
            error: "Container service timeout - please try again",
          },
          { status: 503 }
        );
      }

      if (error.message.includes("fetch")) {
        return NextResponse.json(
          {
            success: false,
            error: "Website creation service is temporarily unavailable",
          },
          { status: 503 }
        );
      }
    }

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to start website creation",
      },
      { status: 500 }
    );
  }
}