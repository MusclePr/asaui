"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { User, ShieldCheck, ShieldAlert, Search, RefreshCw } from "lucide-react";
import { PlayerInfo } from "@/types";

export default function PlayersPage() {
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

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

  const toggleWhitelist = async (steamId: string) => {
    try {
      const player = players.find(p => p.steamId === steamId);
      const res = await fetch("/api/players/whitelist", {
        method: player?.isWhitelisted ? "DELETE" : "POST",
        body: JSON.stringify({ steamId }),
      });
      if (res.ok) fetchPlayers();
    } catch (err) {
      console.error(err);
    }
  };

  const filteredPlayers = players.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    p.steamId.includes(search)
  );

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

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="名前またはSteamIDで検索..."
            className="w-full pl-10 pr-4 py-2 bg-card border rounded-md"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="bg-card border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-3 text-left">名前</th>
                <th className="px-4 py-3 text-left">SteamID / UUID</th>
                <th className="px-4 py-3 text-left">最終ログイン</th>
                <th className="px-4 py-3 text-right">ホワイトリスト</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredPlayers.map((p) => (
                <tr key={p.steamId} className="hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3 font-medium flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    {p.name}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground font-mono">{p.steamId}</td>
                  <td className="px-4 py-3 text-muted-foreground">{p.lastLogin}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => toggleWhitelist(p.steamId)}
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
                </tr>
              ))}
              {filteredPlayers.length === 0 && !loading && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
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
