# Project Media R2 Setup

Create a dedicated private Cloudflare R2 bucket and set `R2_PROJECT_MEDIA_BUCKET` for the API. Keep the existing product-image bucket configuration separate.

The API generates short-lived signed PUT URLs for uploads and signed GET URLs for downloads. R2 API credentials never reach the web or mobile clients.

Configure the private bucket's CORS policy for each trusted application origin. Include local development only when needed:

```json
[
  {
    "AllowedOrigins": ["https://your-app.example", "http://localhost:3000"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Upload flow:

1. Request `POST /api/v1/projects/:projectId/media/upload-url`.
2. Upload the photo to the returned signed URL using the declared `Content-Type`.
3. Call `POST /api/v1/project-media/:mediaId/complete` to verify the R2 object and publish it.
4. Render photos only via `GET /api/v1/project-media/:mediaId/download-url`.

Set `visibility` to `project` to share with all project participants, or `recipients` plus `recipient_user_ids` to send a private photo to selected active project members.
