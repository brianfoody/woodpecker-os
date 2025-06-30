import type { Editor } from "tldraw";

// Store active polling intervals to prevent duplicates and allow cleanup
const activePolls = new Map<string, NodeJS.Timeout>();

export const startWebsiteJobPolling = (
  shapeId: string,
  jobId: string,
  editor: Editor
) => {
  console.log(`📊 Starting polling for job ${jobId} (shape: ${shapeId})`);

  // Clear any existing poll for this job
  const existingPoll = activePolls.get(jobId);
  if (existingPoll) {
    clearInterval(existingPoll);
    console.log(`🔄 Cleared existing poll for job ${jobId}`);
  }

  const pollInterval = setInterval(async () => {
    try {
      // Check if shape still exists (user might have deleted it)
      // @ts-ignore
      const shape = editor.getShape(shapeId);
      if (!shape) {
        console.log(`🗑️ Shape ${shapeId} no longer exists, stopping poll`);
        clearInterval(pollInterval);
        activePolls.delete(jobId);
        return;
      }

      console.log(`📊 Polling job status for ${jobId}...`);

      // Poll the API
      const response = await fetch(`/api/create-website/${jobId}`);
      if (!response.ok) {
        console.error(`❌ Polling failed with status ${response.status}`);
        return;
      }

      const result = await response.json();

      if (!result.success) {
        console.error("❌ Polling API returned error:", result.error);
        return;
      }

      const status = result.status;
      console.log(
        `📊 Job ${jobId} status: ${status} (progress: ${result.progress || 0}%)`
      );

      // Update shape with new status
      editor.updateShape({
        id: shapeId,
        type: "website-bubble",
        props: {
          ...shape.props,
          status: status,
          progress: result.progress || 0,
          netlifyUrl: result.netlifyUrl,
          boltUrl: result.boltUrl,
          errorMessage: result.errorMessage,
        },
      });

      // Stop polling when complete or failed
      if (status === "complete" || status === "failed") {
        console.log(`✅ Job ${jobId} finished with status: ${status}`);
        clearInterval(pollInterval);
        activePolls.delete(jobId);

        if (status === "complete") {
          console.log(`🎉 Website created successfully!`);
          console.log(`📍 Netlify URL: ${result.netlifyUrl}`);
          console.log(`📍 Bolt URL: ${result.boltUrl}`);
        } else {
          console.log(`❌ Website creation failed: ${result.errorMessage}`);
        }
      }
    } catch (error) {
      console.error("❌ Polling error:", error);
      // Don't stop polling on error - might be temporary network issue
    }
  }, 7500); // Poll every 7.5 seconds

  // Store the interval for cleanup
  activePolls.set(jobId, pollInterval);
};

export const stopWebsiteJobPolling = (jobId: string) => {
  const existingPoll = activePolls.get(jobId);
  if (existingPoll) {
    clearInterval(existingPoll);
    activePolls.delete(jobId);
    console.log(`⏹️ Stopped polling for job ${jobId}`);
  }
};

export const stopAllWebsitePolling = () => {
  console.log(
    `⏹️ Stopping all website polling (${activePolls.size} active polls)`
  );
  activePolls.forEach((interval, jobId) => {
    clearInterval(interval);
    console.log(`⏹️ Stopped poll for job ${jobId}`);
  });
  activePolls.clear();
};

// Helper to convert blob to base64
export const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Extract just the base64 part (remove data:image/png;base64, prefix)
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};
