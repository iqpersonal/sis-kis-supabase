"use client";

import { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Package,
  Cpu,
  LayoutDashboard,
  ShoppingCart,
  GraduationCap,
  ChevronDown,
  Repeat2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ROLES } from "@/lib/rbac";
import { cn } from "@/lib/utils";

export const ACTIVE_PORTAL_KEY = "sis_active_portal";

/* ── Role → Portal mapping ─────────────────────────────────────── */

interface PortalEntry {
  url: string;
  icon: React.ElementType;
  label: string;
}

const ROLE_PORTAL: Record<string, PortalEntry> = {
  teacher:           { url: "/teacher/dashboard",       icon: GraduationCap,  label: "Teacher Portal" },
  librarian:         { url: "/dashboard/library",       icon: BookOpen,       label: "Library" },
  store_clerk:       { url: "/dashboard/general-store", icon: Package,        label: "General Store" },
  it_admin:          { url: "/dashboard/it-store",      icon: Cpu,            label: "IT Store" },
  bookshop:          { url: "/dashboard/book-sales",    icon: ShoppingCart,   label: "Bookshop" },
  it_manager:        { url: "/dashboard/it-store",      icon: Cpu,            label: "IT Manager" },
  admissions:        { url: "/dashboard/admissions",    icon: GraduationCap,  label: "Admissions" },
};

export function portalForRole(role: string): PortalEntry {
  return ROLE_PORTAL[role] ?? {
    url: "/dashboard",
    icon: LayoutDashboard,
    label: (ROLES as Record<string, string>)[role] ?? role,
  };
}

/* ── Component ─────────────────────────────────────────────────── */

export function RoleSwitcher({
  primaryRole,
  secondaryRoles,
}: {
  primaryRole: string;
  secondaryRoles: string[];
}) {
  const [open, setOpen] = useState(false);
  const [activePortal, setActivePortal] = useState<string>(primaryRole);
  const [cachedPrimaryRole, setCachedPrimaryRole] = useState<string | null>(null);
  const [cachedSecondaryRoles, setCachedSecondaryRoles] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    try {
      const raw = localStorage.getItem("teacher_session");
      if (!raw) {
        setCachedPrimaryRole(null);
        setCachedSecondaryRoles([]);
        return;
      }
      const parsed = JSON.parse(raw) as { role?: string; secondary_roles?: string[] };
      setCachedPrimaryRole(typeof parsed.role === "string" ? parsed.role : null);
      setCachedSecondaryRoles(Array.isArray(parsed.secondary_roles) ? parsed.secondary_roles : []);
    } catch {
      setCachedPrimaryRole(null);
      setCachedSecondaryRoles([]);
    }
  }, []);

  const effectivePrimaryRole = primaryRole !== "viewer" ? primaryRole : cachedPrimaryRole ?? primaryRole;
  // Only use the teacher_session cache when the user is a "viewer" (i.e. logged in via teacher portal).
  // For real admin roles (super_admin, etc.) with no secondary roles, show nothing — don't bleed in cached data.
  const effectiveSecondaryRoles = secondaryRoles.length ? secondaryRoles : (primaryRole === "viewer" ? cachedSecondaryRoles : []);

  // Read stored active portal on mount
  useEffect(() => {
    const stored = localStorage.getItem(ACTIVE_PORTAL_KEY);
    if (stored) setActivePortal(stored);
    else setActivePortal(effectivePrimaryRole);
  }, [effectivePrimaryRole]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  if (!effectiveSecondaryRoles.length) return null;

  const allRoles = Array.from(new Set([effectivePrimaryRole, ...effectiveSecondaryRoles]));

  function handleSwitch(role: string) {
    setOpen(false);
    if (role === effectivePrimaryRole) {
      localStorage.removeItem(ACTIVE_PORTAL_KEY);
    } else {
      localStorage.setItem(ACTIVE_PORTAL_KEY, role);
    }
    setActivePortal(role);
    router.push(portalForRole(role).url);
  }

  const currentPortal = portalForRole(activePortal);

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 text-xs font-medium"
        onClick={() => setOpen((v) => !v)}
        title="Switch portal"
      >
        <Repeat2 className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{currentPortal.label}</span>
        <ChevronDown className={cn("h-3 w-3 transition-transform duration-200", open && "rotate-180")} />
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-2 w-52 rounded-xl border bg-popover shadow-xl ring-1 ring-black/5">
            <p className="px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Your Portals
            </p>
            <div className="p-1.5 space-y-0.5">
              {allRoles.map((role) => {
                const portal = portalForRole(role);
                const Icon = portal.icon;
                const isCurrent = role === activePortal;
                return (
                  <button
                    key={role}
                    onClick={() => handleSwitch(role)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors text-left",
                      isCurrent
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-popover-foreground hover:bg-accent"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <div>
                      <div className="leading-tight">{portal.label}</div>
                      {isCurrent && (
                        <div className="text-[10px] text-primary/60 leading-tight">Active</div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
