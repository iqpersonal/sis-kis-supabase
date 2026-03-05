import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from "@/context/auth-context";
import { AcademicYearProvider } from "@/context/academic-year-context";
import { SchoolFilterProvider } from "@/context/school-filter-context";
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
  title: "Smart Report Dashboard",
  description: "AI-powered analytics dashboard for your report data",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthProvider>
          <AcademicYearProvider>
            <SchoolFilterProvider>{children}</SchoolFilterProvider>
          </AcademicYearProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
