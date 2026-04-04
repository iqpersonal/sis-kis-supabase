"use client";

import { useTheme } from "@/context/theme-context";
import { Sun, Moon, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/context/language-context";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const { t } = useLanguage();

  const cycle = () => {
    const next = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
    setTheme(next);
  };

  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  const label =
    theme === "dark"
      ? t("darkMode")
      : theme === "light"
        ? t("lightMode")
        : t("systemMode");

  return (
    <Button
      variant="ghost"
      size="icon"
      className={`relative h-9 w-9 ${className}`}
      onClick={cycle}
      title={label}
    >
      <Icon className="h-5 w-5" />
    </Button>
  );
}
