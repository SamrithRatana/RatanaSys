"use client";

import { Icons } from "@/components/Other/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ClientSafeProvider, getProviders, signIn } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

export function AuthForm() {
  const [providers, setProviders] = useState<Record<string, ClientSafeProvider>>({});
  const [tab, setTab] = useState<"credentials" | "google">("credentials");
  const [identifier, setIdentifier] = useState("");  // ← renamed
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const searchParams = useSearchParams();
  const registered = searchParams.get("registered") === "true";

  useEffect(() => {
    async function getProvidersValue() {
      const p = await getProviders();
      setProviders(p as Record<string, ClientSafeProvider>);
    }
    getProvidersValue();
  }, []);

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await signIn("credentials", {
      identifier,          // ← renamed
      password,
      callbackUrl: "/portal",
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("Invalid email/username or password.");
    } else if (res?.url) {
      window.location.href = res.url;
    }
  }

  return (
    <div className="grid gap-6">
      {registered && (
        <p className="text-sm text-center text-green-600 bg-green-50 border border-green-200 rounded-md py-2 px-3">
          Account created! You can now sign in.
        </p>
      )}

      <div className="flex rounded-md border overflow-hidden">
        <button
          type="button"
          onClick={() => setTab("credentials")}
          className={`flex-1 py-2 text-sm transition-colors ${
            tab === "credentials"
              ? "bg-primary text-primary-foreground"
              : "bg-background text-muted-foreground hover:bg-muted"
          }`}
        >
          Email & Password
        </button>
        <button
          type="button"
          onClick={() => setTab("google")}
          className={`flex-1 py-2 text-sm transition-colors ${
            tab === "google"
              ? "bg-primary text-primary-foreground"
              : "bg-background text-muted-foreground hover:bg-muted"
          }`}
        >
          Google
        </button>
      </div>

      {tab === "credentials" && (
        <form onSubmit={handleCredentials} className="grid gap-4">
          <div className="grid gap-1">
            <Label htmlFor="identifier">Email or Username</Label>
            <Input
              id="identifier"
              type="text"
              placeholder="name@company.com or username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            No account yet?{" "}
            <Link href="/register" className="underline underline-offset-4 hover:text-primary">
              Create one
            </Link>
          </p>
        </form>
      )}

      {tab === "google" && (
        <div className="grid gap-4">
          {providers &&
            Object.values(providers)
              .filter((p) => p.id === "google")
              .map((provider) => (
                <Button
                  key={provider.name}
                  variant="outline"
                  type="button"
                  onClick={() => signIn(provider.id, { callbackUrl: "/portal" })}
                >
                  <Icons.google className="mr-2 h-4 w-4" />
                  Continue with Google
                </Button>
              ))}
        </div>
      )}
    </div>
  );
}