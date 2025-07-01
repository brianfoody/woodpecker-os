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
        
        # Get proxy settings from environment
        proxy_server = os.getenv("PROXY_SERVER")  # e.g., "http://proxy.example.com:8080"
        proxy_username = os.getenv("PROXY_USERNAME")
        proxy_password = os.getenv("PROXY_PASSWORD")
        
        
        if not stackblitz_email or not stackblitz_password:
            raise Exception("StackBlitz credentials not found. Set STACKBLITZ_EMAIL and STACKBLITZ_PASSWORD environment variables")
        
        if proxy_server:
            print(f"🌐 Using proxy server: {proxy_server}")
        else:
            print(f"⚠️ No proxy configured - using direct connection")
        
        print(f"🤖 Using Playwright automation (faster and cheaper)")
        
        # Start automation with progress updates
        netlify_url, bolt_url = await run_playwright_automation(
            job_id, description, stackblitz_email, stackblitz_password, job_manager,
            proxy_server, proxy_username, proxy_password
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
    job_manager,
    proxy_server: str = None,
    proxy_username: str = None,
    proxy_password: str = None
) -> tuple[str, str]:
    """
    Run Playwright automation following the DPM steps
    
    Proxy configuration (optional):
    - proxy_server: HTTP/HTTPS/SOCKS5 proxy URL (e.g., "http://proxy.example.com:8080")
    - proxy_username: Username for authenticated proxies
    - proxy_password: Password for authenticated proxies
    
    Environment variables:
    - PROXY_SERVER: Proxy server URL
    - PROXY_USERNAME: Proxy authentication username  
    - PROXY_PASSWORD: Proxy authentication password
    """
    
    async with async_playwright() as p:
        # Launch browser with comprehensive flags for cloud/headless environments
        browser = await p.chromium.launch(
            headless=True,
            # headless=False,
            args=[
                '--disable-popup-blocking',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--allow-running-insecure-content',
                '--disable-features=TranslateUI',
                '--disable-ipc-flooding-protection',
                '--disable-extensions',
                '--disable-plugins',
                '--disable-gpu',
                '--disable-software-rasterizer',
                '--disable-background-networking',
                '--disable-default-apps',
                '--disable-sync',
                '--metrics-recording-only',
                '--no-first-run',
                '--safebrowsing-disable-auto-update',
                '--disable-component-update',
                '--disable-domain-reliability',
                '--font-render-hinting=none',
                '--disable-font-subpixel-positioning'
            ]
        )
        
        # Prepare context options with anti-detection measures
        context_options = {
            'viewport': {'width': 1366, 'height': 768},  # More common resolution
            'user_agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'locale': 'en-US',
            'timezone_id': 'America/New_York',
            'extra_http_headers': {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'DNT': '1',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Cache-Control': 'max-age=0'
            }
        }
        
        # Add proxy configuration if provided
        if proxy_server:
            proxy_config = {'server': proxy_server}
            if proxy_username and proxy_password:
                proxy_config['username'] = proxy_username
                proxy_config['password'] = proxy_password
            context_options['proxy'] = proxy_config
            print(f"🌐 Proxy configured: {proxy_server} (authenticated: {bool(proxy_username)})")
            
            # Test proxy connection before proceeding
            try:
                test_page = await browser.new_page()
                await test_page.goto("https://httpbin.org/ip", timeout=30000)
                ip_response = await test_page.content()
                print(f"🔍 Proxy IP test response: {ip_response[:200]}...")
                await test_page.close()
            except Exception as proxy_test_error:
                print(f"❌ Proxy test failed: {proxy_test_error}")
                # Continue anyway - might still work for main site
        
        # Create new context and page with proxy support
        context = await browser.new_context(**context_options)
        page = await context.new_page()
        
        # Set longer default timeouts for cloud environments
        page.set_default_timeout(90000)  # 90 seconds
        
        # Add human-like behavior
        await page.add_init_script("""
            // Remove webdriver property
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined,
            });
            
            // Mock plugins
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5],
            });
            
            // Mock languages
            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-US', 'en'],
            });
            
            // Mock screen properties
            Object.defineProperty(screen, 'colorDepth', {
                get: () => 24,
            });
        """)
        
        try:
            # Step 1: Navigate to bolt.new with anti-detection strategies
            print(f"📍 Navigating to bolt.new...")

            await page.goto("https://bolt.new", timeout=60000)
            
            # # Random delay before starting (1-3 seconds)
            # await asyncio.sleep(1 + (hash(job_id) % 2000) / 1000)
            
            # # Try multiple navigation strategies
            # navigation_success = False
            # for attempt in range(3):
            #     try:
            #         print(f"🔄 Navigation attempt {attempt + 1}/3...")
                    
            #         if attempt == 0:
            #             # First attempt: Direct navigation
            #             await page.goto("https://bolt.new", timeout=60000, wait_until='load')
                        
            #         elif attempt == 1:
            #             # Second attempt: Via referrer
            #             await page.goto("https://google.com", timeout=30000)
            #             await asyncio.sleep(2)
            #             await page.goto("https://bolt.new", timeout=60000, wait_until='load')
                        
            #         else:
            #             # Third attempt: Clear approach
            #             await page.goto("about:blank")
            #             await asyncio.sleep(3)
            #             await page.goto("https://bolt.new", timeout=90000, wait_until='domcontentloaded')
                    
            #         # Wait for page to be ready
            #         await page.wait_for_load_state('networkidle', timeout=30000)
            #         navigation_success = True
            #         break
                    
            #     except Exception as nav_error:
            #         print(f"❌ Navigation attempt {attempt + 1} failed: {nav_error}")
            #         if attempt < 2:
            #             # Wait before retry with exponential backoff
            #             wait_time = (attempt + 1) * 10 + (hash(job_id) % 5)
            #             print(f"⏳ Waiting {wait_time} seconds before retry...")
            #             await asyncio.sleep(wait_time)
            #         continue
            
            # if not navigation_success:
            #     raise Exception("Failed to navigate to bolt.new after 3 attempts")
            
            # Add human-like delay
            await asyncio.sleep(2 + (hash(job_id) % 1000) / 1000)
            job_manager.update_job(job_id, "creating", progress=10)
            
            # Debug: Check what's on the page
            print(f"🔍 Current URL: {page.url}")
            print(f"🔍 Page title: {await page.title()}")
            
            # Step 2: Click "Sign In" button on main page
            print(f"🔘 Looking for Sign In button...")
            
            try:
                # Try multiple possible selectors for the Sign In button
                sign_in_selectors = [
                    'button:has-text("Sign In")',
                    'button:has-text("Sign in")',
                    'button:has-text("LOGIN")',
                    'a:has-text("Sign In")',
                    'a:has-text("Sign in")',
                    '[data-testid="sign-in"]',
                    '.sign-in-button',
                    'button[class*="sign"]',
                    'button[class*="login"]'
                ]
                
                # Wait for any of these selectors to appear
                sign_in_button = None
                for selector in sign_in_selectors:
                    try:
                        print(f"🔍 Trying selector: {selector}")
                        sign_in_button = await page.wait_for_selector(selector, timeout=10000)
                        if sign_in_button:
                            print(f"✅ Found Sign In button with selector: {selector}")
                            break
                    except:
                        continue
                
                if not sign_in_button:
                    # Take a screenshot for debugging
                    await page.screenshot(path='/tmp/bolt_page_debug.png')
                    
                    # Get all buttons on the page for debugging
                    all_buttons = await page.query_selector_all('button')
                    print(f"🔍 Found {len(all_buttons)} buttons on page:")
                    for i, button in enumerate(all_buttons[:10]):  # Limit to first 10
                        try:
                            text = await button.inner_text()
                            print(f"  Button {i}: '{text}'")
                        except:
                            print(f"  Button {i}: [no text]")
                    
                    raise Exception("Sign In button not found with any selector")
                
                await sign_in_button.click()
                job_manager.update_job(job_id, "creating", progress=15)
                
            except Exception as signin_error:
                print(f"❌ Failed to find/click Sign In button: {signin_error}")
                raise signin_error
            
            # Step 3: Click "Sign In with Email and Password" in modal
            print(f"🔘 Clicking Sign In with Email and Password...")
            email_password_button = await page.wait_for_selector('button:has-text("Sign In with Email and Password")')
            
            # Store reference to original tab
            original_page = page
            
            # Add some debugging info
            print(f"🔍 Current page count: {len(context.pages)}")
            
            try:
                # Wait for new tab to open when clicking the button
                print(f"⏳ Waiting for new tab to open...")
                async with context.expect_page(timeout=15000) as new_page_info:
                    await email_password_button.click()
                
                # Switch to the new tab for login
                login_page = await new_page_info.value
                print(f"✅ New tab opened: {login_page.url}")
                await login_page.wait_for_load_state()
                print(f"🔍 New page count: {len(context.pages)}")
                job_manager.update_job(job_id, "creating", progress=20)
                
            except Exception as popup_error:
                print(f"❌ Failed to open popup: {popup_error}")
                print(f"🔄 Attempting direct navigation to StackBlitz login...")
                
                # Fallback: navigate directly to StackBlitz login URL
                stackblitz_url = "https://stackblitz.com/sign_in?redirect_to=%2Foauth%2Fauthorize%3Fclient_id%3Dbolt%26response_type%3Dcode%26redirect_uri%3Dhttps%253A%252F%252Fbolt.new%252Foauth2%26code_challenge_method%3DS256%26code_challenge%3DgNZVFMfZyeHAs4wPk9ISUdkuxaC0VVoM19aar-IzHn8%26state%3D2258c671-46c1-4b10-a2f6-c432ac89ee09%26scope%3Dpublic%26bolt_oauth_provider%3Dlogin_password"
                login_page = await context.new_page()
                await login_page.goto(stackblitz_url)
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
            
            # Step 8: Handle tab closure and switch back to original tab
            print(f"⏱️ Waiting for authentication to complete...")
            
            try:
                # Wait for the login tab to close automatically
                await login_page.wait_for_event('close', timeout=60000)
                print(f"✅ Login tab closed automatically")
            except:
                # If tab doesn't close automatically, close it manually
                print(f"⏳ Login tab didn't close automatically, closing manually...")
                try:
                    await login_page.close()
                except:
                    pass  # Tab might already be closed

            # Switch back to original tab
            page = original_page
            await page.bring_to_front()
            
            # Reload the original tab to ensure we're authenticated
            print(f"🔄 Reloading original tab to check authentication...")
            await page.reload()
            # await page.wait_for_load_state('networkidle')
            
            # Wait a bit more for any dynamic content to load
            await asyncio.sleep(2)
            job_manager.update_job(job_id, "creating", progress=42)
            
            # Step 9: Enter description
            print(f"📝 Entering description...")
            
            # Check if we're authenticated by looking for the textarea
            try:
                # Check if we see the sign-in button (meaning we're not authenticated)
                sign_in_button_exists = await page.locator('button:has-text("Sign In")').count() > 0
                if sign_in_button_exists:
                    raise Exception("Still not authenticated after login process")
                
                # Wait for the textarea to be ready and fill it
                print(f"🔍 Looking for textarea...")
                textarea_locator = page.locator('textarea')
                await textarea_locator.wait_for(state='visible', timeout=15000)
                
                print(f"✅ Textarea found, filling with description...")
                prompt = f"Create a beautifully designed minimal website based on this detailed description the user has provided in sketch form: {description}"
                await textarea_locator.fill(prompt)
                job_manager.update_job(job_id, "creating", progress=44)
                
            except Exception as e:
                print(f"❌ Error with textarea: {e}")
                print(f"🔍 Current URL: {page.url}")
                print(f"🔍 Page title: {await page.title()}")
                
                # Try to get page content for debugging
                try:
                    content = await page.content()
                    print(f"🔍 Page contains 'textarea': {'textarea' in content.lower()}")
                    print(f"🔍 Page contains 'Sign In': {'sign in' in content.lower()}")
                except:
                    pass
                    
                raise e
            
            # Step 10: Click submit button
            print(f"🚀 Clicking submit button...")
            submit_button = await page.wait_for_selector('button:has(div.i-ph\\:arrow-right)')
            await submit_button.click()
            job_manager.update_job(job_id, "creating", progress=46)
            
            # Step 11: Wait for creation to start and complete
            print(f"⏳ Waiting for website creation to complete...")
            await page.wait_for_selector('div.i-ph\\:stop-circle-bold', timeout=10000)
            job_manager.update_job(job_id, "creating", progress=50)
            
            # Wait for stop icon to disappear (creation complete)
            print(f"⏳ Waiting for creation to finish...")
            await page.wait_for_selector('div.i-ph\\:stop-circle-bold', state='detached', timeout=180000)  # 3 min timeout
            job_manager.update_job(job_id, "creating", progress=70)
            
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