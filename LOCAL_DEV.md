# Local Development Setup

This guide helps you set up the Browser Use automation service locally for development and testing.

## Prerequisites

- Python 3.11+
- Docker Desktop
- Node.js 18+ (for the main Next.js app)
- StackBlitz account for testing automation

## Option 1: Python Virtual Environment (Recommended for Development)

### Step 1: Set up Python Environment

```bash
# Navigate to docker-container directory
cd docker-container

# Create virtual environment
python -m venv venv

# Activate virtual environment
# On macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Install Playwright browsers
playwright install chromium
playwright install-deps chromium
```

### Step 2: Set Environment Variables

Create a `.env` file in the `docker-container/` directory:

```bash
# API Keys (choose one)
GROQ_API_KEY=your_groq_api_key_here
# OR
OPENAI_API_KEY=your_openai_api_key_here

# StackBlitz Credentials for testing
STACKBLITZ_EMAIL=your_email@example.com
STACKBLITZ_PASSWORD=your_password

# Development settings
BROWSER_USE_HEADLESS=false  # Set to true to run headless
```

### Step 3: Run the Service

```bash
# Make sure you're in docker-container/ with venv activated
python main.py

# Or using uvicorn directly:
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

The service will be available at: `http://localhost:8000`

### Step 4: Test the Service

```bash
# Health check
curl http://localhost:8000/

# Expected response:
{
  "service": "Website Creation Service",
  "status": "running",
  "version": "1.0.0"
}
```

## Option 2: Docker Development

### Step 1: Build Docker Image

```bash
# From the docker-container directory
cd docker-container

# Build the image
docker build -t bolt-woodpecker-automation .
```

### Step 2: Run with Environment Variables

```bash
# Run with environment variables
docker run -d \
  --name bolt-automation \
  -p 8000:8000 \
  -e GROQ_API_KEY=your_groq_api_key_here \
  -e STACKBLITZ_EMAIL=your_email@example.com \
  -e STACKBLITZ_PASSWORD=your_password \
  -e BROWSER_USE_HEADLESS=true \
  bolt-woodpecker-automation
```

### Step 3: View Logs

```bash
# View logs
docker logs -f bolt-automation

# Stop container
docker stop bolt-automation

# Remove container
docker rm bolt-automation
```

## Integration with Main Next.js App

### Step 1: Update API Endpoint

In your main app's `app/api/create-website/route.ts`:

```typescript
// For local development
const containerUrl = "http://localhost:8000";

// Replace the mock response with actual API call
const response = await fetch(`${containerUrl}/create-website`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    jobId,
    imageBase64,
    description,
    credentials: {
      email: process.env.STACKBLITZ_EMAIL,
      password: process.env.STACKBLITZ_PASSWORD,
    },
  }),
});
```

### Step 2: Add Environment Variables to Main App

Add to your main app's `.env.local`:

```bash
STACKBLITZ_EMAIL=your_email@example.com
STACKBLITZ_PASSWORD=your_password
```

### Step 3: Test End-to-End Workflow

1. Start the automation service (Python venv or Docker)
2. Start your Next.js app: `npm run dev`
3. Open the canvas application
4. Draw a website mockup
5. Use the magic wand tool to circle the drawing
6. Ask to "create a website" in the text
7. Watch the automation process in real-time

## Development Tips

### Debugging Browser Automation

**See the browser in action:**

```bash
# Set headless to false in .env
BROWSER_USE_HEADLESS=false
```

**Monitor automation logs:**

```bash
# Python venv - logs appear in terminal
# Docker - use docker logs -f bolt-automation
```

### Testing Different Scenarios

**Test with different image types:**

- Simple wireframes
- Detailed mockups
- Hand-drawn sketches
- Text descriptions

**Test error scenarios:**

- Invalid credentials
- Network timeouts
- Malformed requests

### Common Development Issues

**Playwright browser not found:**

```bash
# Reinstall browsers
playwright install chromium
playwright install-deps chromium
```

**Permission errors on macOS:**

```bash
# May need to allow screen recording for browser automation
# System Preferences → Security & Privacy → Privacy → Screen Recording
```

**API key errors:**

```bash
# Verify environment variables are loaded
echo $GROQ_API_KEY
# or
printenv | grep GROQ
```

## File Structure

```
docker-container/
├── main.py              # FastAPI server
├── automation.py        # Browser Use automation logic
├── job_manager.py       # Job status management
├── requirements.txt     # Python dependencies
├── Dockerfile          # Container configuration
├── .env                # Environment variables (create this)
├── venv/               # Virtual environment (created by you)
└── data/               # Job data storage (created automatically)
```

## Development Workflow

1. **Make changes** to Python files
2. **Restart service** (auto-reload with `--reload` flag)
3. **Test changes** in Next.js app
4. **Check logs** for debugging
5. **Iterate** on automation logic

## Performance Notes

- **Local development**: Browser automation is slower than production
- **Headless mode**: Significantly faster than visible browser
- **API calls**: Each automation makes multiple API calls to GROQ/OpenAI
- **Memory usage**: Each job uses 200-500MB RAM

## Next Steps

After local development works:

1. Test with different website types
2. Optimize automation timing
3. Add error handling improvements
4. Deploy to Render using `RENDER_DEPLOY.md`

## Troubleshooting

**Virtual environment issues:**

```bash
# Deactivate and recreate
deactivate
rm -rf venv
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

**Docker issues:**

```bash
# Clean up Docker
docker system prune -a
# Rebuild image
docker build --no-cache -t bolt-woodpecker-automation .
```

**Browser automation fails:**

- Check StackBlitz credentials
- Verify internet connection
- Try with `BROWSER_USE_HEADLESS=false` to see what's happening
