/**
 * Pluggable Auth Provider Interface for Geeves Life
 */

export interface AuthProvider {
  name: string;
  getAuthorizationUrl(state: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<TokenResponse>;
  refreshAccessToken(refreshToken: string): Promise<TokenResponse>;
  getUserProfile(accessToken: string): Promise<UserProfile>;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  tokenType: string;
  scope?: string;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  picture?: string;
  locale?: string;
}

/**
 * Incremental authorisation scope sets.
 *
 * OAuth 2.0 best practice (and Google policy) requires requesting only the
 * scopes needed for the current operation. Requesting calendar/gmail scopes
 * at login — before the user has set up any integrations — violates this
 * principle and is the primary reason Google apps fail the verification review.
 *
 * LOGIN: identity-only — no sensitive scopes. The user just needs to sign in.
 * CALENDAR: requested when the user connects a Google account for calendar sync.
 * GMAIL_SEND: requested when the user enables the email-send integration.
 */
export const GOOGLE_SCOPES = {
  /** Minimum scopes for sign-in — no sensitive data access */
  IDENTITY: [
    "openid",
    "email",
    "profile",
  ],
  /** Calendar events read+write + calendar list read-only — requested via Settings > Integrations > Add Account.
   *  IMPORTANT: Do NOT use the full 'calendar' scope — it grants share/permanently-delete access
   *  to all calendars, which Geeves never needs and will fail Google verification review.
   */
  CALENDAR: [
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  ],
  /** Gmail send-only — requested when user enables email notifications/invites */
  GMAIL_SEND: [
    "https://www.googleapis.com/auth/gmail.send",
  ],
  /**
   * Gmail read-only — requested when user enables email scraping for booking enrichment.
   * MUST only be requested in the incremental connect-account flow, NOT at login.
   * Grants read access to the inbox; used to parse booking confirmation emails.
   */
  GMAIL_READ: [
    "https://www.googleapis.com/auth/gmail.readonly",
  ],
  /** Google Sheets read+write — requested for tax workbook and expense classification */
  SHEETS: [
    "https://www.googleapis.com/auth/spreadsheets",
  ],
  /** Google Drive full access — requested for file management and uploads */
  DRIVE: [
    "https://www.googleapis.com/auth/drive",
  ],
} as const;

export class GoogleAuthProvider implements AuthProvider {
  name = "google";
  private clientId: string;
  private clientSecret: string;

  constructor(clientId: string, clientSecret: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  /**
   * Build a Google OAuth authorization URL.
   *
   * @param state   - Opaque state string (must include CSRF nonce)
   * @param redirectUri - The callback URL registered in Google Cloud Console
   * @param scopes  - Scope strings to request. Defaults to IDENTITY only.
   *                  Pass additional scope arrays for incremental auth.
   */
  getAuthorizationUrl(state: string, redirectUri: string, scopes: readonly string[] | string[] = GOOGLE_SCOPES.IDENTITY): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: [...scopes].join(" "),
      access_type: "offline",
      // Only force consent screen when requesting sensitive scopes.
      // For identity-only login, "select_account" gives a cleaner UX.
      prompt: scopes.length > GOOGLE_SCOPES.IDENTITY.length ? "consent" : "select_account",
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<TokenResponse> {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code, client_id: this.clientId, client_secret: this.clientSecret,
        redirect_uri: redirectUri, grant_type: "authorization_code",
      }),
    });
    if (!response.ok) throw new Error(`Google token exchange failed: ${await response.text()}`);
    const data = await response.json();
    return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresIn: data.expires_in, tokenType: data.token_type, scope: data.scope };
  }

  async refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken, client_id: this.clientId, client_secret: this.clientSecret, grant_type: "refresh_token",
      }),
    });
    if (!response.ok) throw new Error(`Google token refresh failed: ${await response.text()}`);
    const data = await response.json();
    return { accessToken: data.access_token, refreshToken: data.refresh_token || refreshToken, expiresIn: data.expires_in, tokenType: data.token_type, scope: data.scope };
  }

  async getUserProfile(accessToken: string): Promise<UserProfile> {
    const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new Error("Failed to fetch Google user profile");
    const data = await response.json();
    return { id: data.id, email: data.email, name: data.name, picture: data.picture, locale: data.locale };
  }
}
