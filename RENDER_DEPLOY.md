# Render Deployment Instructions

This guide will help you deploy the Browser Use automation service to Render.

## Prerequisites

- Render account (free tier works)
- GitHub repository with the docker-container code
- StackBlitz account credentials for automation
- API keys (GROQ_API_KEY or OPENAI_API_KEY)

## Step 1: Prepare Your Repository

Ensure your repository contains the `docker-container/` directory with:
- `main.py`
- `automation.py` 
- `job_manager.py`
- `Dockerfile`
- `requirements.txt`

## Step 2: Create Web Service on Render

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Configure the service:

### Basic Settings
- **Name**: `bolt-woodpecker-automation`
- **Region**: Choose closest to your users
- **Branch**: `main` (or your default branch)
- **Root Directory**: `docker-container`
- **Runtime**: `Docker`

### Build & Deploy Settings
- **Build Command**: (leave empty - Docker handles this)
- **Start Command**: (leave empty - Docker CMD handles this)

## Step 3: Environment Variables

Add these environment variables in Render:

### Required
- `GROQ_API_KEY`: Your GROQ API key (or use OPENAI_API_KEY instead)
- `STACKBLITZ_EMAIL`: Email for StackBlitz login
- `STACKBLITZ_PASSWORD`: Password for StackBlitz login

### Optional
- `OPENAI_API_KEY`: OpenAI API key (alternative to GROQ)
- `BROWSER_USE_HEADLESS`: `true` (already set in Dockerfile)

## Step 4: Deploy

1. Click "Create Web Service"
2. Render will automatically:
   - Clone your repository
   - Build the Docker container
   - Install Playwright and browsers
   - Start the FastAPI server

## Step 5: Update Your Main App

Once deployed, update your main Next.js app's API endpoint:

In `app/api/create-website/route.ts`, replace the mock URL:

```typescript
// Replace this line:
const containerUrl = 'http://localhost:8000'; // Mock for development

// With your Render service URL:
const containerUrl = 'https://your-service-name.onrender.com';
```

Your service URL will be: `https://bolt-woodpecker-automation.onrender.com`

## Step 6: Test the Deployment

1. Check service health: `GET https://your-service-name.onrender.com/`
2. Should return:
   ```json
   {
     "service": "Website Creation Service",
     "status": "running", 
     "version": "1.0.0"
   }
   ```

## Troubleshooting

### Common Issues

**Build fails with Playwright errors:**
- This is normal on first deploy - Render may timeout during browser installation
- The service will retry automatically and usually succeeds on second attempt

**Service crashes on startup:**
- Check logs in Render dashboard
- Usually caused by missing environment variables

**Automation fails:**
- Verify StackBlitz credentials are correct
- Check that GROQ_API_KEY or OPENAI_API_KEY is set
- Review service logs for browser automation errors

### Monitoring

- **Logs**: Available in Render dashboard under "Logs" tab
- **Metrics**: Monitor CPU/Memory usage in "Metrics" tab
- **Health**: Service responds to `GET /` for health checks

### Performance Notes

- **Cold starts**: First request after inactivity may take 30-60 seconds
- **Browser memory**: Each automation uses ~200-500MB RAM
- **Concurrent jobs**: Free tier supports 1-2 concurrent automations

## Scaling Considerations

### Free Tier Limits
- 750 hours/month runtime
- 512MB RAM
- Sleeps after 15 minutes of inactivity

### Paid Tier Benefits
- No sleep mode
- More RAM for concurrent automations
- Faster cold start times

## Security

- Never commit credentials to the repository
- Use Render's environment variables for all secrets
- StackBlitz credentials are only used for automation, not stored

## Next Steps

After successful deployment:
1. Test the full workflow in your main app
2. Monitor initial usage and performance
3. Consider upgrading to paid tier based on usage patterns

## Support

If you encounter issues:
1. Check Render service logs
2. Verify all environment variables are set
3. Test the service endpoints directly
4. Review Browser Use documentation for automation issues