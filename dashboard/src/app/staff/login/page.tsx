"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useStaffAuth } from "@/context/staff-auth-context";
import { useLanguage } from "@/context/language-context";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Briefcase } from "lucide-react";
import { LoginLayout } from "@/components/login-layout";

export default function StaffLoginPage() {
  const { signIn } = useStaffAuth();
  const { t } = useLanguage();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const success = await signIn(email, password);
      if (success) {
        router.push("/staff/dashboard");
      } else {
        setError("Invalid email or password, or no staff profile found.");
      }
    } catch {
      setError("Authentication failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <LoginLayout
      portalLabel="Staff Portal"
      portalDescription="Access your profile, announcements, IT support, assets, and store requests — all in one place."
      topRight={<LanguageSwitcher variant="icon" />}
    >
      <Card className="border-0 shadow-xl">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/25">
            <Briefcase className="h-7 w-7" />
          </div>
          <CardTitle className="text-2xl font-bold">
            {t("staffPortal" as never) || "Staff Portal"}
          </CardTitle>
          <CardDescription>
            Sign in with your school email and password
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                Email
              </label>
              <Input
                id="email"
                type="email"
                placeholder="you@school.edu.sa"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                {t("password")}
              </label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-11"
              />
            </div>

            <Button
              type="submit"
              className="w-full h-11 font-semibold bg-emerald-600 hover:bg-emerald-700"
              disabled={loading}
            >
              {loading ? t("signingIn") : t("signIn")}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              Use your official school email and the password provided by IT
            </p>
          </form>
        </CardContent>
      </Card>
    </LoginLayout>
  );
}
