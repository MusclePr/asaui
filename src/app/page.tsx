"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import AppLayout from "@/components/AppLayout";
import { Play, Square, RotateCcw, FileText, X, Terminal, Send, Search, Loader, Check } from "lucide-react";
import { ContainerStatus, UnregisteredPlayerCandidate } from "@/types";
import LogStreamViewer from "@/components/LogStreamViewer";
import { getApiUrl } from "@/lib/utils";
import { canExecuteRcon, isContainerActionLocked, isPausedDetailedState, isPausingDetailedState } from "@/lib/serverState";

const TRANSITIONAL_DETAILED_STATES = new Set([
  "STARTING",
  "STOPPING",
  "PAUSING",
  "RESUMING",
  "UPDATING",
  "WAITING",
  "WAIT_MASTER",
  "WAIT_INSTALL",
]);

function isServerOperationInProgress(container: ContainerStatus): boolean {
  const detailed = (container.detailedState || "").toUpperCase();
  return container.isStopping === true || TRANSITIONAL_DETAILED_STATES.has(detailed);
}

function isClusterBackupRestoreInProgress(container: ContainerStatus): boolean {
  if (!container.clusterOperationInProgress) return false;
  return container.clusterOperationType === "backup" || container.clusterOperationType === "restore";
}

function getClusterOperationLabel(type?: ContainerStatus["clusterOperationType"]): string {
  return type === "restore" ? "復元" : "バックアップ";
}

type ServerActionType = "start" | "stop" | "restart";

function getServerOperationLabel(container: ContainerStatus, localAction?: ServerActionType): string {
  const ds = (container.detailedState || "").toUpperCase();
  if (ds === "STARTING" || ds === "RESUMING") return "起動中";
  if (ds === "UPDATING") return "更新中";
  if (ds === "WAITING" || ds === "WAIT_MASTER" || ds === "WAIT_INSTALL") return "準備中";
  if (ds === "STOPPING" || container.isStopping) return "停止中";
  if (ds === "PAUSING") return "PAUSE 移行中";
  if (localAction === "start") return "起動中";
  if (localAction === "stop") return "停止中";
  if (localAction === "restart") return "再起動中";
  return "処理中";
}

type ClusterComposeResponse = {
  success?: boolean;
  error?: string;
  action?: "up" | "down" | "cleanup-signals";
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
  action: "up" | "down" | "cleanup-signals";
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
  const [autoPauseFeatureEnabled, setAutoPauseFeatureEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [clusterBusy, setClusterBusy] = useState<"up" | "down" | "cleanup-signals" | null>(null);
  const [actionsInProgress, setActionsInProgress] = useState<Record<string, ServerActionType | null>>({});
  const [autoPauseActionsInProgress, setAutoPauseActionsInProgress] = useState<Record<string, boolean>>({});
  const [clusterLog, setClusterLog] = useState<ClusterLog | null>(null);
  const [selectedLogContainer, setSelectedLogContainer] = useState<ContainerStatus | null>(null);
  const [selectedRconContainer, setSelectedRconContainer] = useState<ContainerStatus | null>(null);
  const [rconCommand, setRconCommand] = useState("");
  const [rconOutput, setRconOutput] = useState<{ type: 'cmd' | 'res' | 'err', text: string }[]>([]);
  const [rconLoading, setRconLoading] = useState(false);
  const rconScrollRef = useRef<HTMLDivElement>(null);

  // Unregistered players modal state
  const [showUnregisteredModal, setShowUnregisteredModal] = useState(false);
  const [unregisteredCandidates, setUnregisteredCandidates] = useState<UnregisteredPlayerCandidate[]>([]);
  const [unregisteredLoading, setUnregisteredLoading] = useState(false);
  const [unregisteredError, setUnregisteredError] = useState<string | null>(null);
  const [selectedCandidates, setSelectedCandidates] = useState<Set<string>>(new Set());
  const [registeringEosIds, setRegisteringEosIds] = useState<Set<string>>(new Set());
  const [registeredEosIds, setRegisteredEosIds] = useState<Set<string>>(new Set());

  const fetchAutoPauseFeatureFlag = useCallback(async () => {
    try {
      const res = await fetch(getApiUrl("/api/cluster/env"), { cache: "no-store" });
      const data = await res.json();
      if (res.ok) {
        setAutoPauseFeatureEnabled(
          String(data?.effective?.AUTO_PAUSE_ENABLED ?? "").toLowerCase() === "true"
        );
      }
    } catch (err) {
      console.error(err);
      setAutoPauseFeatureEnabled(false);
    }
  }, []);

  const fetchStatus = useCallback(async (forceRefresh = false) => {
    try {
      const res = await fetch(getApiUrl(`/api/containers${forceRefresh ? "?refresh=true" : ""}`), {
        cache: "no-store",
      });
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
  }, []);

  const refreshDashboard = useCallback(async (forceRefresh = false) => {
    await Promise.all([
      fetchStatus(forceRefresh),
      fetchAutoPauseFeatureFlag(),
    ]);
  }, [fetchAutoPauseFeatureFlag, fetchStatus]);

  const fetchUnregisteredCandidates = useCallback(async () => {
    setUnregisteredLoading(true);
    setUnregisteredError(null);
    setSelectedCandidates(new Set());
    setRegisteredEosIds(new Set());

    try {
      const res = await fetch(getApiUrl("/api/players/unregistered"));
      const data = await res.json();
      
      if (res.ok && Array.isArray(data)) {
        setUnregisteredCandidates(data);
      } else {
        setUnregisteredError(data?.error || "未登録者の取得に失敗しました");
      }
    } catch (err) {
      console.error(err);
      setUnregisteredError("ネットワークエラーが発生しました");
    } finally {
      setUnregisteredLoading(false);
    }
  }, []);

  const handleRegisterUnregistered = async () => {
    const selectedArray = Array.from(selectedCandidates);
    if (selectedArray.length === 0) return;

    setRegisteringEosIds(new Set(selectedArray));

    try {
      const results = await Promise.allSettled(
        selectedArray.map(eosId => {
          const candidate = unregisteredCandidates.find(c => c.eosId === eosId);
          if (!candidate) return Promise.reject(new Error("Candidate not found"));

          return fetch(getApiUrl("/api/players/register"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              eosId,
              displayName: candidate.name || "",
              whitelist: false,
              bypass: true,
            }),
          });
        })
      );

      // Track successfully registered IDs
      const newRegistered = new Set(registeredEosIds);
      results.forEach((result, idx) => {
        if (result.status === "fulfilled" && result.value.ok) {
          newRegistered.add(selectedArray[idx]);
        }
      });
      
      setRegisteredEosIds(newRegistered);

      // Refresh dashboard after successful registrations
      if (newRegistered.size > 0) {
        await refreshDashboard(true);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setRegisteringEosIds(new Set());
    }
  };

  const hasAnyOperationInProgress =
    clusterBusy !== null ||
    Object.values(actionsInProgress).some((v) => v != null) ||
    Object.values(autoPauseActionsInProgress).some(Boolean) ||
    containers.some((container) => isServerOperationInProgress(container) || isClusterBackupRestoreInProgress(container));

  useEffect(() => {
    void refreshDashboard();
    const interval = setInterval(() => {
      void refreshDashboard();
    }, hasAnyOperationInProgress ? 3000 : 10000);
    return () => clearInterval(interval);
  }, [hasAnyOperationInProgress, refreshDashboard]);

  const handleAction = async (id: string, action: string) => {
    const serverAction: ServerActionType =
      action === "stop" ? "stop" : action === "restart" ? "restart" : "start";
    setActionsInProgress(prev => ({ ...prev, [id]: serverAction }));
    try {
      await fetch(getApiUrl(`/api/containers/${id}`), {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      await refreshDashboard();
    } catch (err) {
      console.error(err);
    } finally {
      setActionsInProgress(prev => ({ ...prev, [id]: null }));
    }
  };

  const handleAutoPauseToggle = async (container: ContainerStatus, enabled: boolean) => {
    setAutoPauseActionsInProgress(prev => ({ ...prev, [container.id]: true }));
    const previous = container.autoPauseEnabled ?? true;

    setContainers(prev =>
      prev.map(c => (c.id === container.id ? { ...c, autoPauseEnabled: enabled } : c))
    );

    try {
      const res = await fetch(getApiUrl(`/api/containers/${container.id}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: enabled ? "autopause-enable" : "autopause-disable" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "自動PAUSE設定の更新に失敗しました");
      await refreshDashboard();
    } catch (err) {
      console.error(err);
      setContainers(prev =>
        prev.map(c => (c.id === container.id ? { ...c, autoPauseEnabled: previous } : c))
      );
      alert(err instanceof Error ? err.message : "自動PAUSE設定の更新に失敗しました。");
    } finally {
      setAutoPauseActionsInProgress(prev => ({ ...prev, [container.id]: false }));
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
      await refreshDashboard();
    } catch (err) {
      console.error(err);
      alert("KICK コマンドの送信に失敗しました。");
    }
  };

  const QUICK_RCON_COMMANDS = [
    { label: "☠", command: "DestroyWildDinos", tooltip: "野生恐竜のリセット" },
    //{ label: "↑", command: "slomo 1", tooltip: "ゲームスピードを通常に戻す" },
    //{ label: "⇈", command: "slomo 20", tooltip: "ゲームスピードを20倍に" },
  ];

  const [quickRconInProgress, setQuickRconInProgress] = useState<Record<string, boolean>>({});

  const handleQuickRcon = async (containerName: string, command: string, label: string) => {
    const key = `${containerName}-${command}`;
    if (quickRconInProgress[key]) return;
    
    setQuickRconInProgress(prev => ({ ...prev, [key]: true }));
    try {
      const res = await fetch(getApiUrl("/api/rcon"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          containerId: containerName,
          command: command
        }),
      });
      const data = await res.json();
      if (data.output) {
        alert(`${label} 実行結果:\n${data.output}`);
      } else if (data.error) {
        alert(`${label} 実行エラー:\n${data.error}`);
      } else {
        alert(`${label} を実行しました。`);
      }
    } catch (err) {
      console.error(err);
      alert(`${label} コマンドの送信に失敗しました。`);
    } finally {
      setQuickRconInProgress(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleCluster = async (action: "up" | "down" | "cleanup-signals") => {
    if (action === "cleanup-signals") {
      const ok = confirm(
        "クリーンアップを実行しますか？\n\n実行条件:\n- .signals/*/*.lock が存在する\n- 一括停止状態（compose 管理コンテナが0件）"
      );
      if (!ok) return;
    }

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
        if (data?.error) {
          alert(data.error);
        }
      }
      await refreshDashboard(true);
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
    } catch {
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

  const canSearchUnregistered = containers.some((c) => c.state !== "not_created");

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
              onClick={() => handleCluster("cleanup-signals")}
              className="px-4 py-2 bg-amber-600 text-white rounded text-sm hover:bg-amber-500 disabled:opacity-60"
              disabled={clusterBusy !== null}
              title="停止中かつ lock 存在時のみ .signals を削除"
            >
              クリーンアップ
            </button>
            <button
              onClick={() => {
                setShowUnregisteredModal(true);
                void fetchUnregisteredCandidates();
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-500 disabled:opacity-60 flex items-center gap-2"
              disabled={loading || unregisteredLoading || !canSearchUnregistered}
              title={
                !canSearchUnregistered
                  ? "ログ取得可能なコンテナがないため検索できません"
                  : "クラスタ全体から未登録接続を検索して登録を支援"
              }
            >
              <Search className="h-4 w-4" />
              {unregisteredLoading ? "検索中..." : "未登録者検索"}
            </button>
            <button
              onClick={() => void refreshDashboard(true)}
              className="px-4 py-2 bg-secondary text-secondary-foreground rounded text-sm hover:bg-secondary/80"
            >
              更新
            </button>
          </div>
        </div>

        {clusterLog && (
          <details className="p-4 border rounded bg-card" open>
            <summary className="cursor-pointer select-none font-medium">
              {clusterLog.action === "up"
                ? "一括起動"
                : clusterLog.action === "down"
                  ? "一括停止"
                  : "クリーンアップ"} 実行ログ：
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
            {containers.map((c) => {
              const clusterOperationActive = isClusterBackupRestoreInProgress(c);
              const localAction = actionsInProgress[c.id] ?? undefined;
              const serverOpActive = isServerOperationInProgress(c) || localAction != null;
              const serverOpLabel = getServerOperationLabel(c, localAction);
              const cardActionLocked = localAction != null || autoPauseActionsInProgress[c.id] || clusterOperationActive;
              const clusterOperationLabel = getClusterOperationLabel(c.clusterOperationType);

              return (
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
                    c.detailedState === 'PAUSING' || c.detailedState === 'PAUSED' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' :
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

                {serverOpActive && !clusterOperationActive && (
                  <div className="space-y-2 p-3 rounded border border-yellow-500/20 bg-yellow-500/5">
                    <p className="text-xs font-semibold text-yellow-600">{serverOpLabel}...</p>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-yellow-500/20">
                      <div className="h-full w-1/3 animate-pulse rounded-full bg-yellow-500" />
                    </div>
                  </div>
                )}

                {clusterOperationActive && (
                  <div className="space-y-2 p-3 rounded border border-blue-500/20 bg-blue-500/5">
                    <p className="text-xs font-semibold text-blue-600">クラスタ{clusterOperationLabel}処理中...</p>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-blue-500/20">
                      <div className="h-full w-1/3 animate-pulse rounded-full bg-blue-500" />
                    </div>
                  </div>
                )}

                {isAdmin && (() => {
                  const autoPauseEnabled = c.autoPauseEnabled ?? true;
                  const autoPauseDisabledReason = !autoPauseFeatureEnabled
                    ? "AUTO_PAUSE_ENABLED が有効でないため操作できません"
                      : "";
                  const autoPauseDisabled = cardActionLocked || !!autoPauseDisabledReason;

                  return (
                    <div className="p-3 rounded border bg-secondary/20 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold">自動PAUSE</p>
                          <p className="text-[10px] text-muted-foreground">
                            {autoPauseDisabledReason || (autoPauseEnabled ? "有効 (lockなし)" : "禁止中 (lockあり)")}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleAutoPauseToggle(c, !autoPauseEnabled)}
                          disabled={autoPauseDisabled}
                          title={autoPauseDisabledReason || undefined}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            autoPauseEnabled ? 'bg-emerald-400' : 'bg-emerald-800'
                          } ${autoPauseDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-primary-foreground transition-transform ${
                              autoPauseEnabled ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  );
                })()}

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

                <div className="pt-2 border-t">
                  <div className="flex flex-wrap gap-2 items-center">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase mr-1">RCON Shortcuts:</span>
                    {QUICK_RCON_COMMANDS.map((q) => (
                      <button
                        key={q.command}
                        onClick={() => handleQuickRcon(c.name, q.command, q.tooltip)}
                        disabled={!canExecuteRcon(c) || cardActionLocked || c.state === 'not_created' || quickRconInProgress[`${c.name}-${q.command}`]}
                        className="w-8 h-8 flex items-center justify-center bg-secondary text-secondary-foreground rounded hover:bg-secondary/80 disabled:opacity-40 transition-colors"
                        title={q.tooltip}
                      >
                        {q.label}
                      </button>
                    ))}
                  </div>
                </div>

                {isAdmin && (
                  <>
                    <div className="grid grid-cols-3 gap-2 pt-2">
                      {c.state !== 'running' ? (
                        <button
                          onClick={() => handleAction(c.id, 'start')}
                          className="p-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 flex justify-center disabled:opacity-40"
                          title={c.state === 'not_created' ? "コンテナが作成されていません（一括起動を使用してください）" : "起動"}
                          disabled={cardActionLocked || c.state === 'not_created'}
                        >
                          <Play className="h-4 w-4" />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleAction(c.id, 'stop')}
                          className="p-2 bg-destructive text-destructive-foreground rounded hover:bg-destructive/90 flex justify-center disabled:opacity-40"
                          title="停止"
                          disabled={cardActionLocked || isContainerActionLocked(c)}
                        >
                          <Square className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleAction(c.id, 'restart')}
                        className="p-2 bg-secondary text-secondary-foreground rounded hover:bg-secondary/80 flex justify-center disabled:opacity-40"
                        title={c.state === 'not_created' ? "コンテナが作成されていません" : "再起動"}
                        disabled={cardActionLocked || isContainerActionLocked(c) || c.state === 'not_created'}
                      >
                        <RotateCcw className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          setSelectedRconContainer(c);
                          setRconOutput([]);
                        }}
                        className="p-2 bg-secondary text-secondary-foreground rounded hover:bg-secondary/80 disabled:opacity-40 flex justify-center"
                        title={
                          c.state === 'not_created'
                            ? "コンテナが作成されていません"
                            : isPausingDetailedState(c.detailedState)
                              ? "休眠状態へ遷移中です"
                              : isPausedDetailedState(c.detailedState)
                                ? "休眠状態のため RCON を実行できません"
                                : clusterOperationActive
                                  ? `クラスタ${clusterOperationLabel}処理中のため実行できません`
                                : (canExecuteRcon(c) ? "RCON コマンド" : (c.isStopping ? "停止処理中" : "RCON (サーバーが正常稼働中のみ利用可能)"))
                        }
                        disabled={!canExecuteRcon(c) || cardActionLocked || c.state === 'not_created'}
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
              );
            })}
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
      {/* Unregistered Players Modal */}
      {showUnregisteredModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-6xl bg-background rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                <div>
                  <h2 className="text-xl font-bold">未登録者検索</h2>
                  <p className="text-xs text-muted-foreground">クラスタ全体から未登録の接続を検索</p>
                </div>
              </div>
              <button 
                onClick={() => setShowUnregisteredModal(false)}
                className="p-2 hover:bg-secondary rounded-full transition-colors"
                disabled={registeringEosIds.size > 0}
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-auto p-4 min-h-0">
              {unregisteredLoading ? (
                <div className="flex items-center justify-center h-full gap-2 text-muted-foreground">
                  <Loader className="h-5 w-5 animate-spin" />
                  <span>検索中...</span>
                </div>
              ) : unregisteredError ? (
                <div className="p-4 border border-destructive rounded bg-destructive/10 text-destructive">
                  <p className="font-medium">エラー</p>
                  <p className="text-sm">{unregisteredError}</p>
                </div>
              ) : unregisteredCandidates.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  <p className="text-lg">未登録者は見つかりませんでした</p>
                  <p className="text-sm">もしくはすべて登録済みです</p>
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="w-8 px-4 py-3 text-left">
                          <input
                            type="checkbox"
                            checked={selectedCandidates.size === unregisteredCandidates.filter(c => !registeredEosIds.has(c.eosId)).length && unregisteredCandidates.length > 0}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedCandidates(new Set(
                                  unregisteredCandidates
                                    .filter(c => !registeredEosIds.has(c.eosId))
                                    .map(c => c.eosId)
                                ));
                              } else {
                                setSelectedCandidates(new Set());
                              }
                            }}
                            disabled={registeringEosIds.size > 0}
                            className="h-4 w-4"
                          />
                        </th>
                        <th className="px-4 py-3 text-left">サーバー</th>
                        <th className="px-4 py-3 text-left">プレイヤー名</th>
                        <th className="px-4 py-3 text-left">PlatformEOS ID</th>
                        <th className="px-4 py-3 text-left">IP</th>
                        <th className="px-4 py-3 text-left">接続時刻</th>
                        <th className="px-4 py-3 text-center">ステータス</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {unregisteredCandidates.map((candidate) => {
                        const isRegistered = registeredEosIds.has(candidate.eosId);
                        const isRegistering = registeringEosIds.has(candidate.eosId);
                        const isSelected = selectedCandidates.has(candidate.eosId);

                        return (
                          <tr key={candidate.eosId} className="hover:bg-muted/50 transition-colors">
                            <td className="px-4 py-3">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  const newSelected = new Set(selectedCandidates);
                                  if (e.target.checked) {
                                    newSelected.add(candidate.eosId);
                                  } else {
                                    newSelected.delete(candidate.eosId);
                                  }
                                  setSelectedCandidates(newSelected);
                                }}
                                disabled={isRegistered || isRegistering || registeringEosIds.size > 0}
                                className="h-4 w-4"
                              />
                            </td>
                            <td className="px-4 py-3 font-medium">{candidate.serverName}</td>
                            <td className="px-4 py-3">
                              {candidate.name || (
                                <span className="text-muted-foreground italic">不明</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs">
                              <div>{candidate.platform || "None"}</div>
                              <div className="font-mono text-muted-foreground">{candidate.eosId}</div>
                            </td>
                            <td className="px-4 py-3 font-mono text-sm">{candidate.ip}</td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">
                              {new Date(candidate.detectedAtUtc).toLocaleString("ja-JP")}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {isRegistering ? (
                                <Loader className="h-4 w-4 animate-spin inline text-blue-500" />
                              ) : isRegistered ? (
                                <div className="flex items-center justify-center gap-1 text-green-600">
                                  <Check className="h-4 w-4" />
                                  <span className="text-xs">済</span>
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">未登録</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="border-t p-4 flex items-center justify-between gap-2">
              <div className="text-sm text-muted-foreground">
                {selectedCandidates.size > 0 ? (
                  <span>{selectedCandidates.size} 件を選択</span>
                ) : (
                  <span>
                    {registeredEosIds.size > 0 && (
                      <span className="text-green-600">{registeredEosIds.size} 件登録済み</span>
                    )}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowUnregisteredModal(false)}
                  className="px-4 py-2 bg-secondary text-secondary-foreground rounded text-sm hover:bg-secondary/80 disabled:opacity-50"
                  disabled={registeringEosIds.size > 0}
                >
                  閉じる
                </button>
                <button
                  onClick={handleRegisterUnregistered}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
                  disabled={selectedCandidates.size === 0 || registeringEosIds.size > 0}
                >
                  {registeringEosIds.size > 0 ? (
                    <>
                      <Loader className="h-4 w-4 animate-spin" />
                      登録中...
                    </>
                  ) : (
                    "一時的な参加承認"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
