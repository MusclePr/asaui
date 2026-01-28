"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { LogIn } from "lucide-react";
import { PasswordInput } from "./PasswordInput";
import { getApiUrl } from "@/lib/utils";

export default function LoginButton() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await signIn("credentials", {
      password,
      redirect: true,
      callbackUrl: getApiUrl("/"),
    });

    if (result?.error) {
      setError("パスワードが正しくありません");
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <PasswordInput
          placeholder="管理パスワード"
          className="w-full px-3 py-2 border rounded-md bg-background"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
      >
        <LogIn className="h-4 w-4" /> ログイン
      </button>
    </form>
  );
}
