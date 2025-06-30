import asyncio
import os
import re
from playwright.async_api import async_playwright

async def create_website_automation(
    job_id: str,
    image_base64: str,
    description: str,
    credentials: dict,
    job_manager
):
    """Main automation function using Playwright directly"""
    try:
        print(f"🌐 Starting website automation for job {job_id}")
        
        # Update progress
        job_manager.update_job(job_id, "creating", progress=10)
        
        # Get credentials from environment
        stackblitz_email = os.getenv("STACKBLITZ_EMAIL")
        stackblitz_password = os.getenv("STACKBLITZ_PASSWORD")
        
        if not stackblitz_email or not stackblitz_password:
            raise Exception("StackBlitz credentials not found. Set STACKBLITZ_EMAIL and STACKBLITZ_PASSWORD environment variables")
        
        print(f"🤖 Using Playwright automation (faster and cheaper)")
        
        # Start automation with progress updates
        netlify_url, bolt_url = await run_playwright_automation(
            job_id, description, stackblitz_email, stackblitz_password, job_manager
        )
        
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
        
        print(f"✅ Playwright automation completed successfully")
        
    except Exception as e:
        print(f"❌ Automation failed for job {job_id}: {e}")
        job_manager.update_job(
            job_id, 
            "failed", 
            error_message=str(e)
        )

async def run_playwright_automation(
    job_id: str, 
    description: str, 
    email: str, 
    password: str, 
    job_manager
) -> tuple[str, str]:
    """Run Playwright automation following the DPM steps"""
    
    async with async_playwright() as p:
        # Launch browser
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        try:
            # Step 1: Navigate to bolt.new
            print(f"📍 Navigating to bolt.new...")
            await page.goto("https://bolt.new")
            job_manager.update_job(job_id, "creating", progress=10)
            
            # Step 2: Click "Sign In" button on main page
            print(f"🔘 Clicking Sign In button...")
            sign_in_button = await page.wait_for_selector('button:has-text("Sign In")')
            await sign_in_button.click()
            job_manager.update_job(job_id, "creating", progress=15)
            
            # Step 3: Click "Sign In with Email and Password" in modal
            print(f"🔘 Clicking Sign In with Email and Password...")
            email_password_button = await page.wait_for_selector('button:has-text("Sign In with Email and Password")')
            
            # Store reference to original tab
            original_page = page
            
            # Wait for new tab to open when clicking the button
            async with page.context.expect_page() as new_page_info:
                await email_password_button.click()
            
            # Switch to the new tab for login
            login_page = await new_page_info.value
            await login_page.wait_for_load_state()
            job_manager.update_job(job_id, "creating", progress=20)
            
            # Step 4: Enter email on StackBlitz login page
            print(f"📧 Entering email...")
            email_input = await login_page.wait_for_selector('input[type="text"][name="login"][placeholder="Email or Username"]')
            await email_input.fill(email)
            job_manager.update_job(job_id, "creating", progress=25)
            
            # Step 5: Click Sign In
            print(f"🔘 Clicking Sign In...")
            sign_in_button = await login_page.wait_for_selector('button[type="submit"]:has-text("Sign In")')
            await sign_in_button.click()
            job_manager.update_job(job_id, "creating", progress=30)
            
            # Step 6: Enter password
            print(f"🔒 Entering password...")
            password_input = await login_page.wait_for_selector('input[type="password"][name="password"][placeholder="Password"]')
            await password_input.fill(password)
            job_manager.update_job(job_id, "creating", progress=35)
            
            # Step 7: Click Sign In again
            print(f"🔘 Clicking Sign In again...")
            await sign_in_button.click()
            job_manager.update_job(job_id, "creating", progress=40)
            
            # Step 8: Wait for login tab to close and switch back to original tab
            print(f"⏱️ Waiting for login tab to close...")
            await login_page.wait_for_event('close', timeout=60000)
            print(f"✅ Login tab closed, switching back to original bolt.new tab...")
            
            # Switch back to original tab
            page = original_page
            await page.bring_to_front()
            job_manager.update_job(job_id, "creating", progress=45)
            
            # Step 9: Enter description
            print(f"📝 Entering description...")
            textarea = await page.wait_for_selector('textarea[placeholder="How can Bolt help you today?"]')
            prompt = f"Create a beautifully designed minimal website based on this detailed description the user has provided in sketch form: {description}"
            await textarea.fill(prompt)
            job_manager.update_job(job_id, "creating", progress=50)
            
            # Step 10: Click submit button
            print(f"🚀 Clicking submit button...")
            submit_button = await page.wait_for_selector('button:has(div.i-ph\\:arrow-right)')
            await submit_button.click()
            job_manager.update_job(job_id, "creating", progress=55)
            
            # Step 11: Wait for creation to start and complete
            print(f"⏳ Waiting for website creation to complete...")
            stop_icon = await page.wait_for_selector('div.i-ph\\:stop-circle-bold', timeout=10000)
            job_manager.update_job(job_id, "creating", progress=65)
            
            # Wait for stop icon to disappear (creation complete)
            print(f"⏳ Waiting for creation to finish...")
            await page.wait_for_selector('div.i-ph\\:stop-circle-bold', state='detached', timeout=180000)  # 3 min timeout
            job_manager.update_job(job_id, "creating", progress=80)
            
            # Step 12: Click Deploy button
            print(f"🚀 Clicking Deploy button...")
            deploy_button = await page.wait_for_selector('button:has-text("Deploy")')
            await deploy_button.click()
            job_manager.update_job(job_id, "deploying", progress=85)
            
            # Step 13: Wait for deployment to complete
            print(f"⏳ Waiting for deployment to complete...")
            await page.wait_for_selector('div.i-ph\\:stop-circle-bold', state='detached', timeout=180000)  # 3 min timeout
            job_manager.update_job(job_id, "deploying", progress=95)
            
            # Step 14: Extract Netlify URL
            print(f"🔍 Extracting Netlify URL...")
            deployment_text = await page.wait_for_selector('p:has-text("Your site has been successfully deployed! You can view it at:")')
            deployment_paragraph = await deployment_text.text_content()
            
            # Extract Netlify URL
            netlify_url = extract_netlify_url(deployment_paragraph)
            bolt_url = page.url
            
            print(f"✅ Extracted URLs:")
            print(f"🔗 Netlify: {netlify_url}")
            print(f"🔗 Bolt: {bolt_url}")
            
            return netlify_url, bolt_url
            
        finally:
            await browser.close()

def extract_netlify_url(text: str) -> str:
    """Extract Netlify URL from deployment success text"""
    try:
        # Look for Netlify URL pattern in the text
        netlify_pattern = r'https://[a-zA-Z0-9-]+\.netlify\.app'
        matches = re.findall(netlify_pattern, text)
        
        if matches:
            return matches[0]
        
        # Fallback: look for any netlify.app domain and add https://
        netlify_pattern2 = r'[a-zA-Z0-9-]+\.netlify\.app'
        matches2 = re.findall(netlify_pattern2, text)
        if matches2:
            return f"https://{matches2[0]}"
            
        print(f"⚠️ No Netlify URL found in text: {text}")
        return None
        
    except Exception as e:
        print(f"⚠️ Error extracting Netlify URL: {e}")
        return None