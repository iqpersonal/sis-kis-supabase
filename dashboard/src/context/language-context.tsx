"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import {
  type Locale,
  type TranslationKeys,
  translations,
  isRTL,
} from "@/lib/i18n/translations";

/* ------------------------------------------------------------------ */
/*  Context type                                                      */
/* ------------------------------------------------------------------ */

interface LanguageContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKeys) => string;
  dir: "ltr" | "rtl";
  isRTL: boolean;
}

const STORAGE_KEY = "sis_locale";

const LanguageContext = createContext<LanguageContextType>({
  locale: "en",
  setLocale: () => {},
  t: (key) => key,
  dir: "ltr",
  isRTL: false,
});

/* ------------------------------------------------------------------ */
/*  Provider                                                          */
/* ------------------------------------------------------------------ */

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  // Restore saved preference
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as Locale | null;
      if (saved && (saved === "en" || saved === "ar")) {
        setLocaleState(saved);
      }
    } catch {
      // ignore
    }
  }, []);

  // Update HTML dir and lang when locale changes
  useEffect(() => {
    document.documentElement.dir = isRTL(locale) ? "rtl" : "ltr";
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    try {
      localStorage.setItem(STORAGE_KEY, newLocale);
    } catch {
      // ignore
    }
  }, []);

  const t = useCallback(
    (key: TranslationKeys): string => {
      return translations[locale][key] || translations.en[key] || key;
    },
    [locale]
  );

  const dir = isRTL(locale) ? "rtl" : "ltr";

  return (
    <LanguageContext.Provider
      value={{ locale, setLocale, t, dir, isRTL: isRTL(locale) }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export const useLanguage = () => useContext(LanguageContext);
