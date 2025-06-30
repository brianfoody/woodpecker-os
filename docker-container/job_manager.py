import json
import os
import time
from typing import Dict, Optional, List
from datetime import datetime

class JobManager:
    def __init__(self, data_dir: str = "/app/data"):
        self.data_dir = data_dir
        self.jobs_file = os.path.join(data_dir, "jobs.json")
        self.jobs: Dict[str, dict] = {}
        self._load_jobs()
    
    def _load_jobs(self):
        """Load jobs from persistent storage"""
        try:
            if os.path.exists(self.jobs_file):
                with open(self.jobs_file, 'r') as f:
                    self.jobs = json.load(f)
                print(f"📂 Loaded {len(self.jobs)} jobs from storage")
            else:
                self.jobs = {}
                print("📂 No existing jobs file, starting fresh")
        except Exception as e:
            print(f"❌ Error loading jobs: {e}")
            self.jobs = {}
    
    def _save_jobs(self):
        """Save jobs to persistent storage"""
        try:
            os.makedirs(self.data_dir, exist_ok=True)
            with open(self.jobs_file, 'w') as f:
                json.dump(self.jobs, f, indent=2, default=str)
        except Exception as e:
            print(f"❌ Error saving jobs: {e}")
    
    def create_job(self, job_id: str, status: str = "creating", progress: int = 0):
        """Create a new job"""
        job = {
            "jobId": job_id,
            "status": status,
            "progress": progress,
            "createdAt": datetime.now().isoformat(),
            "updatedAt": datetime.now().isoformat(),
        }
        
        self.jobs[job_id] = job
        self._save_jobs()
        
        print(f"📝 Created job {job_id} with status {status}")
        return job
    
    def update_job(
        self, 
        job_id: str, 
        status: Optional[str] = None, 
        progress: Optional[int] = None,
        netlify_url: Optional[str] = None,
        bolt_url: Optional[str] = None,
        error_message: Optional[str] = None
    ):
        """Update job status"""
        if job_id not in self.jobs:
            print(f"⚠️ Job {job_id} not found for update")
            return False
        
        job = self.jobs[job_id]
        
        if status is not None:
            job["status"] = status
        if progress is not None:
            job["progress"] = progress
        if netlify_url is not None:
            job["netlifyUrl"] = netlify_url
        if bolt_url is not None:
            job["boltUrl"] = bolt_url
        if error_message is not None:
            job["errorMessage"] = error_message
        
        job["updatedAt"] = datetime.now().isoformat()
        
        self._save_jobs()
        
        print(f"📝 Updated job {job_id}: status={status}, progress={progress}")
        return True
    
    def get_job_status(self, job_id: str) -> Optional[dict]:
        """Get job status"""
        return self.jobs.get(job_id)
    
    def list_all_jobs(self) -> List[dict]:
        """List all jobs"""
        return list(self.jobs.values())
    
    def cancel_job(self, job_id: str) -> bool:
        """Cancel a job"""
        if job_id not in self.jobs:
            return False
        
        self.update_job(job_id, status="cancelled", error_message="Job cancelled by user")
        print(f"🚫 Cancelled job {job_id}")
        return True
    
    def cleanup_old_jobs(self, max_age_hours: int = 24):
        """Clean up jobs older than max_age_hours"""
        current_time = time.time()
        max_age_seconds = max_age_hours * 3600
        
        jobs_to_remove = []
        
        for job_id, job in self.jobs.items():
            try:
                created_at = datetime.fromisoformat(job["createdAt"]).timestamp()
                if current_time - created_at > max_age_seconds:
                    jobs_to_remove.append(job_id)
            except Exception as e:
                print(f"⚠️ Error checking job {job_id} age: {e}")
        
        for job_id in jobs_to_remove:
            del self.jobs[job_id]
            print(f"🗑️ Removed old job {job_id}")
        
        if jobs_to_remove:
            self._save_jobs()
        
        return len(jobs_to_remove)