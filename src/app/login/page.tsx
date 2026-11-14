"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { CleveMark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setBusy(false);
    if (res.ok) {
      const next = new URLSearchParams(window.location.search).get("next") || "/";
      window.location.href = next.startsWith("/") ? next : "/";
    } else setError("That password isn't right.");
  };

  return (
    <div className="grid min-h-dvh place-items-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-soft">
        <CleveMark className="h-10 w-auto" blink />
        <h1 className="mt-4 font-serif text-2xl">This clevex is private</h1>
        <p className="mt-1 text-muted-foreground text-sm">Enter the password to continue.</p>
        <form
          className="mt-5 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
          {error && <p className="text-destructive-foreground text-sm">{error}</p>}
          <Button type="submit" variant="brand" className="w-full" loading={busy} disabled={!password}>
            <Lock /> Unlock
          </Button>
        </form>
      </div>
    </div>
  );
}
