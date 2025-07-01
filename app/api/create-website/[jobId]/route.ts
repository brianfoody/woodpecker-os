import { NextRequest, NextResponse } from "next/server";

// Environment variables for container service
const CONTAINER_SERVICE_URL =
  process.env.CONTAINER_SERVICE_URL || "http://localhost:8000";

// Mock job data for development (when container service is not available)
const mockJobs = new Map<string, any>();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;

    if (!jobId) {
      return NextResponse.json(
        { success: false, error: "Job ID is required" },
        { status: 400 }
      );
    }

    console.log(`📊 Polling job status for: ${jobId}`);

    // Check if container service is configured
    if (
      !CONTAINER_SERVICE_URL ||
      CONTAINER_SERVICE_URL === "http://localhost:8000"
    ) {
      console.log("📊 Using mock job status for development");

      // Mock progression for development/testing
      let mockJob = mockJobs.get(jobId);

      if (!mockJob) {
        // Initialize mock job
        mockJob = {
          jobId,
          status: "creating",
          progress: 10,
          createdAt: new Date(),
        };
        mockJobs.set(jobId, mockJob);
      }

      // Simulate progression
      const elapsed = Date.now() - mockJob.createdAt.getTime();

      if (elapsed < 10000) {
        // First 10 seconds: creating
        mockJob.status = "creating";
        mockJob.progress = Math.min(50, 10 + (elapsed / 10000) * 40);
      } else if (elapsed < 20000) {
        // Next 10 seconds: deploying
        mockJob.status = "deploying";
        mockJob.progress = Math.min(90, 50 + ((elapsed - 10000) / 10000) * 40);
      } else if (elapsed < 25000) {
        // Final 5 seconds: completing
        mockJob.status = "deploying";
        mockJob.progress = Math.min(100, 90 + ((elapsed - 20000) / 5000) * 10);
      } else {
        // Complete after 25 seconds
        mockJob.status = "complete";
        mockJob.progress = 100;
        mockJob.netlifyUrl = "https://mock-website-123.netlify.app";
        mockJob.boltUrl = "https://bolt.new/~/mock-project-456";
      }

      return NextResponse.json({
        success: true,
        jobId: mockJob.jobId,
        status: mockJob.status,
        progress: Math.round(mockJob.progress),
        netlifyUrl: mockJob.netlifyUrl,
        boltUrl: mockJob.boltUrl,
        errorMessage: mockJob.errorMessage,
      });
    }

    // Call container service for real job status
    const statusResponse = await fetch(
      `${CONTAINER_SERVICE_URL}/job-status/${jobId}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        // 5 second timeout for polling requests
        signal: AbortSignal.timeout(5000),
      }
    );

    if (!statusResponse.ok) {
      throw new Error(
        `Container service responded with status ${statusResponse.status}`
      );
    }

    const jobStatus = await statusResponse.json();

    console.log(`📊 Job ${jobId} status from container:`, jobStatus);

    return NextResponse.json({
      success: true,
      jobId: jobStatus.jobId || jobId,
      status: jobStatus.status,
      progress: jobStatus.progress,
      netlifyUrl: jobStatus.netlifyUrl,
      boltUrl: jobStatus.boltUrl,
      errorMessage: jobStatus.errorMessage,
    });
  } catch (error) {
    console.error(`❌ Error polling job:`, error);

    // Handle specific error types
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        return NextResponse.json(
          {
            success: false,
            error: "Polling timeout - job may still be running",
          },
          { status: 408 }
        );
      }

      if (error.message.includes("fetch")) {
        return NextResponse.json(
          {
            success: false,
            error: "Unable to reach website creation service",
          },
          { status: 503 }
        );
      }
    }

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to get job status",
      },
      { status: 500 }
    );
  }
}
