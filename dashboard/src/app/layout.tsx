import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from "@/context/auth-context";
import { AcademicYearProvider } from "@/context/academic-year-context";
import { SchoolFilterProvider } from "@/context/school-filter-context";
import { LanguageProvider } from "@/context/language-context";
import { ThemeProvider } from "@/context/theme-context";
import { RegisterSW } from "@/components/register-sw";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Khaled International Schools – Student Information System",
  description: "KiS SiS — Grades, attendance, fees, and parent communication for Khaled International Schools, Riyadh.",
  other: {
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
    "mobile-web-app-capable": "yes",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth">
      <head>
        <meta name="theme-color" content="#2563eb" />
        <link rel="apple-touch-icon" href="/icon-192.svg" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider>
          <LanguageProvider>
            <AuthProvider>
              <AcademicYearProvider>
                <SchoolFilterProvider>{children}</SchoolFilterProvider>
              </AcademicYearProvider>
            </AuthProvider>
          </LanguageProvider>
        </ThemeProvider>
        <RegisterSW />
      </body>
    </html>
  );
}
