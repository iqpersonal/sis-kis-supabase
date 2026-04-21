"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BarChart3 } from "lucide-react";
import { LoginLayout } from "@/components/login-layout";

interface InternalAuthResponse {
  ok: boolean;
  authMode?: "teacher_local" | "firebase" | "parent_local" | "student_local";
  target?: string;
  email?: string;
  teacher?: {
    uid: string;
    email: string;
    displayName: string;
    firstName: string;
    lastName: string;
    username: string;
    grade: string;
    schoolYear: string;
    role: string;
    secondary_roles?: string[];
  };
  family?: Record<string, unknown>;
  student?: Record<string, unknown>;
  error?: string;
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="animate-pulse text-muted-foreground">Loading...</div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const { signIn } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect");

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/internal-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });

      const data = (await res.json()) as InternalAuthResponse;
      if (!res.ok || !data.ok || !data.authMode || !data.target) {
        setError(data.error || "Authentication failed");
        return;
      }

      if (data.authMode === "teacher_local") {
        if (!data.teacher) {
          setError("Teacher profile missing");
          return;
        }

        localStorage.setItem("teacher_session", JSON.stringify(data.teacher));
        document.cookie = `__session=teacher; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax; Secure`;
        router.push(redirect || data.target);
        return;
      }

      if (data.authMode === "parent_local") {
        if (!data.family) {
          setError("Parent profile missing");
          return;
        }
        localStorage.setItem("parent_session", JSON.stringify(data.family));
        document.cookie = `__session=parent; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax; Secure`;
        router.push(redirect || data.target!);
        return;
      }

      if (data.authMode === "student_local") {
        if (!data.student) {
          setError("Student profile missing");
          return;
        }
        localStorage.setItem("student_session", JSON.stringify(data.student));
        document.cookie = `__session=student; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax; Secure`;
        router.push(redirect || data.target!);
        return;
      }

      const email = data.email || identifier.trim().toLowerCase();
      await signIn(email, password);

      const { getFirebaseAuth } = await import("@/lib/firebase");
      const idToken = await getFirebaseAuth().currentUser?.getIdToken();
      if (!idToken) {
        setError("Failed to start session");
        return;
      }

      document.cookie = `__session=${idToken}; path=/; max-age=${60 * 60}; SameSite=Lax; Secure`;

      if (data.teacher && data.target.startsWith("/teacher/dashboard")) {
        localStorage.setItem("teacher_session", JSON.stringify(data.teacher));
      }

      router.push(redirect || data.target);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <LoginLayout
      portalLabel="Unified Internal Portal"
      portalDescription="Use your school username or email to access your assigned portal automatically."
    >
      <Card className="border-0 shadow-xl">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
            <BarChart3 className="h-7 w-7" />
          </div>
          <CardTitle className="text-2xl font-bold">KIS Unified Login</CardTitle>
          <CardDescription>
            Sign in once and we will route you to the correct dashboard.
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
              <label htmlFor="identifier" className="text-sm font-medium">
                Username or Email
              </label>
              <Input
                id="identifier"
                type="text"
                placeholder="username or you@school.edu.sa"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                Password
              </label>
              <Input
                id="password"
                type="password"
                placeholder="********"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-11"
              />
            </div>

            <Button type="submit" className="w-full h-11 font-semibold" disabled={loading}>
              {loading ? "Please wait..." : "Sign In"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </LoginLayout>
  );
}
