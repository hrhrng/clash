# Cloudflare R2 Setup Guide

This guide will help you set up Cloudflare R2 Object Storage for the Master Clash project.

## Prerequisites

- A Cloudflare account
- Access to Cloudflare R2 (may require payment method verification)

## Step 1: Create R2 Bucket

1. **Log in to Cloudflare Dashboard**
   - Go to https://dash.cloudflare.com

2. **Navigate to R2**
   - In the left sidebar, click **R2 Object Storage**
   - If this is your first time, you may need to enable R2

3. **Create a New Bucket**
   - Click **Create bucket**
   - Enter a bucket name (e.g., `master-clash-assets`)
   - Choose your preferred location (optional, defaults to auto)
   - Click **Create bucket**

## Step 2: Enable Public Access

1. **Go to Bucket Settings**
   - Click on your newly created bucket
   - Navigate to **Settings** tab

2. **Enable Public Access**
   - Under **Public Access**, toggle **Allow Public Access**
   - Click **Enable public access** to confirm
   - Copy the **Public bucket URL** (e.g., `https://pub-xxx.r2.dev`)
   - Save this URL - you'll need it later

## Step 3: Create API Token

1. **Manage R2 API Tokens**
   - Go back to R2 overview page
   - Click **Manage R2 API Tokens**

2. **Create API Token**
   - Click **Create API token**
   - Enter a token name (e.g., `master-clash-backend`)
   - Under **Permissions**, select:
     - ☑ **Object Read & Write**
   - Under **Scope**, select **Apply to specific buckets only**
   - Select your bucket from the dropdown
   - Click **Create API token**

3. **Save Credentials**
   **IMPORTANT:** Copy these values immediately - they won't be shown again!
   - **Access Key ID** (starts with...)
   - **Secret Access Key** (long alphanumeric string)

4. **Get Account ID**
   - Your Account ID is shown in the URL or on the R2 overview page
   - Format: 32-character hex string

## Step 4: Configure Backend

1. **Edit Backend `.env` File**

   ```bash
   cd backend
   cp .env.example .env  # if you haven't already
   nano .env  # or use your preferred editor
   ```

2. **Add R2 Credentials**

   Update the R2 section in `.env`:

   ```bash
   # Cloudflare R2 Object Storage (S3-compatible)
   R2_ACCOUNT_ID=your-cloudflare-account-id
   R2_ACCESS_KEY_ID=your-r2-access-key-id
   R2_SECRET_ACCESS_KEY=your-r2-secret-access-key
   R2_BUCKET_NAME=master-clash-assets  # or your bucket name
   R2_PUBLIC_URL=https://pub-xxx.r2.dev  # your public URL
   ```

3. **Save and Close**

## Step 5: Test the Setup

1. **Start Backend Server**

   ```bash
   cd backend
   uv run python -m master_clash.api.main
   ```

   The server should start on `http://localhost:8000`

2. **Start Frontend Dev Server**

   ```bash
   cd frontend
   npm run dev
   ```

   The frontend should start on `http://localhost:3000`

3. **Test Image Generation**

   - Open a project in the frontend
   - Add a **Text Node** with a prompt (e.g., "A cute cat wearing a hat")
   - Add an **Image Generation Node** (Action Badge with image icon)
   - Connect the Text Node to the Image Generation Node
   - Click the **Play button** on the Image Generation Node
   - Wait for the image to generate (may take 10-30 seconds)
   - A new Image Node should appear with the generated image

4. **Test Video Generation** (requires image first)

   - Use an existing Image Node or generate one
   - Add a **Text Node** with a video prompt (e.g., "Cat looking around")
   - Add a **Video Generation Node** (Action Badge with video icon)
   - Connect both the Image Node and Text Node to the Video Generation Node
   - Click the **Play button** on the Video Generation Node
   - Wait for the video to generate (may take 1-2 minutes for Kling)
   - A new Video Node should appear with the generated video

## Troubleshooting

### Error: "R2 configuration incomplete"

- Check that all R2 environment variables are set in `backend/.env`
- Make sure there are no extra spaces or quotes around the values
- Restart the backend server after updating `.env`

### Error: "Image generation failed"

- Check backend logs for detailed error messages
- Verify `GOOGLE_API_KEY` is set correctly in `backend/.env`
- Ensure you have Google AI API quota available

### Error: "Video generation failed"

- Check that `KLING_ACCESS_KEY` and `KLING_SECRET_KEY` are set in `backend/.env`
- Verify the input image URL is accessible
- Check Kling API quota/billing

### Assets not appearing in frontend

- Open browser DevTools → Network tab to see if the API call succeeded
- Check that the asset URL is accessible (try opening it in a new tab)
- Verify the `assets` table exists in `frontend/local.db`

### CORS errors

- Make sure backend is running on `http://localhost:8000`
- Frontend should be on `http://localhost:3000`
- Check browser console for specific CORS error messages

## Architecture Overview

### How It Works

1. **Frontend** (Next.js + React Flow)
   - User creates nodes and connections in the visual canvas
   - ActionBadge nodes execute image/video generation
   - Results are displayed as new Image/Video nodes

2. **Backend** (FastAPI + Python)
   - Receives generation requests from frontend
   - Calls AI APIs (Google Gemini for images, Kling for videos)
   - Uploads generated assets to R2
   - Creates asset records in SQLite database
   - Returns asset metadata to frontend

3. **Database** (SQLite)
   - Shared between frontend and backend
   - Stores projects, messages, and **assets**
   - Asset records include: name, project_id, storage_key, url, type

4. **Storage** (Cloudflare R2)
   - S3-compatible object storage
   - Stores generated images and videos
   - Public bucket for direct download URLs

### File Structure

```
master-clash/
├── frontend/
│   ├── local.db                         # SQLite database (shared)
│   ├── lib/db/schema.ts                 # Database schema with assets table
│   └── app/components/
│       ├── ProjectContext.tsx           # Project ID context provider
│       ├── ProjectEditor.tsx            # Main canvas component
│       └── nodes/ActionBadge.tsx        # Action execution logic
│
├── backend/
│   ├── .env                             # Configuration (R2, API keys)
│   └── src/master_clash/
│       ├── config.py                    # Settings with R2 config
│       ├── database/sqlite_client.py    # Database access layer
│       ├── tools/
│       │   ├── r2_storage.py           # R2 upload/download utilities
│       │   ├── nano_banana.py           # Image generation (Gemini)
│       │   └── kling_video.py           # Video generation (Kling)
│       └── api/main.py                  # FastAPI endpoints
│
└── R2_SETUP_GUIDE.md                    # This guide
```

## Next Steps

- Set up proper error handling and retry logic
- Add progress indicators for long-running generations
- Implement asset versioning and management
- Add support for batch generation (count > 1)
- Set up R2 lifecycle policies for storage optimization

## Support

If you encounter any issues:
1. Check the backend logs for detailed error messages
2. Verify all environment variables are set correctly
3. Ensure R2 bucket permissions are configured properly
4. Test R2 connection separately using boto3

Happy generating! 🎨🎬
