# Geeves.Life — Required Environment Variables

This document lists all environment variables required to run the Geeves.Life application. Copy these to your hosting provider's secrets/environment configuration.

## Database

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | MySQL/TiDB connection string with SSL | `mysql://user:pass@host:4000/geeves?ssl={"rejectUnauthorized":true}` |

## Server

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | Server port (auto-assigned in production) | `3000` |
| `NODE_ENV` | Environment mode | `production` |
| `APP_URL` | Public-facing URL of the app | `https://geeves.manus.space` |
| `JWT_SECRET` | Session cookie signing secret | (random 64-char string) |

## Manus OAuth (fallback auth)

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_APP_ID` | Manus OAuth application ID | (UUID) |
| `OAUTH_SERVER_URL` | Manus OAuth backend base URL | `https://api.manus.im` |
| `VITE_OAUTH_PORTAL_URL` | Manus login portal URL (frontend) | `https://login.manus.im` |
| `OWNER_OPEN_ID` | Owner's Manus Open ID | (string) |
| `OWNER_NAME` | Owner's display name | `Tarik Perkins` |

## Google OAuth (primary login)

| Variable | Description | Example |
|----------|-------------|---------|
| `GOOGLE_CLIENT_ID` | Google OAuth 2.0 Client ID | `xxx.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 2.0 Client Secret | (string) |

## Google Service Account (Calendar webhooks)

| Variable | Description | Example |
|----------|-------------|---------|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Service account email | `xxx@project.iam.gserviceaccount.com` |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Service account JSON key (stringified) | `{"type":"service_account",...}` |

## Manus Built-in APIs

| Variable | Description | Example |
|----------|-------------|---------|
| `BUILT_IN_FORGE_API_URL` | Forge API base URL (server-side) | `https://forge.manus.im` |
| `BUILT_IN_FORGE_API_KEY` | Forge API bearer token (server-side) | (string) |
| `VITE_FRONTEND_FORGE_API_URL` | Forge API base URL (client-side) | `https://forge.manus.im` |
| `VITE_FRONTEND_FORGE_API_KEY` | Forge API bearer token (client-side) | (string) |

## Email

| Variable | Description | Example |
|----------|-------------|---------|
| `RESEND_API_KEY` | Resend email API key | `re_xxx` |

## Scheduled Jobs

| Variable | Description | Example |
|----------|-------------|---------|
| `SYSTEM_CRON_SECRET` | Secret for authenticating scheduled job requests | (random string) |

## Analytics (optional)

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_ANALYTICS_ENDPOINT` | Analytics collection endpoint | `https://analytics.example.com` |
| `VITE_ANALYTICS_WEBSITE_ID` | Analytics website ID | (UUID) |

## Branding

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_APP_TITLE` | Application title | `Geeves.Life` |
| `VITE_APP_LOGO` | Application logo URL | (URL) |
