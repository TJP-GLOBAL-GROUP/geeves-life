import { describe, it, expect, vi, beforeEach } from "vitest";

describe("Google Calendar Sync Integration", () => {
  describe("OAuth Configuration", () => {
    it("should detect when Google OAuth is configured", async () => {
      const { isGoogleCalendarConfigured } = await import("./services/googleCalendarSync");
      const configured = isGoogleCalendarConfigured();
      expect(typeof configured).toBe("boolean");
      if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
        expect(configured).toBe(true);
      }
    });
  });

  describe("convertGoogleEvent", () => {
    it("should convert a Google Calendar event to Geeves format", async () => {
      const { convertGoogleEvent } = await import("./services/googleCalendarSync");
      
      const googleEvent = {
        id: "abc123",
        summary: "Team Meeting",
        description: "Weekly standup",
        location: "Conference Room A",
        start: { dateTime: "2025-05-10T10:00:00-05:00" },
        end: { dateTime: "2025-05-10T11:00:00-05:00" },
        status: "confirmed",
        recurrence: null,
        attendees: [{ email: "test@example.com", responseStatus: "accepted" }],
        reminders: { useDefault: true },
        etag: '"abc123etag"',
      };

      const result = convertGoogleEvent(googleEvent, "cal-123");
      
      expect(result.externalId).toBe("abc123");
      expect(result.title).toBe("Team Meeting");
      expect(result.description).toBe("Weekly standup");
      expect(result.location).toBe("Conference Room A");
      expect(result.startTime).toBeTypeOf("number");
      expect(result.endTime).toBeTypeOf("number");
      expect(result.endTime).toBeGreaterThan(result.startTime);
      expect(result.isAllDay).toBe(false);
      expect(result.status).toBe("confirmed");
    });

    it("should handle all-day events", async () => {
      const { convertGoogleEvent } = await import("./services/googleCalendarSync");
      
      const allDayEvent = {
        id: "allday123",
        summary: "Birthday",
        description: null,
        location: null,
        start: { date: "2025-05-10" },
        end: { date: "2025-05-11" },
        status: "confirmed",
        recurrence: null,
        attendees: null,
        reminders: null,
        etag: '"etag"',
      };

      const result = convertGoogleEvent(allDayEvent, "cal-123");
      
      expect(result.externalId).toBe("allday123");
      expect(result.title).toBe("Birthday");
      expect(result.isAllDay).toBe(true);
    });

    it("should handle events with no summary (untitled)", async () => {
      const { convertGoogleEvent } = await import("./services/googleCalendarSync");
      
      const noTitleEvent = {
        id: "notitle123",
        summary: undefined,
        description: null,
        location: null,
        start: { dateTime: "2025-05-10T14:00:00Z" },
        end: { dateTime: "2025-05-10T15:00:00Z" },
        status: "tentative",
        recurrence: null,
        attendees: null,
        reminders: null,
        etag: '"etag"',
      };

      const result = convertGoogleEvent(noTitleEvent, "cal-123");
      
      expect(result.title).toBe("(No title)");
      // Implementation maps all non-cancelled statuses to "confirmed"
      expect(result.status).toBe("confirmed");
    });
  });

  describe("Webhook Handler", () => {
    it("should export setupCalendarWebhook function", async () => {
      const { setupCalendarWebhook } = await import("./services/calendarWebhook");
      expect(typeof setupCalendarWebhook).toBe("function");
    });

    it("should export performIncrementalSync function", async () => {
      const { performIncrementalSync } = await import("./services/calendarWebhook");
      expect(typeof performIncrementalSync).toBe("function");
    });

    it("should export discoverGoogleCalendars function", async () => {
      const { discoverGoogleCalendars } = await import("./services/calendarWebhook");
      expect(typeof discoverGoogleCalendars).toBe("function");
    });

    it("should export connectGoogleCalendar function", async () => {
      const { connectGoogleCalendar } = await import("./services/calendarWebhook");
      expect(typeof connectGoogleCalendar).toBe("function");
    });
  });

  describe("Google OAuth Callback", () => {
    it("should export setupGoogleOAuth function", async () => {
      const { setupGoogleOAuth } = await import("./auth/googleOAuth");
      expect(typeof setupGoogleOAuth).toBe("function");
    });
  });

  describe("DB Helpers for Sync", () => {
    it("should export upsertEvent function", async () => {
      const db = await import("./db");
      expect(typeof db.upsertEvent).toBe("function");
    });

    it("should export updateCalendarSyncToken function", async () => {
      const db = await import("./db");
      expect(typeof db.updateCalendarSyncToken).toBe("function");
    });

    it("should export getCalendarSyncToken function", async () => {
      const db = await import("./db");
      expect(typeof db.getCalendarSyncToken).toBe("function");
    });

    it("should export createWebhookChannel function", async () => {
      const db = await import("./db");
      expect(typeof db.createWebhookChannel).toBe("function");
    });

    it("should export getWebhookChannelByResourceId function", async () => {
      const db = await import("./db");
      expect(typeof db.getWebhookChannelByResourceId).toBe("function");
    });

    it("should export createSyncLogEntry function", async () => {
      const db = await import("./db");
      expect(typeof db.createSyncLogEntry).toBe("function");
    });
  });
});
