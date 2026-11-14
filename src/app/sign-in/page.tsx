"use client";

import { useState } from "react";
import Link from "next/link";
import { CleveMark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

type Mode = "sign-in" | "sign-up";

function nextPath() {
  const next = new URLSearchParams(window.location.search).get("next") || "/app";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/app";
}

export default function SignInPage() {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const res =
      mode === "sign-in"
        ? await authClient.signIn.email({ email: email.trim(), password })
        : await authClient.signUp.email({ email: email.trim(), password, name: name.trim() || email.split("@")[0] });
    if (res.error) {
      setBusy(false);
      setError(
        res.error.message ||
          (mode === "sign-in" ? "That email and password don't match." : "Couldn't create the account."),
      );
      return;
    }
    // Full navigation so the server layout sees the new session cookie.
    window.location.href = nextPath();
  };

  const canSubmit = email.includes("@") && password.length >= 8 && !busy;

  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden bg-[#f6f5f3] px-4 py-10 text-[#323753]">
      <div aria-hidden className="absolute inset-0 bg-[url(/marketing/hero-bg-1.avif)] bg-cover bg-center" />
      <div className="relative w-full max-w-sm">
        <Link href="/" className="mb-6 flex items-center justify-center gap-2 font-semibold text-[19px] text-white tracking-[-0.02em] drop-shadow-sm">
          <CleveMark className="h-7 w-auto" />
          clevex
        </Link>
        <div className="rounded-2xl bg-white/95 p-6 shadow-[0_30px_80px_-20px_rgba(30,40,80,0.45)] backdrop-blur">
          <h1 className="font-semibold text-2xl tracking-[-0.02em]">
            {mode === "sign-in" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="mt-1 text-[#323753]/60 text-sm">
            {mode === "sign-in" ? "Sign in to open your papers." : "Your papers sync to this account across devices."}
          </p>

          <form
            className="mt-6 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (canSubmit) submit();
            }}
          >
            {mode === "sign-up" && (
              <label className="block">
                <span className="mb-1 block font-medium text-xs">Name</span>
                <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Ada Lovelace" />
              </label>
            )}
            <label className="block">
              <span className="mb-1 block font-medium text-xs">Email</span>
              <Input
                type="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="you@university.edu"
              />
            </label>
            <label className="block">
              <span className="mb-1 block font-medium text-xs">Password</span>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                placeholder={mode === "sign-up" ? "At least 8 characters" : ""}
              />
            </label>
            {error && <p className="text-destructive-foreground text-sm">{error}</p>}
            <Button type="submit" variant="brand" size="lg" className="w-full" loading={busy} disabled={!canSubmit}>
              {mode === "sign-in" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <p className="mt-5 text-center text-[#323753]/60 text-sm">
            {mode === "sign-in" ? "New to clevex? " : "Already have an account? "}
            <button
              type="button"
              onClick={() => {
                setMode(mode === "sign-in" ? "sign-up" : "sign-in");
                setError(null);
              }}
              className={cn("font-medium text-[#b75a2f] underline-offset-2 hover:underline")}
            >
              {mode === "sign-in" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
