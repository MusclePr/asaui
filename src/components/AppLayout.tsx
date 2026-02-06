"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import { LogOut, Server, Users, Settings, Archive } from "lucide-react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  if (status === "loading") {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  if (!session) return null;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-xl font-bold tracking-tight">
              asaui
            </Link>
            <nav className="flex items-center gap-4 text-sm font-medium">
              <Link href="/" className="transition-colors hover:text-foreground/80 flex items-center gap-1">
                <Server className="h-4 w-4" /> サーバー
              </Link>
              <Link href="/players" className="transition-colors hover:text-foreground/80 flex items-center gap-1">
                <Users className="h-4 w-4" /> プレイヤー
              </Link>
              <Link href="/backups" className="transition-colors hover:text-foreground/80 flex items-center gap-1">
                <Archive className="h-4 w-4" /> バックアップ
              </Link>
              <Link href="/cluster" className="transition-colors hover:text-foreground/80 flex items-center gap-1">
                <Settings className="h-4 w-4" /> 設定
              </Link>
            </nav>
          </div>
          <button
            onClick={() => signOut()}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <LogOut className="h-4 w-4" /> ログアウト
          </button>
        </div>
      </header>
      <main className="container flex-1 py-6">{children}</main>
    </div>
  );
}
