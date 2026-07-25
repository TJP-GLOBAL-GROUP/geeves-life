export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Generate Manus OAuth login URL at runtime.
export const getLoginUrl = () => {
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;
  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const state = btoa(redirectUri);

  const url = new URL(`${oauthPortalUrl}/app-auth`);
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");

  return url.toString();
};

// Generate Google OAuth login URL.
export const getGoogleLoginUrl = (returnPath?: string) => {
  const origin = window.location.origin;
  const path = returnPath || "/dashboard";
  return `${origin}/api/auth/google/login?origin=${encodeURIComponent(origin)}&returnPath=${encodeURIComponent(path)}`;
};

// Generate URL to connect an additional Google account (without replacing the current session).
export const getGoogleConnectAccountUrl = (returnPath?: string) => {
  const origin = window.location.origin;
  const path = returnPath || "/settings?tab=calendars";
  return `${origin}/api/auth/google/connect-account?origin=${encodeURIComponent(origin)}&returnPath=${encodeURIComponent(path)}`;
};
