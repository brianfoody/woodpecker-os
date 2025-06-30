import asyncio
import base64
import os
import tempfile
from browser_use import Agent
from browser_use.llm import ChatOpenAI
import re

async def create_website_automation(
    job_id: str,
    image_base64: str,
    description: str,
    credentials: dict,
    job_manager
):
    """Main automation function using Browser Use"""
    try:
        print(f"🌐 Starting website automation for job {job_id}")
        
        # Update progress - no image handling needed for text-based approach
        job_manager.update_job(job_id, "creating", progress=20)
        
        # Get API key and credentials from environment
        groq_api_key = os.getenv("GROQ_API_KEY")
        openai_api_key = os.getenv("OPENAI_API_KEY")
        stackblitz_email = os.getenv("STACKBLITZ_EMAIL")
        stackblitz_password = os.getenv("STACKBLITZ_PASSWORD")
        
        if not groq_api_key and not openai_api_key:
            raise Exception("No API key found. Set GROQ_API_KEY or OPENAI_API_KEY environment variable")
        
        if not stackblitz_email or not stackblitz_password:
            raise Exception("StackBlitz credentials not found. Set STACKBLITZ_EMAIL and STACKBLITZ_PASSWORD environment variables")
        
        # Browser Use requires specific LLM interfaces and structured outputs support
        # Use gpt-4.1 which supports structured outputs
        if openai_api_key:
            llm = ChatOpenAI(model="gpt-4.1", api_key=openai_api_key)
        elif groq_api_key:
            # Use OpenAI interface with GROQ API endpoint (if supported)
            # For now, fall back to requiring OpenAI API key
            raise Exception("Browser Use currently requires OpenAI API key. Please set OPENAI_API_KEY environment variable")
        else:
            raise Exception("OpenAI API key required for Browser Use. Please set OPENAI_API_KEY environment variable")
        
        print(f"🤖 Using LLM: OpenAI (required for Browser Use)")
        
        # Construct the StackBlitz URL (from your requirements)
        stackblitz_url = "https://stackblitz.com/sign_in?redirect_to=%2Foauth%2Fauthorize%3Fclient_id%3Dbolt%26response_type%3Dcode%26redirect_uri%3Dhttps%253A%252F%252Fbolt.new%252Foauth2%26code_challenge_method%3DS256%26code_challenge%3DgNZVFMfZyeHAs4wPk9ISUdkuxaC0VVoM19aar-IzHn8%26state%3D2258c671-46c1-4b10-a2f6-c432ac89ee09%26scope%3Dpublic%26bolt_oauth_provider%3Dlogin_password%26ad_conversions_data_token%3D2b6c65ba-e237-4c97-97fc-09d773559bea%26bolt_auth_handeled%3Dtrue"
        
        # Create Browser Use agent with detailed task
        task = f"""
        Complete this website creation workflow step by step:
        
        1. Navigate to: {stackblitz_url}
        2. Enter {stackblitz_email} into email input and click "Sign In"
        3. The password field will now show. Enter {stackblitz_password} into the password field. 
        4. Click Sign In again
        5. IMPORTANT: After login, if you see an "Authenticating" screen or oauth2 redirect, wait 5 seconds maximum then navigate directly to: https://bolt.new (you are likely already logged in)
        6. Find the main text input area on the page (large text input for prompts)
        7. In the main text input area, enter this prompt: "Create a beautifully designed website based on this detailed description of the user's sketch: {description}"
        8. Press Enter or click the submit button to start website creation
        9. Verify that the website creation has started. You should see a panel on the left side begin creating. If so, continue to step 10. If you see a popup login modal then our sign in attempt was not valid - return to step 1.
        10. Wait for the AI to complete the website creation (watch for stop icon "i-ph:stop-circle-bold" to disappear from the left panel)
        11. Once creation is complete, click the deploy button in the top right area
        12. Wait for deployment to complete (stop icon disappears again)
        13. Extract the Netlify URL from the chat area (format: "https://<site-prefix>.netlify.app")
        14. Get the current browser URL (this will be the Bolt project URL)
        
        IMPORTANT: 
        - Take your time with each step
        - Wait for pages to fully load before proceeding
        - DO NOT get stuck on authentication screens - if you see "Authenticating" or oauth2 URLs after login, wait max 2 seconds then go to https://bolt.new
        - NO FILE UPLOAD needed - everything is text-based
        - Website generation can take 1-3 minutes
        - Deployment can take another 1-2 minutes
        - Look carefully for the URLs in the final step
        
        Return the extracted Netlify URL and Bolt project URL.
        """
        
        print(f"🤖 Creating Browser Use agent...")
        job_manager.update_job(job_id, "creating", progress=25)
        
        agent = Agent(
            task=task,
            llm=llm,
            max_steps=30,
            agent_name=f"WebsiteAgent_{job_id}",
        )
        
        print(f"🤖 Starting browser automation...")
        job_manager.update_job(job_id, "creating", progress=30)
        
        # Run the automation with progress updates
        result = await run_automation_with_progress(agent, job_id, job_manager)
        
        # Parse the results
        netlify_url, bolt_url = await parse_automation_result(result)
        
        print(f"✅ Website creation completed!")
        print(f"🔗 Netlify URL: {netlify_url}")
        print(f"🔗 Bolt URL: {bolt_url}")
        
        # Update job with final results
        job_manager.update_job(
            job_id, 
            "complete", 
            progress=100,
            netlify_url=netlify_url,
            bolt_url=bolt_url
        )
        
        # No cleanup needed for text-based approach
        print(f"✅ Text-based website creation completed successfully")
        
    except Exception as e:
        print(f"❌ Automation failed for job {job_id}: {e}")
        job_manager.update_job(
            job_id, 
            "failed", 
            error_message=str(e)
        )
        
        # No cleanup needed for text-based approach

# Image handling functions removed - using text-based approach

async def run_automation_with_progress(agent, job_id: str, job_manager) -> str:
    """Run automation with progress updates"""
    try:
        # Start automation
        job_manager.update_job(job_id, "creating", progress=40)
        
        # This is where the actual Browser Use automation runs
        # We'll simulate progress updates during the long-running process
        
        # In a real implementation, you might need to:
        # 1. Run the agent in a separate thread/process
        # 2. Monitor its progress somehow
        # 3. Update job status periodically
        
        # For now, we'll run it and update progress at key stages
        print("🤖 Running Browser Use agent...")
        
        # Simulate progress during automation
        asyncio.create_task(update_progress_during_automation(job_id, job_manager))
        
        # Run the actual automation
        result = await agent.run()
        
        print(f"🤖 Automation completed with result: {result}")
        return result
        
    except Exception as e:
        print(f"❌ Browser automation failed: {e}")
        raise

async def update_progress_during_automation(job_id: str, job_manager):
    """Update progress during the long-running automation (realistic 10-minute timeline)"""
    try:
        # Realistic progress updates for 10-minute process
        await asyncio.sleep(30)  # Sign in and navigation (30s)
        job_manager.update_job(job_id, "creating", progress=40)
        
        await asyncio.sleep(60)  # Finding input and entering prompt (1.5min total)
        job_manager.update_job(job_id, "creating", progress=50)
        
        await asyncio.sleep(180)  # Website generation - this takes the longest (4.5min total)
        job_manager.update_job(job_id, "creating", progress=70)
        
        await asyncio.sleep(120)  # Finding deploy button and starting deployment (6.5min total)
        job_manager.update_job(job_id, "deploying", progress=80)
        
        await asyncio.sleep(120)  # Deployment process (8.5min total)
        job_manager.update_job(job_id, "deploying", progress=90)
        
        await asyncio.sleep(90)   # Extracting URLs and finishing (10min total)
        job_manager.update_job(job_id, "deploying", progress=95)
        
    except Exception as e:
        print(f"⚠️ Progress update error: {e}")

async def parse_automation_result(result: str) -> tuple[str, str]:
    """Parse the automation result to extract URLs"""
    try:
        print(f"🔍 Parsing automation result: {result}")
        
        # Extract Netlify URL
        netlify_pattern = r'https://[a-zA-Z0-9-]+\.netlify\.app'
        netlify_matches = re.findall(netlify_pattern, result)
        netlify_url = netlify_matches[0] if netlify_matches else None
        
        # Extract Bolt URL
        bolt_pattern = r'https://bolt\.new/[^\s]+'
        bolt_matches = re.findall(bolt_pattern, result)
        bolt_url = bolt_matches[0] if bolt_matches else None
        
        # If we can't find URLs in the result, try some fallback patterns
        if not netlify_url:
            # Look for any netlify.app domain
            netlify_pattern2 = r'[a-zA-Z0-9-]+\.netlify\.app'
            netlify_matches2 = re.findall(netlify_pattern2, result)
            if netlify_matches2:
                netlify_url = f"https://{netlify_matches2[0]}"
        
        print(f"🔗 Extracted Netlify URL: {netlify_url}")
        print(f"🔗 Extracted Bolt URL: {bolt_url}")
        
        return netlify_url, bolt_url
        
    except Exception as e:
        print(f"⚠️ Error parsing result: {e}")
        return None, None