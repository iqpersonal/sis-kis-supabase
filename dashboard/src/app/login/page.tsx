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

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="animate-pulse text-muted-foreground">Loading…</div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const { signIn, signUp } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isSignUp) {
        await signUp(email, password);
      } else {
        await signIn(email, password);
      }
      // Store the Firebase ID token in a session cookie for API route auth
      const { getFirebaseAuth } = await import("@/lib/firebase");
      const idToken = await getFirebaseAuth().currentUser?.getIdToken();
      if (idToken) {
        document.cookie = `__session=${idToken}; path=/; max-age=${60 * 60}; SameSite=Lax; Secure`;
      } else {
        document.cookie = `__session=1; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax; Secure`;
      }
      router.push(redirect);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Authentication failed"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <LoginLayout
      portalLabel="Admin Dashboard"
      portalDescription="Access analytics, reports, and manage your school's data from one powerful dashboard."
    >
      <Card className="border-0 shadow-xl">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
            <BarChart3 className="h-7 w-7" />
          </div>
          <CardTitle className="text-2xl font-bold">Smart Report Dashboard</CardTitle>
          <CardDescription>
            {isSignUp
              ? "Create an account to get started"
              : "Sign in to access your reports"}
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
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="h-11"
              />
            </div>

            <Button type="submit" className="w-full h-11 font-semibold" disabled={loading}>
              {loading
                ? "Please wait…"
                : isSignUp
                  ? "Create Account"
                  : "Sign In"}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
              <button
                type="button"
                className="font-medium text-primary underline-offset-4 hover:underline"
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setError(null);
                }}
              >
                {isSignUp ? "Sign in" : "Sign up"}
              </button>
            </p>
          </form>
        </CardContent>
      </Card>
    </LoginLayout>
  );
}
