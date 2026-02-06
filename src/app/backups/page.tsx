"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import AppLayout from "@/components/AppLayout";
import { formatBytes, getApiUrl, cn } from "@/lib/utils";
import { 
  Plus, 
  Trash2, 
  Download, 
  RefreshCw, 
  Database, 
  AlertTriangle,
  Loader2
} from "lucide-react";

interface DiskUsage {
  total: number;
  used: number;
  available: number;
  backupSize: number;
  systemSize: number;
}

interface BackupFile {
  filename: string;
  size: number;
  createdAt: string;
}

export default function BackupsPage() {
  const { data: session } = useSession();
  const [diskUsage, setDiskUsage] = useState<DiskUsage | null>(null);
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [isRunning, setIsRunning] = useState<boolean>(true);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [actionFile, setActionFile] = useState<string | null>(null);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState<string | null>(null);

  const isAdmin = (session?.user as any)?.role === "admin";

  const fetchData = async () => {
    try {
      const res = await fetch(getApiUrl("/api/backups"));
      if (res.ok) {
        const data = await res.json();
        setDiskUsage(data.diskUsage);
        setBackups(data.backups);
        setIsRunning(data.isRunning);
      }
    } catch (error) {
      console.error("Failed to fetch backups:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateBackup = async () => {
    if (!confirm("バックアップを作成しますか？")) return;
    setCreating(true);
    try {
      const res = await fetch(getApiUrl("/api/backups"), { method: "POST" });
      if (res.ok) {
        await fetchData();
      } else {
        alert("バックアップの作成に失敗しました。");
      }
    } catch (error) {
      alert("バックアップの作成中にエラーが発生しました。");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (filename: string) => {
    if (!confirm(`バックアップ "${filename}" を削除しますか？`)) return;
    setActionFile(filename);
    try {
      const res = await fetch(getApiUrl(`/api/backups/${filename}`), { method: "DELETE" });
      if (res.ok) {
        await fetchData();
      } else {
        alert("削除に失敗しました。");
      }
    } catch (error) {
      alert("削除中にエラーが発生しました。");
    } finally {
      setActionFile(null);
    }
  };

  const handleRestore = async (filename: string) => {
    setShowRestoreConfirm(null);
    setActionFile(filename);
    try {
      const res = await fetch(getApiUrl(`/api/backups/${filename}/restore`), { method: "POST" });
      if (res.ok) {
        if (isRunning) {
          alert("復元プロセスを開始しました。サーバーが再起動します。");
        } else {
          alert("復元が完了しました。");
        }
        await fetchData();
      } else {
        alert("復元に失敗しました。");
      }
    } catch (error) {
      alert("復元中にエラーが発生しました。");
    } finally {
      setActionFile(null);
    }
  };

  const handleDownload = (filename: string) => {
    window.location.href = getApiUrl(`/api/backups/download/${filename}`);
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
          <p className="text-muted-foreground">データを読み込み中...</p>
        </div>
      </AppLayout>
    );
  }

  const backupPercent = diskUsage ? (diskUsage.backupSize / diskUsage.total) * 100 : 0;
  const systemPercent = diskUsage ? (diskUsage.systemSize / diskUsage.total) * 100 : 0;
  const freePercent = 100 - backupPercent - systemPercent;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">バックアップ管理</h1>
          <button
            onClick={handleCreateBackup}
            disabled={creating}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            新規バックアップ
          </button>
        </div>

        {diskUsage && (
          <div className="rounded-lg border bg-card p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Database className="h-5 w-5" /> ストレージ使用状況
              </h2>
              <div className="text-sm text-muted-foreground">
                {formatBytes(diskUsage.used)} / {formatBytes(diskUsage.total)} 使用中
              </div>
            </div>
            
            <div className="h-4 w-full overflow-hidden rounded-full bg-secondary flex">
              <div 
                className="h-full bg-blue-500 transition-all" 
                style={{ width: `${backupPercent}%` }} 
                title={`バックアップ: ${formatBytes(diskUsage.backupSize)}`}
              />
              <div 
                className="h-full bg-slate-400 transition-all" 
                style={{ width: `${systemPercent}%` }}
                title={`システム: ${formatBytes(diskUsage.systemSize)}`}
              />
            </div>

            <div className="mt-4 flex gap-6 text-sm">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-blue-500" />
                <span>バックアップ: {formatBytes(diskUsage.backupSize)} ({backupPercent.toFixed(1)}%)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-slate-400" />
                <span>システム他: {formatBytes(diskUsage.systemSize)} ({systemPercent.toFixed(1)}%)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-secondary" />
                <span>空き容量: {formatBytes(diskUsage.available)} ({freePercent.toFixed(1)}%)</span>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-lg border bg-card shadow-sm">
          <div className="p-4 border-b">
            <h2 className="font-semibold">バックアップファイル一覧</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 font-medium text-muted-foreground">
                <tr>
                  <th className="p-4">ファイル名</th>
                  <th className="p-4">作成日時</th>
                  <th className="p-4">サイズ</th>
                  <th className="p-4 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {backups.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-muted-foreground">
                      バックアップファイルが見つかりません。
                    </td>
                  </tr>
                ) : (
                  backups.map((file) => (
                    <tr key={file.filename} className="hover:bg-muted/30">
                      <td className="p-4 font-medium">{file.filename}</td>
                      <td className="p-4">
                        {new Intl.DateTimeFormat("ja-JP", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(file.createdAt))}
                      </td>
                      <td className="p-4 text-muted-foreground">{formatBytes(file.size)}</td>
                      <td className="p-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setShowRestoreConfirm(file.filename)}
                            disabled={!!actionFile}
                            className="p-2 text-amber-600 hover:bg-amber-50 rounded-md transition-colors disabled:opacity-30"
                            title="復元"
                          >
                            <RefreshCw className={cn("h-4 w-4", actionFile === file.filename && "animate-spin")} />
                          </button>
                        {isAdmin && (
                          <button
                            onClick={() => handleDownload(file.filename)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                            title="ダウンロード"
                          >
                            <Download className="h-4 w-4" />
                          </button>
                        )}
                          <button
                            onClick={() => handleDelete(file.filename)}
                            disabled={!!actionFile}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-30"
                            title="削除"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {showRestoreConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-lg bg-card p-6 shadow-xl border">
              <div className="flex items-center gap-3 text-amber-600 mb-4">
                <AlertTriangle className="h-6 w-6" />
                <h3 className="text-xl font-bold">バックアップの復元</h3>
              </div>
              <p className="mb-4 text-muted-foreground">
                バックアップ <span className="font-mono text-foreground">{showRestoreConfirm}</span> を復元しますか？
              </p>
              <div className="bg-amber-50 border border-amber-200 rounded-md p-3 mb-6 text-sm text-amber-800">
                <strong>警告:</strong> {isRunning 
                  ? "復元を開始するとサーバーは即座に停止し、現在のセーブデータは上書き（バックアップに置換）されます。この操作は取り消せません。" 
                  : "現在のセーブデータは上書き（バックアップに置換）されます。この操作は取り消せません。"}
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowRestoreConfirm(null)}
                  className="px-4 py-2 text-sm font-medium hover:bg-muted rounded-md"
                >
                  キャンセル
                </button>
                <button
                  onClick={() => handleRestore(showRestoreConfirm)}
                  className="px-4 py-2 text-sm font-medium bg-amber-600 text-white hover:bg-amber-700 rounded-md shadow-sm"
                >
                  復元を実行する
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
