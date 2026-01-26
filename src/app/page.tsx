"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Play, Square, RotateCcw, FileText } from "lucide-react";
import { ContainerStatus } from "@/types";

type ClusterComposeResponse = {
  success?: boolean;
  error?: string;
  action?: "up" | "down";
  command?: string;
  args?: string[];
  cwd?: string;
  startedAt?: number;
  finishedAt?: number;
  durationMs?: number;
  exitCode?: number | string | null;
  stdout?: string;
  stderr?: string;
};

type ClusterLog = {
  action: "up" | "down";
  ok: boolean;
  ranAt: number;
  command: string;
  args: string[];
  cwd?: string;
  durationMs?: number;
  exitCode?: number | string | null;
  stdout: string;
  stderr: string;
  error?: string;
};

export default function Dashboard() {
  const [containers, setContainers] = useState<ContainerStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [clusterBusy, setClusterBusy] = useState<"up" | "down" | null>(null);
  const [clusterLog, setClusterLog] = useState<ClusterLog | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/containers");
      const data = await res.json();
      if (Array.isArray(data)) {
        setContainers(data);
      } else {
        console.error("Data is not an array:", data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleAction = async (id: string, action: string) => {
    try {
      await fetch(`/api/containers/${id}`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      fetchStatus();
    } catch (err) {
      console.error(err);
    }
  };

  const handleCluster = async (action: "up" | "down") => {
    setClusterBusy(action);
    setClusterLog(null);
    try {
      const res = await fetch("/api/cluster/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json()) as ClusterComposeResponse;

      const stdout = typeof data?.stdout === "string" ? data.stdout : "";
      const stderr = typeof data?.stderr === "string" ? data.stderr : "";
      const ok = Boolean(data?.success) && res.ok;

      setClusterLog({
        action,
        ok,
        ranAt: Date.now(),
        command: data?.command || "docker",
        args: Array.isArray(data?.args) ? data.args : [],
        cwd: data?.cwd,
        durationMs: data?.durationMs,
        exitCode: data?.exitCode ?? null,
        stdout,
        stderr,
        error: ok ? undefined : data?.error || "Cluster operation failed",
      });

      if (!res.ok) {
        console.error(data);
      }
      fetchStatus();
    } catch (err) {
      console.error(err);
      setClusterLog({
        action,
        ok: false,
        ranAt: Date.now(),
        command: "docker",
        args: [],
        stdout: "",
        stderr: "",
        error: "Cluster operation failed",
      });
    } finally {
      setClusterBusy(null);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      console.error(e);
      alert("クリップボードへのコピーに失敗しました");
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-bold tracking-tight">サーバー状況</h2>
          <div className="flex gap-2">
            <button
              onClick={() => handleCluster("up")}
              className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90 disabled:opacity-60"
              disabled={clusterBusy !== null}
              title="asa_cluster を docker compose up -d"
            >
              一括起動
            </button>
            <button
              onClick={() => handleCluster("down")}
              className="px-4 py-2 bg-destructive text-destructive-foreground rounded text-sm hover:bg-destructive/90 disabled:opacity-60"
              disabled={clusterBusy !== null}
              title="asa_cluster を docker compose down（ボリューム保持）"
            >
              一括停止
            </button>
            <button
              onClick={fetchStatus}
              className="px-4 py-2 bg-secondary text-secondary-foreground rounded text-sm hover:bg-secondary/80"
            >
              更新
            </button>
          </div>
        </div>

        {clusterLog && (
          <details className="p-4 border rounded bg-card" open>
            <summary className="cursor-pointer select-none font-medium">
              一括{clusterLog.action === "up" ? "起動" : "停止"} 実行ログ：
              <span className={clusterLog.ok ? "text-green-600" : "text-destructive"}>
                {clusterLog.ok ? "成功" : "失敗"}
              </span>
              <span className="text-muted-foreground text-sm">（{new Date(clusterLog.ranAt).toLocaleString()}）</span>
            </summary>

            <div className="pt-4 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  className="px-3 py-1 rounded bg-secondary text-secondary-foreground hover:bg-secondary/80 text-sm"
                  onClick={() => setClusterLog(null)}
                >
                  クリア
                </button>
                <button
                  className="px-3 py-1 rounded bg-secondary text-secondary-foreground hover:bg-secondary/80 text-sm"
                  onClick={() => copyToClipboard(JSON.stringify(clusterLog, null, 2))}
                >
                  JSONをコピー
                </button>
                {clusterLog.durationMs !== undefined && (
                  <span className="text-sm text-muted-foreground">{clusterLog.durationMs}ms</span>
                )}
                {clusterLog.exitCode !== null && clusterLog.exitCode !== undefined && (
                  <span className="text-sm text-muted-foreground">exitCode: {String(clusterLog.exitCode)}</span>
                )}
              </div>

              <div className="text-sm">
                <div className="text-muted-foreground">実行</div>
                <div className="font-mono break-all">
                  {clusterLog.command}
                  {clusterLog.args.length ? " " + clusterLog.args.join(" ") : ""}
                </div>
                {clusterLog.cwd && (
                  <div className="text-muted-foreground mt-1">cwd: {clusterLog.cwd}</div>
                )}
              </div>

              {clusterLog.error && (
                <div className="p-3 border border-destructive rounded text-destructive text-sm">
                  {clusterLog.error}
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">stdout</div>
                    <button
                      className="px-2 py-1 rounded bg-secondary text-secondary-foreground hover:bg-secondary/80 text-xs"
                      onClick={() => copyToClipboard(clusterLog.stdout)}
                      disabled={!clusterLog.stdout}
                    >
                      コピー
                    </button>
                  </div>
                  <pre className="text-xs font-mono whitespace-pre-wrap break-words max-h-64 overflow-auto p-3 rounded border bg-background">
                    {clusterLog.stdout || "(empty)"}
                  </pre>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">stderr</div>
                    <button
                      className="px-2 py-1 rounded bg-secondary text-secondary-foreground hover:bg-secondary/80 text-xs"
                      onClick={() => copyToClipboard(clusterLog.stderr)}
                      disabled={!clusterLog.stderr}
                    >
                      コピー
                    </button>
                  </div>
                  <pre className="text-xs font-mono whitespace-pre-wrap break-words max-h-64 overflow-auto p-3 rounded border bg-background">
                    {clusterLog.stderr || "(empty)"}
                  </pre>
                </div>
              </div>
            </div>
          </details>
        )}

        {loading ? (
          <div>Loading servers...</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {containers.map((c) => (
              <div key={c.id} className="p-6 bg-card border rounded-lg space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-lg">{c.name}</h3>
                    <p className="text-sm text-muted-foreground">{c.image}</p>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                    c.state === 'running' ? 'bg-green-500/10 text-green-500' : 
                    c.state === 'exited' ? 'bg-red-500/10 text-red-500' : 
                    'bg-yellow-500/10 text-yellow-500'
                  }`}>
                    {c.state.toUpperCase()}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-muted-foreground">Map</p>
                    <p>{c.map || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Status</p>
                    <p className="truncate">{c.status}</p>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  {c.state !== 'running' ? (
                    <button
                      onClick={() => handleAction(c.id, 'start')}
                      className="flex-1 flex items-center justify-center gap-1 py-2 bg-primary text-primary-foreground rounded text-sm font-medium hover:bg-primary/90"
                    >
                      <Play className="h-4 w-4" /> Start
                    </button>
                  ) : (
                    <button
                      onClick={() => handleAction(c.id, 'stop')}
                      className="flex-1 flex items-center justify-center gap-1 py-2 bg-destructive text-destructive-foreground rounded text-sm font-medium hover:bg-destructive/90"
                    >
                      <Square className="h-4 w-4" /> Stop
                    </button>
                  )}
                  <button
                    onClick={() => handleAction(c.id, 'restart')}
                    className="p-2 bg-secondary text-secondary-foreground rounded hover:bg-secondary/80"
                    title="Restart"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                  <button
                    className="p-2 bg-secondary text-secondary-foreground rounded hover:bg-secondary/80"
                    title="Logs"
                  >
                    <FileText className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
