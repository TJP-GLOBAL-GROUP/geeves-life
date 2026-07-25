/**
 * Geeves.Life — Standalone Login Page (/login)
 *
 * Extracted from DashboardLayout so the landing page can link here directly.
 * DashboardLayout still handles the auth gate for all protected routes —
 * this page is the explicit "Sign In" destination from the public landing page.
 */

import { useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { getGoogleLoginUrl } from "@/const";

const TEAL = "#2AAFA9";
const CHARCOAL = "#1A1C20";
const WARM_WHITE = "#FAFAF8";
const MID_CHARCOAL = "#3D4148";

export default function Login() {
  const { data: user, isLoading } = trpc.auth.me.useQuery();
  const [, navigate] = useLocation();

  // If already authenticated, redirect to the dashboard
  useEffect(() => {
    if (!isLoading && user) {
      navigate("/dashboard");
    }
  }, [user, isLoading, navigate]);

  // Determine theme for logo
  const isDark = (() => {
    try {
      return (localStorage.getItem("geeves-theme") || "dark") !== "light";
    } catch {
      return true;
    }
  })();

  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center min-h-screen"
        style={{ backgroundColor: CHARCOAL }}
      >
        <div
          className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: `${TEAL}60`, borderTopColor: "transparent" }}
        />
      </div>
    );
  }

  if (user) return null; // redirecting

  return (
    <div
      className="relative flex flex-col items-center justify-center min-h-screen px-6 overflow-hidden"
      style={{ backgroundColor: CHARCOAL }}
    >
      {/* Subtle radial glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 70% 50% at 50% 40%, ${TEAL}0e 0%, transparent 70%)`,
        }}
      />

      <div className="relative z-10 flex flex-col items-center gap-8 max-w-sm w-full">
        {/* Logo */}
        <img
          src="/manus-storage/universal_logo_34c85c76.svg"
          alt="Geeves.Life — Operating System"
          className="w-44 h-auto"
          draggable={false}
        />

        {/* Card */}
        <div
          className="w-full flex flex-col gap-6 p-8 rounded-2xl border"
          style={{
            backgroundColor: "#1E2024",
            borderColor: `${MID_CHARCOAL}60`,
          }}
        >
          <div className="text-center">
            <h1
              className="text-xl font-bold mb-1"
              style={{ fontFamily: "Outfit, sans-serif", color: WARM_WHITE }}
            >
              Welcome back
            </h1>
            <p
              className="text-sm"
              style={{ color: `${WARM_WHITE}50`, fontFamily: "Inter, sans-serif" }}
            >
              Sign in to your Geeves.Life household
            </p>
          </div>

          {/* Google sign-in button */}
          <button
            onClick={() => { window.location.href = getGoogleLoginUrl(); }}
            className="w-full flex items-center justify-center gap-3 py-3 px-5 rounded-xl font-semibold text-sm transition-all"
            style={{
              backgroundColor: TEAL,
              color: CHARCOAL,
              fontFamily: "Inter, sans-serif",
              boxShadow: `0 0 24px ${TEAL}30`,
            }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.boxShadow = `0 0 36px ${TEAL}50`)}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.boxShadow = `0 0 24px ${TEAL}30`)}
          >
            {/* Google G logo */}
            <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>

          {/* Legal */}
          <p
            className="text-xs text-center"
            style={{ color: `${WARM_WHITE}30`, fontFamily: "Inter, sans-serif" }}
          >
            By signing in, you agree to our{" "}
            <a
              href="/terms"
              className="underline transition-colors"
              style={{ color: `${TEAL}90` }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = TEAL)}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = `${TEAL}90`)}
            >
              Terms of Service
            </a>
            {" "}and{" "}
            <a
              href="/privacy"
              className="underline transition-colors"
              style={{ color: `${TEAL}90` }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = TEAL)}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = `${TEAL}90`)}
            >
              Privacy Policy
            </a>.
          </p>
        </div>

        {/* Back to landing */}
        <a
          href="/"
          className="text-xs transition-colors"
          style={{ color: `${WARM_WHITE}30`, fontFamily: "Inter, sans-serif" }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = `${WARM_WHITE}60`)}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = `${WARM_WHITE}30`)}
        >
          ← Back to Geeves.Life
        </a>
      </div>
    </div>
  );
}
