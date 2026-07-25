/**
 * Geeves.Life — Public Landing Page
 *
 * Sections:
 *  1. Nav
 *  2. Hero — "Your life, orchestrated."
 *  3. Problem/Vision — the case for a life OS
 *  4. Features — what's in Phase 1
 *  5. Beta Signup — ICP-qualified application form
 *  6. About / Team
 *  7. Contact
 *  8. Footer
 *
 * Design language: Deep Charcoal #1A1C20 background, Vivid Teal #2AAFA9 accents,
 * Outfit Bold display, Inter body — matching the Geeves brand spec exactly.
 */

import { useState, useRef, useEffect } from "react";
import { Link } from "wouter";
import GeevesLogo, { GeevesConstellationMark } from "@/components/GeevesLogo";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

// ─── Brand constants ──────────────────────────────────────────────────────────
const TEAL = "#2AAFA9";
const CHARCOAL = "#1A1C20";
const DARK_CHARCOAL = "#2D3139";
const MID_CHARCOAL = "#3D4148";
const WARM_WHITE = "#FAFAF8";

// ─── Nav ──────────────────────────────────────────────────────────────────────
function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const navLinks = [
    { label: "About", href: "#about" },
    { label: "Features", href: "#features" },
    { label: "Beta", href: "#beta" },
    { label: "Team", href: "#team" },
    { label: "Contact", href: "#contact" },
  ];

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
      style={{
        backgroundColor: scrolled ? `${CHARCOAL}f0` : "transparent",
        backdropFilter: scrolled ? "blur(12px)" : "none",
        borderBottom: scrolled ? `1px solid ${MID_CHARCOAL}` : "1px solid transparent",
      }}
    >
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        {/* Wordmark — inline SVG, no network request, works on all devices */}
        <a href="#" style={{ textDecoration: "none" }}>
          <GeevesLogo size={36} showWordmark theme="dark" />
        </a>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-8">
          {navLinks.map(l => (
            <a
              key={l.label}
              href={l.href}
              className="text-sm font-medium transition-colors"
              style={{ color: `${WARM_WHITE}99`, fontFamily: "Inter, sans-serif" }}
              onMouseEnter={e => (e.currentTarget.style.color = WARM_WHITE)}
              onMouseLeave={e => (e.currentTarget.style.color = `${WARM_WHITE}99`)}
            >
              {l.label}
            </a>
          ))}
        </div>

        {/* CTA */}
        <div className="flex items-center gap-3">
          <a
            href="/login"
            className="hidden md:inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg border transition-all"
            style={{
              borderColor: `${TEAL}60`,
              color: TEAL,
              fontFamily: "Inter, sans-serif",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.backgroundColor = `${TEAL}15`;
              (e.currentTarget as HTMLElement).style.borderColor = TEAL;
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
              (e.currentTarget as HTMLElement).style.borderColor = `${TEAL}60`;
            }}
          >
            Sign In
          </a>
          <a
            href="#beta"
            className="hidden md:inline-flex items-center px-5 py-2 text-sm font-semibold rounded-lg transition-all"
            style={{
              backgroundColor: TEAL,
              color: CHARCOAL,
              fontFamily: "Inter, sans-serif",
            }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.opacity = "0.9")}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.opacity = "1")}
          >
            Request Beta Access
          </a>

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2"
            onClick={() => setMenuOpen(!menuOpen)}
            style={{ color: WARM_WHITE }}
            aria-label="Toggle menu"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              {menuOpen
                ? <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                : <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
              }
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div
          className="md:hidden px-6 pb-4 flex flex-col gap-4"
          style={{ backgroundColor: `${CHARCOAL}f8` }}
        >
          {navLinks.map(l => (
            <a
              key={l.label}
              href={l.href}
              className="text-sm font-medium py-1"
              style={{ color: `${WARM_WHITE}cc`, fontFamily: "Inter, sans-serif" }}
              onClick={() => setMenuOpen(false)}
            >
              {l.label}
            </a>
          ))}
          <a href="/login" className="text-sm font-medium py-1" style={{ color: TEAL }}>Sign In</a>
          <a
            href="#beta"
            className="inline-flex items-center justify-center px-5 py-2 text-sm font-semibold rounded-lg"
            style={{ backgroundColor: TEAL, color: CHARCOAL }}
            onClick={() => setMenuOpen(false)}
          >
            Request Beta Access
          </a>
        </div>
      )}
    </nav>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section
      className="relative min-h-screen flex flex-col items-center justify-center text-center px-6 pt-24 pb-20 overflow-hidden"
      style={{ backgroundColor: CHARCOAL }}
    >
      {/* Subtle radial glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 80% 60% at 50% 40%, ${TEAL}12 0%, transparent 70%)`,
        }}
      />

      {/* Constellation mark — inline SVG with wordmark + tagline, no network request */}
      <div className="relative z-10 mb-8 flex flex-col items-center gap-3">
        <GeevesConstellationMark size={120} theme="dark" />
        <div className="flex flex-col items-center gap-1">
          <span style={{ fontFamily: "'Outfit', 'Nunito', sans-serif", fontWeight: 700, fontSize: "2rem", letterSpacing: "-0.01em", lineHeight: 1, color: "#F8F7F4" }}>
            Geeves<span style={{ color: "#2AAFA9" }}>.Life</span>
          </span>
          <span style={{ fontFamily: "'Outfit', 'Nunito', sans-serif", fontWeight: 300, fontSize: "0.7rem", letterSpacing: "0.2em", color: "#8A8F9A", textTransform: "uppercase" }}>Operating System</span>
        </div>
      </div>

      {/* Headline */}
      <div className="relative z-10 max-w-4xl mx-auto">
        <div
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold tracking-widest uppercase mb-8 border"
          style={{
            borderColor: `${TEAL}40`,
            color: TEAL,
            backgroundColor: `${TEAL}10`,
            fontFamily: "Inter, sans-serif",
            letterSpacing: "0.15em",
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: TEAL }} />
          Now accepting beta applications
        </div>

        <h1
          className="text-5xl md:text-7xl font-bold leading-tight mb-6"
          style={{ fontFamily: "Outfit, sans-serif", color: WARM_WHITE }}
        >
          Your life,{" "}
          <span style={{ color: TEAL }}>orchestrated.</span>
        </h1>

        <p
          className="text-lg md:text-xl leading-relaxed max-w-2xl mx-auto mb-10"
          style={{ color: `${WARM_WHITE}80`, fontFamily: "Inter, sans-serif" }}
        >
          Geeves.Life is a private, intelligent life operating system — unifying your calendars, household, properties, finances, and family into one beautifully coordinated whole.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href="#beta"
            className="inline-flex items-center px-8 py-3.5 text-base font-semibold rounded-xl transition-all shadow-lg"
            style={{
              backgroundColor: TEAL,
              color: CHARCOAL,
              fontFamily: "Inter, sans-serif",
              boxShadow: `0 0 32px ${TEAL}40`,
            }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.boxShadow = `0 0 48px ${TEAL}60`)}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.boxShadow = `0 0 32px ${TEAL}40`)}
          >
            Request Beta Access
          </a>
          <a
            href="#features"
            className="inline-flex items-center gap-2 px-8 py-3.5 text-base font-medium rounded-xl border transition-all"
            style={{
              borderColor: `${WARM_WHITE}20`,
              color: `${WARM_WHITE}80`,
              fontFamily: "Inter, sans-serif",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.borderColor = `${WARM_WHITE}40`;
              (e.currentTarget as HTMLElement).style.color = WARM_WHITE;
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.borderColor = `${WARM_WHITE}20`;
              (e.currentTarget as HTMLElement).style.color = `${WARM_WHITE}80`;
            }}
          >
            See what's coming
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path fillRule="evenodd" d="M8 1a.5.5 0 01.5.5v11.793l3.146-3.147a.5.5 0 01.708.708l-4 4a.5.5 0 01-.708 0l-4-4a.5.5 0 01.708-.708L7.5 13.293V1.5A.5.5 0 018 1z"/>
            </svg>
          </a>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce" style={{ color: `${WARM_WHITE}30` }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 5v14M5 12l7 7 7-7"/>
        </svg>
      </div>
    </section>
  );
}

// ─── About / Vision ───────────────────────────────────────────────────────────
function About() {
  return (
    <section id="about" className="py-28 px-6" style={{ backgroundColor: "#1E2024" }}>
      <div className="max-w-5xl mx-auto">
        <div className="grid md:grid-cols-2 gap-16 items-center">
          <div>
            <p
              className="text-xs font-semibold tracking-widest uppercase mb-4"
              style={{ color: TEAL, fontFamily: "Inter, sans-serif", letterSpacing: "0.15em" }}
            >
              About Geeves.Life
            </p>
            <h2
              className="text-4xl md:text-5xl font-bold leading-tight mb-6"
              style={{ fontFamily: "Outfit, sans-serif", color: WARM_WHITE }}
            >
              Life is complex. <br />
              <span style={{ color: TEAL }}>It shouldn't feel that way.</span>
            </h2>
            <p
              className="text-base leading-relaxed mb-6"
              style={{ color: `${WARM_WHITE}70`, fontFamily: "Inter, sans-serif" }}
            >
              Most people manage their lives across a dozen disconnected apps — separate calendars, scattered notes, siloed finances, and no single view of what's actually happening. Every tool solves one problem and creates three more.
            </p>
            <p
              className="text-base leading-relaxed"
              style={{ color: `${WARM_WHITE}70`, fontFamily: "Inter, sans-serif" }}
            >
              Geeves.Life is built on a different premise: your life has structure. Verticals — work, family, property, personal — that intersect and inform each other. An intelligent life OS should understand that structure and work across all of it, not just one slice.
            </p>
          </div>

          <div className="flex flex-col gap-5">
            {[
              { icon: "◈", label: "Private by design", desc: "Your data is never sold or shared with advertisers. Full stop." },
              { icon: "◉", label: "Household-first", desc: "Built for real households — multiple members, multiple roles, multiple needs." },
              { icon: "◎", label: "Intelligent, not intrusive", desc: "Geeves surfaces what matters, when it matters — without noise." },
              { icon: "◐", label: "Extensible", desc: "Connects to the tools you already use. Grows with your life." },
            ].map(item => (
              <div
                key={item.label}
                className="flex gap-4 p-5 rounded-xl border"
                style={{ borderColor: `${MID_CHARCOAL}80`, backgroundColor: `${CHARCOAL}80` }}
              >
                <span className="text-2xl mt-0.5 shrink-0" style={{ color: TEAL }}>{item.icon}</span>
                <div>
                  <p className="font-semibold mb-1" style={{ color: WARM_WHITE, fontFamily: "Outfit, sans-serif" }}>{item.label}</p>
                  <p className="text-sm leading-relaxed" style={{ color: `${WARM_WHITE}60`, fontFamily: "Inter, sans-serif" }}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Features ─────────────────────────────────────────────────────────────────
function Features() {
  const features = [
    {
      color: "#2AAFA9",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
      ),
      title: "Master Calendar",
      desc: "All your Google Calendars — personal, professional, family — unified in one intelligent view. Day, week, and month views with conflict detection and vertical-scoped visibility.",
    },
    {
      color: "#E8624A",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
      ),
      title: "Property Management",
      desc: "Sync Airbnb, VRBO, and Booking.com calendars. See upcoming check-ins, prep days, and back-to-back bookings in a Gantt timeline. Built for hosts who manage multiple properties.",
    },
    {
      color: "#8B5CF6",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
        </svg>
      ),
      title: "Household Management",
      desc: "One household, multiple members, granular permissions. Verticals keep work, family, and personal life appropriately separated — without losing the big picture.",
    },
    {
      color: "#D4A017",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
        </svg>
      ),
      title: "Financial Overview",
      desc: "Track expenses, income, and budgets across your life verticals. See where money flows — by household, by property, by project — in one place.",
    },
    {
      color: "#4F7EC4",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
        </svg>
      ),
      title: "Notes & Knowledge",
      desc: "Capture thoughts, decisions, and reference material — linked to the right vertical, the right person, the right moment. Never lose context again.",
    },
    {
      color: "#E8943A",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      ),
      title: "Geeves — Your AI Assistant",
      desc: "An intelligent assistant that knows your household, your schedule, and your priorities. Ask questions, get briefings, delegate tasks — all in context.",
    },
  ];

  return (
    <section id="features" className="py-28 px-6" style={{ backgroundColor: CHARCOAL }}>
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <p
            className="text-xs font-semibold tracking-widest uppercase mb-4"
            style={{ color: TEAL, fontFamily: "Inter, sans-serif", letterSpacing: "0.15em" }}
          >
            Phase 1 — Coming Soon
          </p>
          <h2
            className="text-4xl md:text-5xl font-bold leading-tight mb-5"
            style={{ fontFamily: "Outfit, sans-serif", color: WARM_WHITE }}
          >
            Everything your life needs,<br />
            <span style={{ color: TEAL }}>in one place.</span>
          </h2>
          <p
            className="text-base max-w-xl mx-auto"
            style={{ color: `${WARM_WHITE}60`, fontFamily: "Inter, sans-serif" }}
          >
            The first release of Geeves.Life covers the core infrastructure of a well-managed life. More verticals and integrations follow in Phase 2.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map(f => (
            <div
              key={f.title}
              className="p-6 rounded-2xl border transition-all group"
              style={{
                borderColor: `${MID_CHARCOAL}60`,
                backgroundColor: "#1E2024",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.borderColor = `${f.color}40`;
                (e.currentTarget as HTMLElement).style.backgroundColor = `${f.color}08`;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.borderColor = `${MID_CHARCOAL}60`;
                (e.currentTarget as HTMLElement).style.backgroundColor = "#1E2024";
              }}
            >
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center mb-5"
                style={{ backgroundColor: `${f.color}18`, color: f.color }}
              >
                {f.icon}
              </div>
              <h3
                className="text-lg font-semibold mb-2"
                style={{ fontFamily: "Outfit, sans-serif", color: WARM_WHITE }}
              >
                {f.title}
              </h3>
              <p
                className="text-sm leading-relaxed"
                style={{ color: `${WARM_WHITE}55`, fontFamily: "Inter, sans-serif" }}
              >
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Beta Signup ──────────────────────────────────────────────────────────────
function BetaSignup() {
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    householdType: "",
    householdSize: "",
    primaryUseCase: "",
    referralSource: "",
    additionalNotes: "",
  });

  const signup = trpc.landing.betaSignup.useMutation({
    onSuccess: () => setSubmitted(true),
    onError: (err) => {
      toast.error(err.message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) return;
    signup.mutate({
      name: form.name,
      email: form.email,
      householdType: form.householdType || undefined,
      householdSize: form.householdSize || undefined,
      primaryUseCase: form.primaryUseCase || undefined,
      referralSource: form.referralSource || undefined,
      additionalNotes: form.additionalNotes || undefined,
    });
  }

  return (
    <section id="beta" className="py-28 px-6" style={{ backgroundColor: "#1E2024" }}>
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-12">
          <p
            className="text-xs font-semibold tracking-widest uppercase mb-4"
            style={{ color: TEAL, fontFamily: "Inter, sans-serif", letterSpacing: "0.15em" }}
          >
            Early Access
          </p>
          <h2
            className="text-4xl md:text-5xl font-bold leading-tight mb-5"
            style={{ fontFamily: "Outfit, sans-serif", color: WARM_WHITE }}
          >
            Join the beta.
          </h2>
          <p
            className="text-base leading-relaxed"
            style={{ color: `${WARM_WHITE}60`, fontFamily: "Inter, sans-serif" }}
          >
            We're selecting a small group of households for our private beta. Tell us a little about yourself — we review every application personally and reach out to those who are a strong fit.
          </p>
        </div>

        {submitted ? (
          <div
            className="text-center p-12 rounded-2xl border"
            style={{ borderColor: `${TEAL}40`, backgroundColor: `${TEAL}08` }}
          >
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"
              style={{ backgroundColor: `${TEAL}20` }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={TEAL} strokeWidth="2">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <h3
              className="text-2xl font-bold mb-3"
              style={{ fontFamily: "Outfit, sans-serif", color: WARM_WHITE }}
            >
              Application received.
            </h3>
            <p style={{ color: `${WARM_WHITE}60`, fontFamily: "Inter, sans-serif" }}>
              Thank you for your interest in Geeves.Life. We'll review your application and be in touch if you're a strong fit for the beta.
            </p>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="p-8 rounded-2xl border flex flex-col gap-6"
            style={{ borderColor: `${MID_CHARCOAL}60`, backgroundColor: `${CHARCOAL}80` }}
          >
            {/* Name + Email */}
            <div className="grid sm:grid-cols-2 gap-5">
              <div className="flex flex-col gap-2">
                <Label style={{ color: `${WARM_WHITE}80`, fontFamily: "Inter, sans-serif", fontSize: "0.8rem" }}>
                  Full Name <span style={{ color: TEAL }}>*</span>
                </Label>
                <Input
                  required
                  placeholder="Your name"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  style={{
                    backgroundColor: `${MID_CHARCOAL}40`,
                    borderColor: `${MID_CHARCOAL}80`,
                    color: WARM_WHITE,
                    fontFamily: "Inter, sans-serif",
                  }}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label style={{ color: `${WARM_WHITE}80`, fontFamily: "Inter, sans-serif", fontSize: "0.8rem" }}>
                  Email Address <span style={{ color: TEAL }}>*</span>
                </Label>
                <Input
                  required
                  type="email"
                  placeholder="you@example.com"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  style={{
                    backgroundColor: `${MID_CHARCOAL}40`,
                    borderColor: `${MID_CHARCOAL}80`,
                    color: WARM_WHITE,
                    fontFamily: "Inter, sans-serif",
                  }}
                />
              </div>
            </div>

            {/* Household type */}
            <div className="flex flex-col gap-2">
              <Label style={{ color: `${WARM_WHITE}80`, fontFamily: "Inter, sans-serif", fontSize: "0.8rem" }}>
                Which best describes your household?
              </Label>
              <Select onValueChange={v => setForm(f => ({ ...f, householdType: v }))}>
                <SelectTrigger
                  style={{
                    backgroundColor: `${MID_CHARCOAL}40`,
                    borderColor: `${MID_CHARCOAL}80`,
                    color: form.householdType ? WARM_WHITE : `${WARM_WHITE}40`,
                    fontFamily: "Inter, sans-serif",
                  }}
                >
                  <SelectValue placeholder="Select one…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="individual">Individual — managing my own life</SelectItem>
                  <SelectItem value="couple">Couple — two adults, shared life</SelectItem>
                  <SelectItem value="family_with_children">Family with children</SelectItem>
                  <SelectItem value="multigenerational">Multigenerational household</SelectItem>
                  <SelectItem value="property_owner">Property owner / host</SelectItem>
                  <SelectItem value="entrepreneur">Entrepreneur / business owner</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Household size */}
            <div className="flex flex-col gap-2">
              <Label style={{ color: `${WARM_WHITE}80`, fontFamily: "Inter, sans-serif", fontSize: "0.8rem" }}>
                How many people are you managing logistics for?
              </Label>
              <Select onValueChange={v => setForm(f => ({ ...f, householdSize: v }))}>
                <SelectTrigger
                  style={{
                    backgroundColor: `${MID_CHARCOAL}40`,
                    borderColor: `${MID_CHARCOAL}80`,
                    color: form.householdSize ? WARM_WHITE : `${WARM_WHITE}40`,
                    fontFamily: "Inter, sans-serif",
                  }}
                >
                  <SelectValue placeholder="Select one…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Just me</SelectItem>
                  <SelectItem value="2">2 people</SelectItem>
                  <SelectItem value="3-4">3–4 people</SelectItem>
                  <SelectItem value="5+">5 or more</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Primary use case */}
            <div className="flex flex-col gap-2">
              <Label style={{ color: `${WARM_WHITE}80`, fontFamily: "Inter, sans-serif", fontSize: "0.8rem" }}>
                What are you most excited to use Geeves.Life for?
              </Label>
              <Select onValueChange={v => setForm(f => ({ ...f, primaryUseCase: v }))}>
                <SelectTrigger
                  style={{
                    backgroundColor: `${MID_CHARCOAL}40`,
                    borderColor: `${MID_CHARCOAL}80`,
                    color: form.primaryUseCase ? WARM_WHITE : `${WARM_WHITE}40`,
                    fontFamily: "Inter, sans-serif",
                  }}
                >
                  <SelectValue placeholder="Select one…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="calendar">Unified calendar management</SelectItem>
                  <SelectItem value="property">Property / short-term rental management</SelectItem>
                  <SelectItem value="household">Household & family coordination</SelectItem>
                  <SelectItem value="finances">Financial tracking & budgeting</SelectItem>
                  <SelectItem value="tasks">Task & project management</SelectItem>
                  <SelectItem value="ai_assistant">AI assistant (Geeves)</SelectItem>
                  <SelectItem value="all_of_the_above">All of the above</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Referral source */}
            <div className="flex flex-col gap-2">
              <Label style={{ color: `${WARM_WHITE}80`, fontFamily: "Inter, sans-serif", fontSize: "0.8rem" }}>
                How did you hear about Geeves.Life?
              </Label>
              <Input
                placeholder="e.g. Word of mouth, social media, search…"
                value={form.referralSource}
                onChange={e => setForm(f => ({ ...f, referralSource: e.target.value }))}
                style={{
                  backgroundColor: `${MID_CHARCOAL}40`,
                  borderColor: `${MID_CHARCOAL}80`,
                  color: WARM_WHITE,
                  fontFamily: "Inter, sans-serif",
                }}
              />
            </div>

            {/* Additional notes */}
            <div className="flex flex-col gap-2">
              <Label style={{ color: `${WARM_WHITE}80`, fontFamily: "Inter, sans-serif", fontSize: "0.8rem" }}>
                Anything else you'd like us to know? (optional)
              </Label>
              <Textarea
                placeholder="Tell us about your life management challenges, specific needs, or anything that would help us understand your fit…"
                value={form.additionalNotes}
                onChange={e => setForm(f => ({ ...f, additionalNotes: e.target.value }))}
                rows={4}
                style={{
                  backgroundColor: `${MID_CHARCOAL}40`,
                  borderColor: `${MID_CHARCOAL}80`,
                  color: WARM_WHITE,
                  fontFamily: "Inter, sans-serif",
                  resize: "none",
                }}
              />
            </div>

            <button
              type="submit"
              disabled={signup.isPending}
              className="w-full py-3.5 text-base font-semibold rounded-xl transition-all"
              style={{
                backgroundColor: signup.isPending ? `${TEAL}60` : TEAL,
                color: CHARCOAL,
                fontFamily: "Inter, sans-serif",
                cursor: signup.isPending ? "not-allowed" : "pointer",
              }}
            >
              {signup.isPending ? "Submitting…" : "Submit Application"}
            </button>

            <p
              className="text-xs text-center"
              style={{ color: `${WARM_WHITE}35`, fontFamily: "Inter, sans-serif" }}
            >
              We review every application personally. Your information is never sold or shared.
            </p>
          </form>
        )}
      </div>
    </section>
  );
}

// ─── Team ─────────────────────────────────────────────────────────────────────
function Team() {
  return (
    <section id="team" className="py-28 px-6" style={{ backgroundColor: CHARCOAL }}>
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <p
            className="text-xs font-semibold tracking-widest uppercase mb-4"
            style={{ color: TEAL, fontFamily: "Inter, sans-serif", letterSpacing: "0.15em" }}
          >
            The Team
          </p>
          <h2
            className="text-4xl md:text-5xl font-bold leading-tight"
            style={{ fontFamily: "Outfit, sans-serif", color: WARM_WHITE }}
          >
            Built by someone who <br />
            <span style={{ color: TEAL }}>needed it.</span>
          </h2>
        </div>

        <div className="flex justify-center">
          <div
            className="max-w-md w-full p-8 rounded-2xl border text-center"
            style={{ borderColor: `${MID_CHARCOAL}60`, backgroundColor: "#1E2024" }}
          >
            {/* Avatar */}
            <div
              className="w-24 h-24 rounded-full mx-auto mb-6 flex items-center justify-center text-3xl font-bold"
              style={{
                background: `linear-gradient(135deg, ${TEAL}40, #8B5CF640)`,
                border: `2px solid ${TEAL}40`,
                color: TEAL,
                fontFamily: "Outfit, sans-serif",
              }}
            >
              TP
            </div>

            <h3
              className="text-xl font-bold mb-1"
              style={{ fontFamily: "Outfit, sans-serif", color: WARM_WHITE }}
            >
              Tarik Perkins
            </h3>
            <p
              className="text-sm mb-5"
              style={{ color: TEAL, fontFamily: "Inter, sans-serif", fontWeight: 500 }}
            >
              Founder & Product Designer
            </p>
            <p
              className="text-sm leading-relaxed"
              style={{ color: `${WARM_WHITE}60`, fontFamily: "Inter, sans-serif" }}
            >
              Entrepreneur, designer, and father managing multiple businesses, properties, and a household across two countries. Geeves.Life was built because nothing else came close to handling the full complexity of a modern, multi-faceted life.
            </p>

            <div className="flex justify-center gap-3 mt-6">
              <span
                className="px-3 py-1 rounded-full text-xs font-medium"
                style={{ backgroundColor: `${TEAL}15`, color: TEAL, fontFamily: "Inter, sans-serif" }}
              >
                TJP Global Group
              </span>
              <span
                className="px-3 py-1 rounded-full text-xs font-medium"
                style={{ backgroundColor: `#8B5CF620`, color: "#8B5CF6", fontFamily: "Inter, sans-serif" }}
              >
                Product Design
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Contact ──────────────────────────────────────────────────────────────────
function Contact() {
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });

  const sendMessage = trpc.landing.contactMessage.useMutation({
    onSuccess: () => setSubmitted(true),
    onError: (err) => {
      toast.error(err.message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.email || !form.subject || !form.message) return;
    sendMessage.mutate(form);
  }

  return (
    <section id="contact" className="py-28 px-6" style={{ backgroundColor: "#1E2024" }}>
      <div className="max-w-5xl mx-auto">
        <div className="grid md:grid-cols-2 gap-16">
          {/* Left */}
          <div>
            <p
              className="text-xs font-semibold tracking-widest uppercase mb-4"
              style={{ color: TEAL, fontFamily: "Inter, sans-serif", letterSpacing: "0.15em" }}
            >
              Get in Touch
            </p>
            <h2
              className="text-4xl md:text-5xl font-bold leading-tight mb-6"
              style={{ fontFamily: "Outfit, sans-serif", color: WARM_WHITE }}
            >
              We'd love to <br />
              <span style={{ color: TEAL }}>hear from you.</span>
            </h2>
            <p
              className="text-base leading-relaxed mb-8"
              style={{ color: `${WARM_WHITE}60`, fontFamily: "Inter, sans-serif" }}
            >
              Whether you have a question about the beta, want to explore a partnership, or just want to say hello — we read every message.
            </p>

            <div className="flex flex-col gap-5">
              <div className="flex items-center gap-4">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${TEAL}15` }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={TEAL} strokeWidth="1.5">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
                  </svg>
                </div>
                <div>
                  <p className="text-xs mb-0.5" style={{ color: `${WARM_WHITE}40`, fontFamily: "Inter, sans-serif" }}>Email</p>
                  <a
                    href="mailto:info@geeves.life"
                    className="text-sm font-medium transition-colors"
                    style={{ color: WARM_WHITE, fontFamily: "Inter, sans-serif" }}
                    onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = TEAL)}
                    onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = WARM_WHITE)}
                  >
                    info@geeves.life
                  </a>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${TEAL}15` }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={TEAL} strokeWidth="1.5">
                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                  </svg>
                </div>
                <div>
                  <p className="text-xs mb-0.5" style={{ color: `${WARM_WHITE}40`, fontFamily: "Inter, sans-serif" }}>Response time</p>
                  <p className="text-sm font-medium" style={{ color: WARM_WHITE, fontFamily: "Inter, sans-serif" }}>Within 2 business days</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right — form */}
          <div>
            {submitted ? (
              <div
                className="h-full flex flex-col items-center justify-center text-center p-10 rounded-2xl border"
                style={{ borderColor: `${TEAL}40`, backgroundColor: `${TEAL}08` }}
              >
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center mb-5"
                  style={{ backgroundColor: `${TEAL}20` }}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={TEAL} strokeWidth="2">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>
                <h3 className="text-xl font-bold mb-2" style={{ fontFamily: "Outfit, sans-serif", color: WARM_WHITE }}>Message sent.</h3>
                <p className="text-sm" style={{ color: `${WARM_WHITE}60`, fontFamily: "Inter, sans-serif" }}>We'll be in touch within 2 business days.</p>
              </div>
            ) : (
              <form
                onSubmit={handleSubmit}
                className="flex flex-col gap-5 p-8 rounded-2xl border"
                style={{ borderColor: `${MID_CHARCOAL}60`, backgroundColor: `${CHARCOAL}80` }}
              >
                <div className="grid sm:grid-cols-2 gap-5">
                  <div className="flex flex-col gap-2">
                    <Label style={{ color: `${WARM_WHITE}80`, fontFamily: "Inter, sans-serif", fontSize: "0.8rem" }}>Name <span style={{ color: TEAL }}>*</span></Label>
                    <Input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Your name" style={{ backgroundColor: `${MID_CHARCOAL}40`, borderColor: `${MID_CHARCOAL}80`, color: WARM_WHITE, fontFamily: "Inter, sans-serif" }} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label style={{ color: `${WARM_WHITE}80`, fontFamily: "Inter, sans-serif", fontSize: "0.8rem" }}>Email <span style={{ color: TEAL }}>*</span></Label>
                    <Input required type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="you@example.com" style={{ backgroundColor: `${MID_CHARCOAL}40`, borderColor: `${MID_CHARCOAL}80`, color: WARM_WHITE, fontFamily: "Inter, sans-serif" }} />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <Label style={{ color: `${WARM_WHITE}80`, fontFamily: "Inter, sans-serif", fontSize: "0.8rem" }}>Subject <span style={{ color: TEAL }}>*</span></Label>
                  <Input required value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="What's this about?" style={{ backgroundColor: `${MID_CHARCOAL}40`, borderColor: `${MID_CHARCOAL}80`, color: WARM_WHITE, fontFamily: "Inter, sans-serif" }} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label style={{ color: `${WARM_WHITE}80`, fontFamily: "Inter, sans-serif", fontSize: "0.8rem" }}>Message <span style={{ color: TEAL }}>*</span></Label>
                  <Textarea required rows={5} value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} placeholder="Tell us what's on your mind…" style={{ backgroundColor: `${MID_CHARCOAL}40`, borderColor: `${MID_CHARCOAL}80`, color: WARM_WHITE, fontFamily: "Inter, sans-serif", resize: "none" }} />
                </div>
                <button
                  type="submit"
                  disabled={sendMessage.isPending}
                  className="w-full py-3 text-base font-semibold rounded-xl transition-all"
                  style={{ backgroundColor: sendMessage.isPending ? `${TEAL}60` : TEAL, color: CHARCOAL, fontFamily: "Inter, sans-serif", cursor: sendMessage.isPending ? "not-allowed" : "pointer" }}
                >
                  {sendMessage.isPending ? "Sending…" : "Send Message"}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer
      className="py-12 px-6 border-t"
      style={{ backgroundColor: CHARCOAL, borderColor: `${MID_CHARCOAL}60` }}
    >
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <GeevesLogo size={32} showWordmark theme="dark" />
        </div>

        <div className="flex flex-wrap items-center justify-center gap-6">
          {[
            { label: "About", href: "#about" },
            { label: "Features", href: "#features" },
            { label: "Beta", href: "#beta" },
            { label: "Contact", href: "#contact" },
            { label: "Privacy Policy", href: "/privacy" },
            { label: "Terms of Service", href: "/terms" },
            { label: "Sign In", href: "/login" },
          ].map(l => (
            <a
              key={l.label}
              href={l.href}
              className="text-xs transition-colors"
              style={{ color: `${WARM_WHITE}40`, fontFamily: "Inter, sans-serif" }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = WARM_WHITE)}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = `${WARM_WHITE}40`)}
            >
              {l.label}
            </a>
          ))}
        </div>

        <p
          className="text-xs"
          style={{ color: `${WARM_WHITE}25`, fontFamily: "Inter, sans-serif" }}
        >
          © {new Date().getFullYear()} TJP Global Group. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function Landing() {
  return (
    <div style={{ backgroundColor: CHARCOAL, minHeight: "100vh" }}>
      <Nav />
      <Hero />
      <About />
      <Features />
      <BetaSignup />
      <Team />
      <Contact />
      <Footer />
    </div>
  );
}
