"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { Home, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

interface LoginLayoutProps {
  children: ReactNode;
  /** Accent color class for the icon background (e.g. "bg-indigo-600") */
  accentClass?: string;
  /** Label shown in the decorative left panel */
  portalLabel?: string;
  /** Sub-text in the decorative panel */
  portalDescription?: string;
  /** Top-right slot for extras like language switcher */
  topRight?: ReactNode;
}

export function LoginLayout({
  children,
  accentClass = "bg-primary",
  portalLabel = "Welcome Back",
  portalDescription = "Sign in to access your dashboard",
  topRight,
}: LoginLayoutProps) {
  return (
    <div className="flex min-h-screen">
      {/* ── Left decorative panel (hidden on mobile) ───────── */}
      <div className="relative hidden w-[45%] overflow-hidden bg-[#0a0a1a] lg:flex lg:flex-col lg:justify-between p-10">
        {/* Background effects */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-[#6366f1]/15 blur-[120px]" />
          <div className="absolute bottom-20 right-0 w-[300px] h-[300px] rounded-full bg-[#d4af37]/10 blur-[100px]" />
        </div>

        {/* Logo */}
        <div className="relative">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/kis-logo.png"
              alt="KiS"
              width={44}
              height={44}
              className="rounded-full"
              unoptimized
            />
            <div>
              <span className="text-sm font-bold text-white tracking-tight leading-none">
                Khaled International Schools
              </span>
              <span className="block text-[10px] text-[#d4af37] font-medium tracking-wider">
                مدارس خالد العالمية
              </span>
            </div>
          </Link>
        </div>

        {/* Center content */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="relative space-y-6"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-[#d4af37]/30 bg-[#d4af37]/10 px-4 py-1.5 text-xs font-semibold text-[#d4af37] tracking-wide uppercase">
            <Sparkles className="h-3.5 w-3.5" />
            Student Information System
          </div>
          <h2 className="text-3xl font-extrabold text-white leading-tight">
            {portalLabel}
          </h2>
          <p className="text-white/50 max-w-sm leading-relaxed">
            {portalDescription}
          </p>

          {/* Decorative stats */}
          <div className="grid grid-cols-3 gap-4 pt-4">
            {[
              { val: "30+", label: "Years" },
              { val: "50+", label: "Nationalities" },
              { val: "KG–G12", label: "Grades" },
            ].map((s) => (
              <div key={s.label}>
                <p className="text-xl font-extrabold bg-gradient-to-r from-[#6366f1] to-[#d4af37] bg-clip-text text-transparent">
                  {s.val}
                </p>
                <p className="text-[10px] text-white/30 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Footer */}
        <div className="relative text-xs text-white/20">
          &copy; 2026 Khaled International Schools. All rights reserved.
        </div>
      </div>

      {/* ── Right form panel ──────────────────────────────── */}
      <div className="relative flex flex-1 flex-col items-center justify-center bg-background px-6 py-12">
        {/* Top navigation */}
        <div className="absolute top-4 left-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Home className="h-4 w-4" />
            Home
          </Link>
        </div>
        {topRight && (
          <div className="absolute top-4 right-4">{topRight}</div>
        )}

        {/* Form content with animation */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="w-full max-w-md"
        >
          {children}
        </motion.div>
      </div>
    </div>
  );
}
