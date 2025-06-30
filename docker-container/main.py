from fastapi import FastAPI, BackgroundTasks, HTTPException
from pydantic import BaseModel
from typing import Optional
import asyncio
import os
from job_manager import JobManager
from automation import create_website_automation

app = FastAPI(title="Website Creation Service", version="1.0.0")
job_manager = JobManager()

class WebsiteCreationRequest(BaseModel):
    jobId: str
    imageBase64: str
    description: str
    credentials: Optional[dict] = {}

class JobStatusResponse(BaseModel):
    jobId: str
    status: str
    progress: Optional[int] = None
    netlifyUrl: Optional[str] = None
    boltUrl: Optional[str] = None
    errorMessage: Optional[str] = None

@app.get("/")
async def root():
    return {
        "service": "Website Creation Service",
        "status": "running",
        "version": "1.0.0"
    }

@app.post("/create-website")
async def start_website_creation(
    request: WebsiteCreationRequest,
    background_tasks: BackgroundTasks
):
    """Start website creation process"""
    try:
        print(f"🌐 Starting website creation for job: {request.jobId}")
        
        # Credentials are loaded from environment variables in automation.py
        print("🔑 Using credentials from environment variables")
        
        # Store job as "creating"
        job_manager.create_job(request.jobId, "creating", progress=10)
        
        # Start automation in background
        background_tasks.add_task(
            create_website_automation,
            request.jobId,
            request.imageBase64,
            request.description,
            request.credentials,
            job_manager
        )
        
        print(f"✅ Website creation job {request.jobId} started in background")
        
        return {
            "status": "started",
            "jobId": request.jobId,
            "message": "Website creation started successfully"
        }
        
    except Exception as e:
        print(f"❌ Error starting website creation: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/job-status/{job_id}", response_model=JobStatusResponse)
async def get_job_status(job_id: str):
    """Get job status"""
    try:
        status = job_manager.get_job_status(job_id)
        
        if not status:
            raise HTTPException(status_code=404, detail="Job not found")
        
        return JobStatusResponse(**status)
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error getting job status: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/jobs")
async def list_jobs():
    """List all jobs (for debugging)"""
    return job_manager.list_all_jobs()

@app.delete("/job/{job_id}")
async def cancel_job(job_id: str):
    """Cancel a job"""
    try:
        success = job_manager.cancel_job(job_id)
        if not success:
            raise HTTPException(status_code=404, detail="Job not found")
        
        return {"message": f"Job {job_id} cancelled"}
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error cancelling job: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)