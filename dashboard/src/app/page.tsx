"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/context/auth-context";
import {
  GraduationCap,
  BarChart3,
  Bell,
  Shield,
  Users,
  FileText,
  Globe,
  ChevronRight,
  Smartphone,
  Monitor,
  ArrowRight,
  Star,
  Sparkles,
  Menu,
  X,
  MapPin,
  Phone,
  Mail,
  BookOpen,
  Award,
  Calendar,
  UserCircle,
} from "lucide-react";

/* ──────────────────────── constants ──────────────────────── */

const FEATURES = [
  {
    icon: BarChart3,
    title: "Real-Time Analytics",
    desc: "Live dashboards for grades, attendance, and conduct — always up to date.",
  },
  {
    icon: Users,
    title: "Parent Portal",
    desc: "Mobile app gives parents instant access to their child's progress and fees.",
  },
  {
    icon: Bell,
    title: "Push Notifications",
    desc: "Alert parents automatically for low grades, absences, fee reminders, and custom messages.",
  },
  {
    icon: Shield,
    title: "Role-Based Access",
    desc: "Fine-grained permissions for admins, teachers, and supervisors.",
  },
  {
    icon: FileText,
    title: "Transcript & Reports",
    desc: "Generate official transcripts, report cards, and bulk PDF exports in seconds.",
  },
  {
    icon: Globe,
    title: "Bilingual (EN / AR)",
    desc: "Full Arabic and English support across dashboard and mobile app.",
  },
  {
    icon: Sparkles,
    title: "Smart Summaries",
    desc: "AI-powered insights surface at-risk students and performance trends.",
  },
  {
    icon: BookOpen,
    title: "AP & IB Support",
    desc: "Built-in support for Advanced Placement and IB Diploma Programme tracking.",
  },
];

const PROGRAMS = [
  { icon: GraduationCap, title: "Preschool", desc: "Early childhood education with play-based learning" },
  { icon: BookOpen, title: "Elementary", desc: "Strong academic foundation from Grade 1 through Grade 5" },
  { icon: Award, title: "Middle School", desc: "Preparing students for advanced academic challenges" },
  { icon: Star, title: "High School", desc: "College-prep curriculum with AP & IB pathways" },
];

/* ──────────────────────── component ──────────────────────── */

export default function LandingPage() {
  const { user, loading } = useAuth();
  const [mobileNav, setMobileNav] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  /* parallax tilt on hero mockup */
  const mockupRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = mockupRef.current;
    if (!el) return;
    const handle = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      el.style.transform = `perspective(800px) rotateY(${x * 8}deg) rotateX(${-y * 8}deg)`;
    };
    const reset = () => {
      el.style.transform = "perspective(800px) rotateY(0) rotateX(0)";
    };
    el.addEventListener("mousemove", handle);
    el.addEventListener("mouseleave", reset);
    return () => {
      el.removeEventListener("mousemove", handle);
      el.removeEventListener("mouseleave", reset);
    };
  }, []);

  const isReady = mounted && !loading;
  const ctaHref = isReady && user ? "/dashboard" : "/login";
  const ctaLabel = isReady && user ? "Go to Dashboard" : "Sign In";

  return (
    <div className="min-h-screen bg-[#0a0a1a] text-white overflow-x-hidden">
      {/* ── Navbar ── */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-white/10 bg-[#0a0a1a]/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/kis-logo.png" alt="KiS" width={44} height={44} className="rounded-full" unoptimized />
            <div className="hidden sm:block">
              <span className="text-sm font-bold tracking-tight leading-none">
                Khaled International Schools
              </span>
              <span className="block text-[10px] text-[#d4af37] font-medium tracking-wider">
                مدارس خالد العالمية
              </span>
            </div>
          </Link>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-white/70">
            <a href="#about" className="hover:text-white transition-colors">About</a>
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#programs" className="hover:text-white transition-colors">Programs</a>
            <a href="#platforms" className="hover:text-white transition-colors">Platforms</a>
            <a href="#contact" className="hover:text-white transition-colors">Contact</a>
          </div>

          <div className="hidden md:flex items-center gap-3">
            {isReady && user ? (
              <Link
                href="/dashboard"
                className="rounded-lg bg-gradient-to-r from-[#6366f1] to-[#4f46e5] px-5 py-2 text-sm font-semibold shadow-lg shadow-indigo-500/25 transition hover:shadow-indigo-500/40"
              >
                Dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/parent/login"
                  className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white/80 transition hover:text-white hover:bg-white/10"
                >
                  <Users className="h-4 w-4" />
                  Parent Login
                </Link>
                <Link
                  href="/student/login"
                  className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#6366f1] to-[#4f46e5] px-5 py-2 text-sm font-semibold shadow-lg shadow-indigo-500/25 transition hover:shadow-indigo-500/40"
                >
                  <GraduationCap className="h-4 w-4" />
                  Student Login
                </Link>
              </>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden text-white/80"
            onClick={() => setMobileNav(!mobileNav)}
          >
            {mobileNav ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {/* Mobile dropdown */}
        {mobileNav && (
          <div className="md:hidden border-t border-white/10 bg-[#0a0a1a]/95 backdrop-blur-xl px-6 py-4 space-y-3">
            <a href="#about" onClick={() => setMobileNav(false)} className="block text-sm text-white/70 hover:text-white">About</a>
            <a href="#features" onClick={() => setMobileNav(false)} className="block text-sm text-white/70 hover:text-white">Features</a>
            <a href="#programs" onClick={() => setMobileNav(false)} className="block text-sm text-white/70 hover:text-white">Programs</a>
            <a href="#platforms" onClick={() => setMobileNav(false)} className="block text-sm text-white/70 hover:text-white">Platforms</a>
            <a href="#contact" onClick={() => setMobileNav(false)} className="block text-sm text-white/70 hover:text-white">Contact</a>
            <div className="border-t border-white/10 pt-3 space-y-2">
              <Link href="/parent/login" onClick={() => setMobileNav(false)} className="flex items-center gap-2 text-sm text-white/70 hover:text-white">
                <Users className="h-4 w-4" />Parent Login
              </Link>
              <Link href="/student/login" onClick={() => setMobileNav(false)} className="flex items-center gap-2 text-sm text-white/70 hover:text-white">
                <GraduationCap className="h-4 w-4" />Student Login
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* ── Hero ── */}
      <section className="relative pt-32 pb-20 md:pt-44 md:pb-32">
        {/* Background glow */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[800px] h-[600px] rounded-full bg-[#6366f1]/15 blur-[120px]" />
          <div className="absolute top-40 right-0 w-[400px] h-[400px] rounded-full bg-[#d4af37]/10 blur-[100px]" />
        </div>

        <div className="relative mx-auto max-w-7xl px-6">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            {/* Left — text */}
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#d4af37]/30 bg-[#d4af37]/10 px-4 py-1.5 text-xs font-semibold text-[#d4af37] tracking-wide uppercase">
                <Star className="h-3.5 w-3.5" />
                Since 1995 &bull; Riyadh, Saudi Arabia
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.1] tracking-tight">
                Welcome to{" "}
                <span className="bg-gradient-to-r from-[#6366f1] via-[#818cf8] to-[#d4af37] bg-clip-text text-transparent">
                  Khaled International Schools
                </span>
              </h1>
              <p className="text-lg text-white/60 max-w-lg leading-relaxed">
                Serving students from KG through Grade 12 in a multicultural environment.
                Our Student Information System brings grades, attendance, and parent
                communication into one powerful platform.
              </p>
              <div className="flex flex-wrap gap-4">
                <Link
                  href={ctaHref}
                  className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#6366f1] to-[#4f46e5] px-7 py-3.5 text-sm font-bold shadow-xl shadow-indigo-500/25 transition hover:shadow-indigo-500/40 hover:scale-[1.02]"
                >
                  {ctaLabel}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <a
                  href="#features"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 backdrop-blur-sm px-7 py-3.5 text-sm font-semibold text-white/80 transition hover:bg-white/10 hover:text-white"
                >
                  Explore Features
                  <ChevronRight className="h-4 w-4" />
                </a>
              </div>

              {/* Key stats */}
              <div className="grid grid-cols-3 gap-6 pt-4">
                {[
                  { val: "30+", label: "Years of Excellence" },
                  { val: "50+", label: "Nationalities" },
                  { val: "KG–G12", label: "All Grade Levels" },
                ].map((s) => (
                  <div key={s.label}>
                    <p className="text-2xl font-extrabold bg-gradient-to-r from-[#6366f1] to-[#d4af37] bg-clip-text text-transparent">
                      {s.val}
                    </p>
                    <p className="text-xs text-white/40 mt-1">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Right — mockup */}
            <div ref={mockupRef} className="relative transition-transform duration-200 ease-out will-change-transform">
              {/* Glassmorphism dashboard card */}
              <div className="rounded-2xl border border-white/15 bg-white/5 backdrop-blur-xl p-6 shadow-2xl shadow-indigo-500/10">
                {/* Fake title bar */}
                <div className="flex items-center gap-2 mb-5">
                  <div className="h-3 w-3 rounded-full bg-red-400/70" />
                  <div className="h-3 w-3 rounded-full bg-yellow-400/70" />
                  <div className="h-3 w-3 rounded-full bg-green-400/70" />
                  <div className="ml-4 h-4 w-40 rounded bg-white/10" />
                </div>

                {/* Stats row — decorative graphics */}
                <div className="grid grid-cols-3 gap-3 mb-5">
                  {/* Mini donut chart */}
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col items-center">
                    <svg width="48" height="48" viewBox="0 0 48 48">
                      <circle cx="24" cy="24" r="18" fill="none" stroke="rgba(99,102,241,0.2)" strokeWidth="5" />
                      <circle cx="24" cy="24" r="18" fill="none" stroke="url(#gDonut)" strokeWidth="5" strokeDasharray="82 113" strokeLinecap="round" transform="rotate(-90 24 24)" />
                      <defs><linearGradient id="gDonut" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#6366f1" /><stop offset="100%" stopColor="#818cf8" /></linearGradient></defs>
                    </svg>
                    <p className="text-[10px] text-white/30 mt-1.5">Enrollment</p>
                  </div>
                  {/* Mini bar chart */}
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col items-center justify-end">
                    <div className="flex items-end gap-[3px] h-10">
                      {[55, 70, 45, 85, 65].map((h, i) => (
                        <div key={i} className="w-[6px] rounded-t bg-gradient-to-t from-[#d4af37] to-[#f59e0b] opacity-80" style={{ height: `${h}%` }} />
                      ))}
                    </div>
                    <p className="text-[10px] text-white/30 mt-1.5">Performance</p>
                  </div>
                  {/* Progress ring */}
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col items-center">
                    <svg width="48" height="48" viewBox="0 0 48 48">
                      <circle cx="24" cy="24" r="18" fill="none" stroke="rgba(16,185,129,0.2)" strokeWidth="5" />
                      <circle cx="24" cy="24" r="18" fill="none" stroke="url(#gRing)" strokeWidth="5" strokeDasharray="96 113" strokeLinecap="round" transform="rotate(-90 24 24)" />
                      <defs><linearGradient id="gRing" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#10b981" /><stop offset="100%" stopColor="#34d399" /></linearGradient></defs>
                    </svg>
                    <p className="text-[10px] text-white/30 mt-1.5">Attendance</p>
                  </div>
                </div>

                {/* Fake chart */}
                <div className="rounded-xl border border-white/10 bg-white/5 p-4 mb-4">
                  <div className="flex items-end gap-1.5 h-24">
                    {[40, 55, 45, 70, 60, 80, 75, 90, 85, 95, 88, 92].map((h, i) => (
                      <div
                        key={i}
                        className="flex-1 rounded-t bg-gradient-to-t from-[#6366f1] to-[#818cf8] opacity-80"
                        style={{ height: `${h}%` }}
                      />
                    ))}
                  </div>
                </div>

                {/* Fake table rows */}
                <div className="space-y-2">
                  {[80, 65, 50].map((w, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[#6366f1]/40 to-[#d4af37]/40" />
                      <div className="h-3 rounded bg-white/10" style={{ width: `${w}%` }} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Floating phone mockup */}
              <div className="absolute -bottom-8 -left-8 w-36 rounded-2xl border border-white/15 bg-white/5 backdrop-blur-xl p-3 shadow-xl shadow-indigo-500/10">
                <div className="flex items-center gap-2 mb-3">
                  <Smartphone className="h-4 w-4 text-[#d4af37]" />
                  <span className="text-[10px] font-bold text-white/60">Parent App</span>
                </div>
                <div className="space-y-1.5">
                  <div className="h-2 w-full rounded bg-[#6366f1]/30" />
                  <div className="h-2 w-3/4 rounded bg-[#d4af37]/30" />
                  <div className="h-2 w-1/2 rounded bg-white/10" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── About ── */}
      <section id="about" className="relative py-24 md:py-32 border-t border-white/5">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full bg-[#d4af37]/5 blur-[120px]" />
        </div>
        <div className="relative mx-auto max-w-7xl px-6">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div className="space-y-6">
              <p className="text-sm font-semibold tracking-widest uppercase text-[#d4af37]">About KiS</p>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
                A Legacy of Academic Excellence
              </h2>
              <p className="text-white/50 leading-relaxed">
                Khaled International Schools (KiS) was founded in 1995 in Riyadh, Saudi Arabia.
                As one of the leading academic institutions in the Kingdom, KiS serves students
                from Kindergarten through Grade 12 in a multicultural environment.
              </p>
              <p className="text-white/50 leading-relaxed">
                We measure our success through the happiness of each individual student. Our programs
                include Advanced Placement (AP) courses and the IB Diploma Programme, preparing
                students for top universities worldwide.
              </p>
              <div className="flex items-center gap-4 pt-2">
                <Calendar className="h-5 w-5 text-[#d4af37]" />
                <span className="text-sm text-white/60">Part of the <strong className="text-white/80">LWIS Network</strong></span>
              </div>
            </div>

            {/* About stats cards */}
            <div className="grid grid-cols-2 gap-4">
              {[
                { val: "1995", label: "Year Founded", icon: Calendar },
                { val: "KG–12", label: "Grade Levels", icon: GraduationCap },
                { val: "AP & IB", label: "Programs Offered", icon: Award },
                { val: "50+", label: "Nationalities", icon: Globe },
              ].map(({ val, label, icon: Icon }) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-6 text-center">
                  <Icon className="h-6 w-6 text-[#818cf8] mx-auto mb-3" />
                  <p className="text-2xl font-extrabold bg-gradient-to-r from-[#6366f1] to-[#d4af37] bg-clip-text text-transparent">
                    {val}
                  </p>
                  <p className="text-xs text-white/40 mt-1">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Features Grid ── */}
      <section id="features" className="relative py-24 md:py-32 border-t border-white/5">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute bottom-0 left-0 w-[500px] h-[500px] rounded-full bg-[#6366f1]/8 blur-[120px]" />
        </div>

        <div className="relative mx-auto max-w-7xl px-6">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold tracking-widest uppercase text-[#d4af37] mb-3">SiS Features</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Our Student Information System
            </h2>
            <p className="mt-4 text-white/50 max-w-2xl mx-auto">
              A powerful digital platform built for Khaled International Schools — bringing
              academic tracking, parent engagement, and school management together.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="group rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-6 transition-all hover:border-[#6366f1]/30 hover:bg-white/[0.06] hover:shadow-lg hover:shadow-indigo-500/5"
              >
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[#6366f1]/20 to-[#d4af37]/10 border border-white/10 transition-colors group-hover:from-[#6366f1]/30 group-hover:to-[#d4af37]/20">
                  <Icon className="h-5 w-5 text-[#818cf8]" />
                </div>
                <h3 className="text-sm font-bold mb-2">{title}</h3>
                <p className="text-xs leading-relaxed text-white/45">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Academic Programs ── */}
      <section id="programs" className="py-24 md:py-32 border-t border-white/5">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold tracking-widest uppercase text-[#d4af37] mb-3">Academics</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Academic Programs
            </h2>
            <p className="mt-4 text-white/50 max-w-2xl mx-auto">
              Comprehensive education from early childhood through high school, with internationally
              recognized AP and IB Diploma pathways.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {PROGRAMS.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="group rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-6 transition-all hover:border-[#d4af37]/30 hover:bg-white/[0.06] hover:shadow-lg hover:shadow-amber-500/5"
              >
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[#d4af37]/20 to-[#6366f1]/10 border border-white/10">
                  <Icon className="h-5 w-5 text-[#d4af37]" />
                </div>
                <h3 className="text-sm font-bold mb-2">{title}</h3>
                <p className="text-xs leading-relaxed text-white/45">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Platforms ── */}
      <section id="platforms" className="py-24 md:py-32 border-t border-white/5">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div className="space-y-6">
              <p className="text-sm font-semibold tracking-widest uppercase text-[#d4af37]">Multi-Platform</p>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
                Dashboard + Mobile App
              </h2>
              <p className="text-white/50 leading-relaxed">
                KiS administrators get a full-featured web dashboard with analytics, user management,
                and reporting. Parents get a sleek mobile app with grades, attendance, fees, and
                real-time push notifications.
              </p>
              <div className="space-y-4 pt-2">
                {[
                  { icon: Monitor, text: "Web dashboard for admins & teachers" },
                  { icon: Smartphone, text: "iOS & Android app for parents" },
                  { icon: Bell, text: "Real-time push notifications" },
                  { icon: Globe, text: "Full Arabic & English support" },
                ].map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#6366f1]/15 border border-[#6366f1]/20">
                      <Icon className="h-4 w-4 text-[#818cf8]" />
                    </div>
                    <span className="text-sm text-white/70">{text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Platform cards */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-6 space-y-4">
                <Monitor className="h-8 w-8 text-[#6366f1]" />
                <h3 className="font-bold">Admin Dashboard</h3>
                <p className="text-xs text-white/40 leading-relaxed">
                  Grades, analytics, report cards, user management, messaging — all in one place.
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-6 space-y-4">
                <Smartphone className="h-8 w-8 text-[#d4af37]" />
                <h3 className="font-bold">Parent App</h3>
                <p className="text-xs text-white/40 leading-relaxed">
                  Children&#39;s grades, attendance, fees, and school messages — at their fingertips.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Contact ── */}
      <section id="contact" className="relative py-24 md:py-32 border-t border-white/5">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute bottom-0 right-0 w-[600px] h-[600px] rounded-full bg-[#6366f1]/8 blur-[150px]" />
        </div>

        <div className="relative mx-auto max-w-7xl px-6">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold tracking-widest uppercase text-[#d4af37] mb-3">Get in Touch</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Contact Us
            </h2>
            <p className="mt-4 text-white/50 max-w-xl mx-auto">
              We&apos;d love to hear from you. Reach out to Khaled International Schools.
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-6 max-w-4xl mx-auto">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-6 text-center">
              <MapPin className="h-8 w-8 text-[#6366f1] mx-auto mb-4" />
              <h3 className="text-sm font-bold mb-2">Address</h3>
              <p className="text-xs text-white/45 leading-relaxed">
                Prince Fawaz Ben Abdel Aziz Street,<br />
                Nahda Road, Riyadh 11411,<br />
                Kingdom of Saudi Arabia
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-6 text-center">
              <Phone className="h-8 w-8 text-[#d4af37] mx-auto mb-4" />
              <h3 className="text-sm font-bold mb-2">Phone</h3>
              <p className="text-xs text-white/45 leading-relaxed space-y-1">
                <span className="block">+966 11 493 9197</span>
                <span className="block">+966 11 496 0252</span>
                <span className="block text-white/30">Registration: +966 9200 33901</span>
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-6 text-center">
              <Mail className="h-8 w-8 text-[#818cf8] mx-auto mb-4" />
              <h3 className="text-sm font-bold mb-2">Email & Web</h3>
              <p className="text-xs text-white/45 leading-relaxed space-y-1">
                <a href="mailto:info@kis-riyadh.com" className="block hover:text-white/70 transition-colors">
                  info@kis-riyadh.com
                </a>
                <a href="https://kis-riyadh.com" target="_blank" rel="noopener noreferrer" className="block hover:text-white/70 transition-colors">
                  kis-riyadh.com
                </a>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Accredited & Affiliated ── */}
      <section className="py-16 md:py-20 bg-white">
        <div className="mx-auto max-w-7xl px-6">
          <p className="text-center text-sm font-semibold tracking-widest uppercase text-gray-400 mb-10">
            Accredited &amp; Affiliated
          </p>
          <div className="flex flex-wrap items-center justify-center gap-12 md:gap-20">
            <div className="flex flex-col items-center gap-3">
              <div className="h-24 flex items-center px-4 py-2">
                <Image src="/logos/lwis-logo.png" alt="LWIS Network" width={240} height={96} className="h-20 w-auto object-contain" unoptimized />
              </div>
              <span className="text-xs text-gray-400">LWIS Network</span>
            </div>
            <div className="flex flex-col items-center gap-3">
              <div className="h-24 flex items-center px-4 py-2">
                <Image src="/logos/cognia-logo.png" alt="COGNIA Accredited" width={96} height={96} className="h-20 w-auto object-contain" unoptimized />
              </div>
              <span className="text-xs text-gray-400">COGNIA Accredited</span>
            </div>
            <div className="flex flex-col items-center gap-3">
              <div className="h-24 flex items-center px-4 py-2">
                <Image src="/logos/moe-logo.png" alt="Ministry of Education" width={180} height={96} className="h-20 w-auto object-contain" unoptimized />
              </div>
              <span className="text-xs text-gray-400">Ministry of Education</span>
            </div>
            <div className="flex flex-col items-center gap-3">
              <div className="h-24 flex items-center px-4 py-2">
                <Image src="/logos/ap-logo.png" alt="Advanced Placement" width={160} height={96} className="h-20 w-auto object-contain" unoptimized />
              </div>
              <span className="text-xs text-gray-400">Advanced Placement</span>
            </div>
            <div className="flex flex-col items-center gap-3">
              <div className="h-24 flex items-center px-4 py-2">
                <Image src="/logos/ib-logo.png" alt="IB Diploma Programme" width={160} height={96} className="h-20 w-auto object-contain" unoptimized />
              </div>
              <span className="text-xs text-gray-400">IB Diploma Programme</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/5 py-12">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <Image src="/kis-logo.png" alt="KiS" width={36} height={36} className="rounded-full" unoptimized />
              <div>
                <span className="text-sm font-bold leading-none">Khaled International Schools</span>
                <span className="block text-[10px] text-[#d4af37]">مدارس خالد العالمية</span>
              </div>
            </div>
            <p className="text-xs text-white/30">
              &copy; 2026 Khaled International Schools (KiS). All rights reserved.
            </p>
            <div className="flex flex-wrap items-center gap-6 text-xs text-white/40">
              <a href="#about" className="hover:text-white/70 transition-colors">About</a>
              <a href="#features" className="hover:text-white/70 transition-colors">Features</a>
              <a href="#contact" className="hover:text-white/70 transition-colors">Contact</a>
              <a href="https://kis-riyadh.com" target="_blank" rel="noopener noreferrer" className="hover:text-white/70 transition-colors">School Website</a>
              <span className="hidden md:inline text-white/15">|</span>
              <Link href="/teacher/login" className="inline-flex items-center gap-1 hover:text-white/70 transition-colors">
                <BookOpen className="h-3 w-3" />Teacher Login
              </Link>
              <Link href="/login" className="inline-flex items-center gap-1 hover:text-white/70 transition-colors">
                <Shield className="h-3 w-3" />Admin Sign In
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

