"use client";

import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import AppLayout from "@/components/AppLayout";
import { Play, Square, RotateCcw, FileText, X, Terminal, Send } from "lucide-react";
import { ContainerStatus } from "@/types";
import LogStreamViewer from "@/components/LogStreamViewer";
import { getApiUrl } from "@/lib/utils";

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
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const [containers, setContainers] = useState<ContainerStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [clusterBusy, setClusterBusy] = useState<"up" | "down" | null>(null);
  const [actionsInProgress, setActionsInProgress] = useState<Record<string, boolean>>({});
  const [clusterLog, setClusterLog] = useState<ClusterLog | null>(null);
  const [selectedLogContainer, setSelectedLogContainer] = useState<ContainerStatus | null>(null);
  const [selectedRconContainer, setSelectedRconContainer] = useState<ContainerStatus | null>(null);
  const [rconCommand, setRconCommand] = useState("");
  const [rconOutput, setRconOutput] = useState<{ type: 'cmd' | 'res' | 'err', text: string }[]>([]);
  const [rconLoading, setRconLoading] = useState(false);
  const rconScrollRef = useRef<HTMLDivElement>(null);

  const fetchStatus = async (forceRefresh = false) => {
    try {
      const res = await fetch(getApiUrl(`/api/containers${forceRefresh ? "?refresh=true" : ""}`));
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
    setActionsInProgress(prev => ({ ...prev, [id]: true }));
    try {
      await fetch(getApiUrl(`/api/containers/${id}`), {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      fetchStatus();
    } catch (err) {
      console.error(err);
    } finally {
      setActionsInProgress(prev => ({ ...prev, [id]: false }));
    }
  };

  const handleKick = async (containerName: string, eosId: string, playerName: string) => {
    if (!confirm(`プレイヤー 「${playerName}」 を KICK しますか？`)) return;
    
    try {
      const res = await fetch(getApiUrl("/api/rcon"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          containerId: containerName,
          command: `KickPlayer ${eosId}`
        }),
      });
      const data = await res.json();
      if (data.output) {
        alert(data.output);
      }
      fetchStatus();
    } catch (err) {
      console.error(err);
      alert("KICK コマンドの送信に失敗しました。");
    }
  };

  const handleCluster = async (action: "up" | "down") => {
    setClusterBusy(action);
    setClusterLog(null);
    try {
      const res = await fetch(getApiUrl("/api/cluster/compose"), {
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

  const handleRconSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rconCommand.trim() || rconLoading || !selectedRconContainer) return;

    const cmd = rconCommand.trim();
    setRconCommand("");
    setRconLoading(true);
    setRconOutput(prev => [...prev, { type: 'cmd', text: cmd }]);

    try {
      const res = await fetch(getApiUrl("/api/rcon"), {
        method: "POST",
        body: JSON.stringify({ 
          command: cmd,
          containerId: selectedRconContainer.id 
        }),
      });
      const data = await res.json();
      
      if (res.ok) {
        setRconOutput(prev => [...prev, { type: 'res', text: data.output || "(No output)" }]);
      } else {
        setRconOutput(prev => [...prev, { type: 'err', text: data.error || "Failed to execute command" }]);
      }
    } catch (err) {
      setRconOutput(prev => [...prev, { type: 'err', text: "Network error occurred" }]);
    } finally {
      setRconLoading(false);
    }
  };

  useEffect(() => {
    if (rconScrollRef.current) {
      rconScrollRef.current.scrollTop = rconScrollRef.current.scrollHeight;
    }
  }, [rconOutput]);

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
              onClick={() => fetchStatus(true)}
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
              <div key={c.id} className="p-6 bg-card border rounded-lg space-y-4 flex flex-col">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-lg truncate" title={c.sessionName || c.name}>
                      {c.sessionName || c.name}
                    </h3>
                    <p className="text-sm text-muted-foreground truncate">{c.name}</p>
                  </div>
                  <div className={`shrink-0 px-2 py-1 rounded-full text-[10px] font-bold flex items-center gap-1 ${
                    c.detailedState === 'UPDATING' || c.detailedState === 'BACKUP_SAVE' || c.detailedState === 'RESTORING' ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20' :
                    c.detailedState === 'MAINTENANCE' ? 'bg-orange-500/10 text-orange-500 border border-orange-500/20' :
                    c.detailedState === 'WAITING' || c.detailedState === 'WAIT_MASTER' || c.detailedState === 'WAIT_INSTALL' ? 'bg-purple-500/10 text-purple-500 border border-purple-500/20' :
                    c.detailedState === 'UPDATE REQ' ? 'bg-cyan-500/10 text-cyan-500 border border-cyan-500/20' :
                    c.detailedState === 'STOPPING' || c.detailedState === 'STARTING' || c.isStopping ? 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20' :
                    c.detailedState === 'RUNNING' || (c.state === 'running' && !c.detailedState) ? 'bg-green-500/10 text-green-500 border border-green-500/20' : 
                    c.detailedState === 'STOPPED' || (c.state === 'exited' && !c.detailedState) ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 
                    'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20'
                  }`}>
                    {c.detailedState || (c.isStopping ? 'STOPPING' : c.state.toUpperCase())}
                    {c.health && (
                      <span className={`uppercase border-l pl-1 ml-1 ${
                        c.health === 'healthy' ? 'border-green-500/30' : 
                        c.health === 'unhealthy' ? 'text-destructive border-destructive/30' : 
                        'text-yellow-500 border-yellow-500/30'
                      }`}>
                        {c.health}
                      </span>
                    )}
                  </div>
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

                {c.onlinePlayers && c.onlinePlayers.length > 0 && (
                  <div className="bg-secondary/30 p-2 rounded text-xs space-y-1">
                    <p className="text-muted-foreground font-medium">接続中のプレイヤー ({c.onlinePlayers.length})</p>
                    <div className="flex flex-wrap gap-1">
                      {c.onlinePlayers.map((player, idx) => (
                        <div key={idx} className="bg-background/50 pl-1.5 pr-0.5 py-0.5 rounded border border-secondary/50 flex items-center gap-1 group" title={player.eosId}>
                          <span>{player.name}</span>
                          <button
                            onClick={() => handleKick(c.name, player.eosId, player.name)}
                            className="p-0.5 hover:bg-destructive hover:text-destructive-foreground rounded transition-colors text-muted-foreground"
                            title="KICK"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {c.offlinePlayers && c.offlinePlayers.length > 0 && (
                  <div className="bg-secondary/10 p-2 rounded text-xs space-y-1">
                    <p className="text-muted-foreground font-medium flex justify-between">
                      <span>保存済みのプレイヤー ({c.offlinePlayers.length})</span>
                      <span className="text-[10px]">最近の10名を表示</span>
                    </p>
                    <div className="flex flex-wrap gap-1 opacity-80">
                      {c.offlinePlayers.slice(0, 10).map((player, idx) => (
                        <div key={idx} className="bg-background/30 px-1.5 py-0.5 rounded border border-secondary/20" title={`EOS ID: ${player.eosId}\n最終ログイン: ${player.lastLogin}`}>
                          {player.name}
                        </div>
                      ))}
                      {c.offlinePlayers.length > 10 && (
                        <div className="px-1.5 py-0.5 text-muted-foreground italic">
                          ...他 {c.offlinePlayers.length - 10} 名
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {isAdmin && (
                  <>
                    <div className="grid grid-cols-3 gap-2 pt-2">
                      {c.state !== 'running' ? (
                        <button
                          onClick={() => handleAction(c.id, 'start')}
                          className="p-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 flex justify-center disabled:opacity-40"
                          title={c.state === 'not_created' ? "コンテナが作成されていません（一括起動を使用してください）" : "起動"}
                          disabled={actionsInProgress[c.id] || c.state === 'not_created'}
                        >
                          <Play className="h-4 w-4" />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleAction(c.id, 'stop')}
                          className="p-2 bg-destructive text-destructive-foreground rounded hover:bg-destructive/90 flex justify-center disabled:opacity-40"
                          title="停止"
                          disabled={actionsInProgress[c.id] || c.isStopping}
                        >
                          <Square className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleAction(c.id, 'restart')}
                        className="p-2 bg-secondary text-secondary-foreground rounded hover:bg-secondary/80 flex justify-center disabled:opacity-40"
                        title={c.state === 'not_created' ? "コンテナが作成されていません" : "再起動"}
                        disabled={actionsInProgress[c.id] || c.isStopping || c.state === 'not_created'}
                      >
                        <RotateCcw className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          setSelectedRconContainer(c);
                          setRconOutput([]);
                        }}
                        className="p-2 bg-secondary text-secondary-foreground rounded hover:bg-secondary/80 disabled:opacity-40 flex justify-center"
                        title={c.state === 'not_created' ? "コンテナが作成されていません" : (c.health === 'healthy' ? "RCON コマンド" : (c.isStopping ? "停止処理中" : "RCON (サーバーが正常稼働中のみ利用可能)"))}
                        disabled={c.health !== 'healthy' || c.isStopping || actionsInProgress[c.id] || c.state === 'not_created'}
                      >
                        <Terminal className="h-4 w-4" />
                      </button>
                    </div>
                    <button
                      onClick={() => setSelectedLogContainer(c)}
                      className="w-full py-2 bg-secondary text-secondary-foreground rounded text-sm font-medium hover:bg-secondary/80 flex items-center justify-center gap-2 transition-colors disabled:opacity-40"
                      disabled={c.state === 'not_created'}
                      title={c.state === 'not_created' ? "コンテナが作成されていません" : "ログを表示"}
                    >
                      <FileText className="h-4 w-4" /> ログを表示
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Log Modal */}
      {selectedLogContainer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-[95vw] bg-background rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-xl font-bold">
                {selectedLogContainer.sessionName || selectedLogContainer.name} のログ
              </h2>
              <button 
                onClick={() => setSelectedLogContainer(null)}
                className="p-2 hover:bg-secondary rounded-full transition-colors"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="flex-1 flex flex-col min-h-0 p-4 overflow-hidden">
              <LogStreamViewer 
                containerId={selectedLogContainer.id} 
                containerName={selectedLogContainer.name} 
                maxLines={1000}
              />
            </div>
          </div>
        </div>
      )}

      {/* RCON Modal */}
      {selectedRconContainer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-4xl bg-background rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2">
                <Terminal className="h-5 w-5" />
                <h2 className="text-xl font-bold">
                  {selectedRconContainer.sessionName || selectedRconContainer.name} RCON
                </h2>
              </div>
              <button 
                onClick={() => setSelectedRconContainer(null)}
                className="p-2 hover:bg-secondary rounded-full transition-colors"
                disabled={rconLoading}
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            
            <div className="flex-1 flex flex-col min-h-0 bg-black font-mono text-sm overflow-hidden">
              <div 
                ref={rconScrollRef}
                className="flex-1 overflow-y-auto p-4 space-y-2"
              >
                {rconOutput.map((line, i) => (
                  <div key={i} className={`flex gap-2 ${
                    line.type === 'cmd' ? 'text-primary' : 
                    line.type === 'err' ? 'text-destructive' : 
                    'text-green-400'
                  }`}>
                    <span className="shrink-0">
                      {line.type === 'cmd' ? '>' : line.type === 'err' ? '!' : '#'}
                    </span>
                    <span className="whitespace-pre-wrap">{line.text}</span>
                  </div>
                ))}
                {rconOutput.length === 0 && (
                  <div className="text-muted-foreground italic">
                    コマンドを入力して実行してください (例: ListPlayers, ServerChat Hello)
                  </div>
                )}
                {rconLoading && (
                  <div className="text-yellow-500 animate-pulse">Running...</div>
                )}
              </div>

              <form onSubmit={handleRconSubmit} className="p-4 border-t border-white/10 flex gap-2">
                <input
                  type="text"
                  placeholder="コマンドを入力..."
                  className="flex-1 px-4 py-2 bg-white/5 border border-white/20 rounded-md focus:outline-none focus:ring-1 focus:ring-primary text-white"
                  value={rconCommand}
                  onChange={(e) => setRconCommand(e.target.value)}
                  disabled={rconLoading}
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={rconLoading || !rconCommand.trim()}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md flex items-center gap-2 disabled:opacity-50"
                >
                  <Send className="h-4 w-4" /> 実行
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
