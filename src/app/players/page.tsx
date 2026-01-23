"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { User, ShieldCheck, ShieldAlert, Search, RefreshCw, ShieldOff, Info, Trash2 } from "lucide-react";
import { PlayerInfo } from "@/types";

export default function PlayersPage() {
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [registerName, setRegisterName] = useState("");
  const [registerEosId, setRegisterEosId] = useState("");
  const [registerWhitelist, setRegisterWhitelist] = useState(true);
  const [registerBypass, setRegisterBypass] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);

  const fetchPlayers = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/players/scan");
      const data = await res.json();
      setPlayers(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlayers();
  }, []);

  const toggleWhitelist = async (eosId: string) => {
    try {
      const player = players.find(p => p.eosId === eosId);
      const res = await fetch("/api/players/whitelist", {
        method: player?.isWhitelisted ? "DELETE" : "POST",
        body: JSON.stringify({ eosId }),
      });
      if (res.ok) fetchPlayers();
    } catch (err) {
      console.error(err);
    }
  };

  const toggleBypass = async (eosId: string) => {
    try {
      const player = players.find(p => p.eosId === eosId);
      const res = await fetch("/api/players/bypass", {
        method: player?.isBypassed ? "DELETE" : "POST",
        body: JSON.stringify({ eosId }),
      });
      if (res.ok) fetchPlayers();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSelectPlayer = (player: PlayerInfo) => {
    setRegisterEosId(player.eosId);
    setRegisterName(player.displayName || player.name || "");
    setRegisterWhitelist(player.isWhitelisted);
    setRegisterBypass(player.isBypassed);
  };

  const deletePlayer = async (eosId: string) => {
    if (!confirm("このプレイヤーを削除しますか？\nホワイトリストとバイパスリストも解除されます。")) return;
    try {
      const res = await fetch("/api/players/delete", {
        method: "POST",
        body: JSON.stringify({ eosId }),
      });
      if (res.ok) fetchPlayers();
    } catch (err) {
      console.error(err);
    }
  };

  const isValidEosId = (value: string) => /^[a-zA-Z0-9]{32}$/.test(value);

  const canRegister = isValidEosId(registerEosId) && (registerWhitelist || registerBypass) && !registerLoading;

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterError(null);

    const eosId = registerEosId.trim();
    if (!isValidEosId(eosId)) {
      setRegisterError("EOS ID は 32 文字の英数字で入力してください。");
      return;
    }
    if (!registerWhitelist && !registerBypass) {
      setRegisterError("ホワイトリストまたはバイパスリストのいずれかを選択してください。");
      return;
    }

    setRegisterLoading(true);
    try {
      const res = await fetch("/api/players/register", {
        method: "POST",
        body: JSON.stringify({
          eosId,
          displayName: registerName.trim(),
          whitelist: registerWhitelist,
          bypass: registerBypass,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRegisterError(data?.error || "登録に失敗しました。");
      } else {
        setRegisterName("");
        setRegisterEosId("");
        setRegisterWhitelist(true);
        setRegisterBypass(false);
        fetchPlayers();
      }
    } catch (err) {
      console.error(err);
      setRegisterError("ネットワークエラーが発生しました。");
    } finally {
      setRegisterLoading(false);
    }
  };

  const normalizedSearch = search.toLowerCase();
  const filteredPlayers = players.filter(p => {
    const displayName = (p.displayName ?? p.name).toLowerCase();
    return displayName.includes(normalizedSearch) || p.name.toLowerCase().includes(normalizedSearch) || p.eosId.includes(search);
  });

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-bold tracking-tight">プレイヤー管理</h2>
          <button 
            onClick={fetchPlayers}
            className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded text-sm hover:bg-secondary/80"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> 再スキャン
          </button>
        </div>

        <form onSubmit={handleRegister} className="bg-card border rounded-lg p-4 space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Info className="h-4 w-4" />
            <p>バイパスリストは即時反映されますが、ホワイトリストはサーバーの再起動が必要です。</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">表示名</label>
              <input
                type="text"
                placeholder="任意 (表示名として保存)"
                className="w-full px-3 py-2 bg-card border rounded-md"
                value={registerName}
                onChange={(e) => setRegisterName(e.target.value)}
                disabled={registerLoading}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">EOS ID</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="32文字の英数字"
                className="w-full px-3 py-2 bg-card border rounded-md"
                value={registerEosId}
                onChange={(e) => setRegisterEosId(e.target.value)}
                disabled={registerLoading}
              />
              {registerEosId.length > 0 && !isValidEosId(registerEosId) && (
                <p className="text-xs text-destructive">32 文字の英数字のみ入力できます。</p>
              )}
              <p className="text-xs text-muted-foreground">例: 00023e876b964cd3b6f01a9d7040d038</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={registerWhitelist}
                onChange={(e) => setRegisterWhitelist(e.target.checked)}
                disabled={registerLoading}
              />
              ホワイトリスト
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={registerBypass}
                onChange={(e) => setRegisterBypass(e.target.checked)}
                disabled={registerLoading}
              />
              バイパスリスト
            </label>
          </div>

          {registerError && (
            <div className="text-sm text-destructive">{registerError}</div>
          )}

          <div className="flex items-center justify-end">
            <button
              type="submit"
              disabled={!canRegister}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm disabled:opacity-50"
            >
              登録
            </button>
          </div>
        </form>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="表示名またはEOS IDで検索..."
            className="w-full pl-10 pr-4 py-2 bg-card border rounded-md"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="bg-card border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-3 text-left">表示名</th>
                <th className="px-4 py-3 text-left">EOS ID</th>
                <th className="px-4 py-3 text-left">最終ログイン</th>
                <th className="px-4 py-3 text-right">ホワイトリスト</th>
                <th className="px-4 py-3 text-right">バイパスリスト</th>
                <th className="px-4 py-3 text-right">削除</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredPlayers.map((p) => (
                <tr key={p.eosId} className="hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3 font-medium">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <button
                        type="button"
                        onClick={() => handleSelectPlayer(p)}
                        className="text-left hover:underline"
                        title="登録パネルに反映"
                      >
                        {p.displayName || p.name}
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground font-mono">{p.eosId}</td>
                  <td className="px-4 py-3 text-muted-foreground">{p.lastLogin}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => toggleWhitelist(p.eosId)}
                      className={`p-2 rounded-md ${
                        p.isWhitelisted 
                          ? 'text-green-500 hover:bg-green-500/10' 
                          : 'text-muted-foreground hover:bg-red-500/10 hover:text-red-500'
                      }`}
                      title={p.isWhitelisted ? "Remove from Whitelist" : "Add to Whitelist"}
                    >
                      {p.isWhitelisted ? <ShieldCheck className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5" />}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => toggleBypass(p.eosId)}
                      className={`p-2 rounded-md ${
                        p.isBypassed
                          ? 'text-amber-500 hover:bg-amber-500/10'
                          : 'text-muted-foreground hover:bg-red-500/10 hover:text-red-500'
                      }`}
                      title={p.isBypassed ? "Remove from Bypass" : "Add to Bypass"}
                    >
                      {p.isBypassed ? <ShieldOff className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5" />}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => deletePlayer(p.eosId)}
                      className="p-2 rounded-md text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
                      title="削除"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredPlayers.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    プレイヤーが見つかりませんでした。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}
