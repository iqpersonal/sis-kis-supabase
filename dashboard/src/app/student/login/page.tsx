"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useStudentAuth } from "@/context/student-auth-context";
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
import { GraduationCap } from "lucide-react";
import { LoginLayout } from "@/components/login-layout";

export default function StudentLoginPage() {
  const { signIn } = useStudentAuth();
  const { t } = useLanguage();
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const success = await signIn(username, password);
      if (success) {
        router.push("/student/dashboard");
      } else {
        setError("Invalid student number or password");
      }
    } catch {
      setError("Authentication failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <LoginLayout
      portalLabel="Student Portal"
      portalDescription="Access your grades, attendance records, and academic progress all in one place."
      topRight={<LanguageSwitcher variant="icon" />}
    >
      <Card className="border-0 shadow-xl">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/25">
            <GraduationCap className="h-7 w-7" />
          </div>
          <CardTitle className="text-2xl font-bold">{t("studentPortal") || "Student Portal"}</CardTitle>
          <CardDescription>
            {t("signInToViewProgress") || "Sign in to view your academic progress"}
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
              <label htmlFor="username" className="text-sm font-medium">
                {t("studentNumber") || "Student Number"}
              </label>
              <Input
                id="username"
                type="text"
                placeholder="e.g. 0021-0006101"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
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
              className="w-full h-11 font-semibold bg-blue-600 hover:bg-blue-700"
              disabled={loading}
            >
              {loading ? (t("signingIn") || "Signing in…") : (t("signIn") || "Sign In")}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              Use the credentials provided by Khaled International Schools
            </p>
          </form>
        </CardContent>
      </Card>
    </LoginLayout>
  );
}
