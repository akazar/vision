# Deployment Guide for Render

This guide will help you deploy the Vision Detection application to Render.

## Prerequisites

1. A Render account (sign up at https://render.com)
2. A GitHub repository with your code (or GitLab/Bitbucket)
3. An OpenAI API key

## Deployment Steps

### 1. Prepare Your Repository

Make sure your code is pushed to a Git repository (GitHub, GitLab, or Bitbucket).

### 2. Create a New Web Service on Render

1. Log in to your Render dashboard
2. Click "New +" and select "Web Service"
3. Connect your repository:
   - If using GitHub/GitLab/Bitbucket, authorize Render to access your repositories
   - Select the repository containing this project
   - Select the branch you want to deploy (usually `main` or `master`)

### 3. Configure Build Settings

Render will auto-detect the settings from `render.yaml`, but you can also configure manually:

- **Name**: `vision-app` (or any name you prefer)
- **Environment**: `Node`
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Root Directory**: Leave empty (or set to `.` if needed)

### 4. Set Environment Variables

In the Render dashboard, go to the "Environment" section and add:

- **Key**: `OPENAI_API_KEY`
- **Value**: Your OpenAI API key (starts with `sk-...`)

Optional environment variables:
- **Key**: `PORT`
- **Value**: `10000` (Render sets this automatically, but you can override)
- **Key**: `NODE_ENV`
- **Value**: `production`

### 5. Deploy

1. Click "Create Web Service"
2. Render will start building and deploying your application
3. Wait for the build to complete (usually 2-5 minutes)
4. Once deployed, you'll get a URL like `https://vision-app.onrender.com`

### 6. Access Your Application

- Your application will be available at the provided Render URL
- The frontend will be served at the root URL (`/`)
- The API endpoint will be at `/api/analyze`
- Health check endpoint: `/health`

## Important Notes

### HTTPS Requirement

- Render provides HTTPS automatically
- The frontend uses relative URLs, so it will automatically use HTTPS when deployed
- Camera access requires HTTPS in production (which Render provides)

### Environment Variables

- **Never commit your `.env` file** - it's already in `.gitignore`
- Always set sensitive variables (like `OPENAI_API_KEY`) in the Render dashboard
- Environment variables set in Render will override any `.env` file values

### Auto-Deploy

- Render automatically deploys when you push to your connected branch
- You can disable auto-deploy in the service settings if needed
- Manual deploys are also available from the dashboard

### Free Tier Limitations

If using Render's free tier:
- Services spin down after 15 minutes of inactivity
- First request after spin-down may take 30-60 seconds
- Consider upgrading to a paid plan for always-on service

### Troubleshooting

1. **Build fails**: Check the build logs in Render dashboard
2. **API not working**: Verify `OPENAI_API_KEY` is set correctly
3. **Frontend not loading**: Check that `edge` directory files are being served
4. **Camera not working**: Ensure you're accessing via HTTPS (Render provides this)

## Testing After Deployment

1. Visit your Render URL
2. Click the "Start" button (▶) to initialize detection
3. Allow camera access when prompted
4. Test object detection
5. Test the capture and API analysis feature

## Updating Your Deployment

To update your deployed application:

1. Make changes to your code
2. Commit and push to your repository
3. Render will automatically detect the changes and redeploy
4. Monitor the deployment in the Render dashboard

## Alternative: Manual Deployment

If you prefer not to use `render.yaml`:

1. In Render dashboard, manually set:
   - Build Command: `npm install`
   - Start Command: `npm start`
2. Add environment variables as described above
3. Deploy

## Support

For Render-specific issues, check:
- Render Documentation: https://render.com/docs
- Render Status: https://status.render.com

For application-specific issues, check the project README.md
