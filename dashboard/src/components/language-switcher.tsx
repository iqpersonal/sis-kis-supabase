"use client";

import { useLanguage } from "@/context/language-context";
import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n/translations";

interface LanguageSwitcherProps {
  /** "icon" = just a globe toggle button, "full" = labeled dropdown */
  variant?: "icon" | "full";
  className?: string;
}

export function LanguageSwitcher({
  variant = "icon",
  className = "",
}: LanguageSwitcherProps) {
  const { locale, setLocale, t } = useLanguage();

  const toggle = () => {
    const next: Locale = locale === "en" ? "ar" : "en";
    setLocale(next);
  };

  if (variant === "icon") {
    return (
      <Button
        variant="ghost"
        size="icon"
        className={`relative h-9 w-9 ${className}`}
        onClick={toggle}
        title={t("switchLanguage")}
      >
        <Globe className="h-5 w-5" />
        <span className="absolute -bottom-0.5 -right-0.5 rounded bg-primary px-1 text-[8px] font-bold text-primary-foreground leading-tight">
          {locale === "en" ? "AR" : "EN"}
        </span>
      </Button>
    );
  }

  return (
    <button
      onClick={toggle}
      className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${className}`}
    >
      <Globe className="h-4 w-4" />
      {locale === "en" ? "العربية" : "English"}
    </button>
  );
}
