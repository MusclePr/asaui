"use client";

import { useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Save, Plus, Trash2, RefreshCcw } from "lucide-react";
import { PasswordInput } from "@/components/PasswordInput";

type Settings = {
  MAX_PLAYERS: number;
  SERVER_PASSWORD: string;
  ARK_ADMIN_PASSWORD: string;
  MODS: string;
  ARK_EXTRA_OPTS: string;
  ARK_EXTRA_DASH_OPTS: string;
};

type Defaults = Settings;

type ModInfo = {
  id: string;
  name?: string;
  url?: string;
};

function parseModsCsv(csv: string): string[] {
  const trimmed = (csv || "").trim();
  if (!trimmed) return [];
  return trimmed
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^\d+$/.test(s));
}

function joinModsCsv(ids: string[]): string {
  return ids.join(",");
}

export default function ClusterSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [settings, setSettings] = useState<Settings>({
    MAX_PLAYERS: 10,
    SERVER_PASSWORD: "",
    ARK_ADMIN_PASSWORD: "",
    MODS: "",
    ARK_EXTRA_OPTS: "",
    ARK_EXTRA_DASH_OPTS: "",
  });

  const [defaults, setDefaults] = useState<Defaults>({
    MAX_PLAYERS: 10,
    SERVER_PASSWORD: "",
    ARK_ADMIN_PASSWORD: "",
    MODS: "",
    ARK_EXTRA_OPTS: "",
    ARK_EXTRA_DASH_OPTS: "",
  });

  const [mods, setMods] = useState<string[]>([]);
  const [modInfo, setModInfo] = useState<Record<string, ModInfo>>({});
  const [newModId, setNewModId] = useState("");

  const modsCsv = useMemo(() => joinModsCsv(mods), [mods]);

  const fetchSettings = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/cluster/env", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load settings");

      const s: Partial<Settings> = data?.settings || {};
      const d: Partial<Defaults> = data?.defaults || {};
      const resolvedDefaults: Defaults = {
        MAX_PLAYERS: Number.isFinite(d.MAX_PLAYERS) ? Number(d.MAX_PLAYERS) : 10,
        SERVER_PASSWORD: d.SERVER_PASSWORD ?? "",
        ARK_ADMIN_PASSWORD: d.ARK_ADMIN_PASSWORD ?? "",
        MODS: d.MODS ?? "",
        ARK_EXTRA_OPTS: d.ARK_EXTRA_OPTS ?? "",
        ARK_EXTRA_DASH_OPTS: d.ARK_EXTRA_DASH_OPTS ?? "",
      };
      const merged: Settings = {
        MAX_PLAYERS: Number.isFinite(s.MAX_PLAYERS) ? Number(s.MAX_PLAYERS) : 10,
        SERVER_PASSWORD: s.SERVER_PASSWORD ?? "",
        ARK_ADMIN_PASSWORD: s.ARK_ADMIN_PASSWORD ?? "",
        MODS: s.MODS ?? "",
        ARK_EXTRA_OPTS: s.ARK_EXTRA_OPTS ?? "",
        ARK_EXTRA_DASH_OPTS: s.ARK_EXTRA_DASH_OPTS ?? "",
      };

      setDefaults(resolvedDefaults);
      setSettings(merged);
      const ids = parseModsCsv(merged.MODS);
      setMods(ids);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const fetchModInfo = async (id: string) => {
    if (modInfo[id]) return;
    try {
      const res = await fetch(`/api/curseforge/mod/${id}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "lookup failed");
      setModInfo((prev) => ({
        ...prev,
        [id]: {
          id,
          name: data?.name,
          url: data?.url,
        },
      }));
    } catch {
      setModInfo((prev) => ({
        ...prev,
        [id]: { id },
      }));
    }
  };

  useEffect(() => {
    fetchSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (async () => {
      for (const id of mods) {
        // sequential to avoid API burst
        // eslint-disable-next-line no-await-in-loop
        await fetchModInfo(id);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modsCsv]);

  const validatePassword = (value: string, label: string): string | null => {
    if (value.length > 32) return `${label} は 32 文字以内で指定してください`;
    if (/[\s\r\n#'"]/u.test(value)) {
      return `${label} に空白/改行/#/'/\" は使用できません（.env破壊防止）`;
    }
    return null;
  };

  const validateMods = (value: string): string | null => {
    if (!value) return null;
    if (!/^\d+(,\d+)*$/.test(value)) return "MODS は数字IDをカンマ区切りで指定してください";
    return null;
  };

  const validateExtra = (value: string, label: string): string | null => {
    if (/[\r\n#'"]/u.test(value)) {
      return `${label} に改行/#/'/\" は使用できません（.env破壊防止）`;
    }
    return null;
  };

  const clientValidationError = useMemo(() => {
    if (settings.MAX_PLAYERS < 1 || settings.MAX_PLAYERS > 100) return "MAX_PLAYERS は 1〜100 で指定してください";
    const p1 = validatePassword(settings.SERVER_PASSWORD, "SERVER_PASSWORD");
    if (p1) return p1;
    const p2 = validatePassword(settings.ARK_ADMIN_PASSWORD, "ARK_ADMIN_PASSWORD");
    if (p2) return p2;
    const m = validateMods(modsCsv);
    if (m) return m;
    const e1 = validateExtra(settings.ARK_EXTRA_OPTS, "ARK_EXTRA_OPTS");
    if (e1) return e1;
    const e2 = validateExtra(settings.ARK_EXTRA_DASH_OPTS, "ARK_EXTRA_DASH_OPTS");
    if (e2) return e2;
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, modsCsv]);

  const save = async () => {
    setError(null);
    setMessage(null);
    const v = clientValidationError;
    if (v) {
      setError(v);
      return;
    }

    setSaving(true);
    try {
      const body: Settings = {
        ...settings,
        MODS: modsCsv,
      };
      const res = await fetch("/api/cluster/env", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to save");
      setMessage("保存しました（.env.effective を再生成済み）");
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  const addMod = async () => {
    setError(null);
    const id = newModId.trim();
    if (!/^\d+$/.test(id)) {
      setError("MOD ID は数字で入力してください");
      return;
    }
    if (mods.includes(id)) {
      setNewModId("");
      return;
    }
    setMods((prev) => [...prev, id]);
    setNewModId("");
    await fetchModInfo(id);
  };

  const removeMod = (id: string) => {
    setMods((prev) => prev.filter((x) => x !== id));
  };

  const resetMaxPlayers = () => {
    setSettings((prev) => ({
      ...prev,
      MAX_PLAYERS: defaults.MAX_PLAYERS,
    }));
  };

  const resetPassword = (key: "SERVER_PASSWORD" | "ARK_ADMIN_PASSWORD") => {
    setSettings((prev) => ({
      ...prev,
      [key]: defaults[key],
    }));
  };

  const resetMods = () => {
    const ids = parseModsCsv(defaults.MODS);
    setMods(ids);
  };

  const resetExtra = (key: "ARK_EXTRA_OPTS" | "ARK_EXTRA_DASH_OPTS") => {
    setSettings((prev) => ({
      ...prev,
      [key]: defaults[key],
    }));
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-bold tracking-tight">クラスタ設定</h2>
          <div className="flex gap-2">
            <button
              onClick={fetchSettings}
              className="px-4 py-2 bg-secondary text-secondary-foreground rounded text-sm hover:bg-secondary/80 flex items-center gap-2"
              disabled={loading}
            >
              <RefreshCcw className="h-4 w-4" /> 再読込
            </button>
            <button
              onClick={save}
              className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90 flex items-center gap-2"
              disabled={saving || loading}
            >
              <Save className="h-4 w-4" /> 保存
            </button>
          </div>
        </div>

        {loading ? (
          <div>Loading...</div>
        ) : (
          <div className="space-y-6">
            {(error || message) && (
              <div
                className={`p-4 border rounded ${error ? "border-destructive text-destructive" : "border-green-500 text-green-600"}`}
              >
                {error || message}
              </div>
            )}

            <div className="p-6 bg-card border rounded-lg space-y-4">
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-lg font-semibold">MAX_PLAYERS</h3>
                <button
                  onClick={resetMaxPlayers}
                  className="px-3 py-1 rounded bg-secondary text-secondary-foreground hover:bg-secondary/80 text-sm"
                  type="button"
                >
                  デフォルトに戻す
                </button>
              </div>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min={1}
                  max={100}
                  value={settings.MAX_PLAYERS}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      MAX_PLAYERS: Number(e.target.value),
                    }))
                  }
                  className="flex-1"
                />
                <div className="w-16 text-right font-mono">{settings.MAX_PLAYERS}</div>
              </div>
              <div className="text-xs text-muted-foreground">
                デフォルト: <span className="font-mono">{defaults.MAX_PLAYERS}</span>
              </div>
            </div>

            <div className="p-6 bg-card border rounded-lg space-y-4">
              <h3 className="text-lg font-semibold">パスワード</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-sm font-medium">SERVER_PASSWORD</label>
                    <button
                      onClick={() => resetPassword("SERVER_PASSWORD")}
                      className="px-2 py-1 rounded bg-secondary text-secondary-foreground hover:bg-secondary/80 text-xs"
                      type="button"
                    >
                      デフォルトに戻す
                    </button>
                  </div>
                  <PasswordInput
                    value={settings.SERVER_PASSWORD}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        SERVER_PASSWORD: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 border rounded bg-background"
                    maxLength={32}
                    placeholder="（空なら未設定）"
                  />
                  <p className="text-xs text-muted-foreground">空白/改行/#/'/\" は禁止（.env破壊防止）</p>
                  <p className="text-xs text-muted-foreground">
                    デフォルト: <span className="font-mono">{defaults.SERVER_PASSWORD || "(empty)"}</span>
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-sm font-medium">ARK_ADMIN_PASSWORD</label>
                    <button
                      onClick={() => resetPassword("ARK_ADMIN_PASSWORD")}
                      className="px-2 py-1 rounded bg-secondary text-secondary-foreground hover:bg-secondary/80 text-xs"
                      type="button"
                    >
                      デフォルトに戻す
                    </button>
                  </div>
                  <PasswordInput
                    value={settings.ARK_ADMIN_PASSWORD}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        ARK_ADMIN_PASSWORD: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 border rounded bg-background"
                    maxLength={32}
                    placeholder="（空なら未設定）"
                  />
                  <p className="text-xs text-muted-foreground">空白/改行/#/'/\" は禁止（.env破壊防止）</p>
                  <p className="text-xs text-muted-foreground">
                    デフォルト: <span className="font-mono">{defaults.ARK_ADMIN_PASSWORD || "(empty)"}</span>
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 bg-card border rounded-lg space-y-4">
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-lg font-semibold">MODS</h3>
                <button
                  onClick={resetMods}
                  className="px-3 py-1 rounded bg-secondary text-secondary-foreground hover:bg-secondary/80 text-sm"
                  type="button"
                >
                  デフォルトに戻す
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b">
                      <th className="py-2 pr-4">ID</th>
                      <th className="py-2 pr-4">名前</th>
                      <th className="py-2">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mods.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="py-3 text-muted-foreground">
                          未設定
                        </td>
                      </tr>
                    ) : (
                      mods.map((id) => (
                        <tr key={id} className="border-b">
                          <td className="py-2 pr-4 font-mono">{id}</td>
                          <td className="py-2 pr-4">
                            {modInfo[id]?.url ? (
                              <a
                                className="text-primary hover:underline"
                                href={modInfo[id]?.url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {modInfo[id]?.name || modInfo[id]?.url}
                              </a>
                            ) : (
                              modInfo[id]?.name || ""
                            )}
                          </td>
                          <td className="py-2">
                            <button
                              onClick={() => removeMod(id)}
                              className="px-3 py-1 rounded bg-secondary text-secondary-foreground hover:bg-secondary/80 inline-flex items-center gap-2"
                            >
                              <Trash2 className="h-4 w-4" /> 削除
                            </button>
                          </td>
                        </tr>
                      ))
                    )}

                    <tr>
                      <td className="py-2 pr-4">
                        <input
                          value={newModId}
                          onChange={(e) => setNewModId(e.target.value)}
                          placeholder="MOD ID"
                          className="w-32 px-2 py-1 border rounded bg-background font-mono"
                        />
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        追加すると CurseForge から名前/URL を補完します（失敗時は空欄）
                      </td>
                      <td className="py-2">
                        <button
                          onClick={addMod}
                          className="px-3 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-2"
                        >
                          <Plus className="h-4 w-4" /> 追加
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="text-xs text-muted-foreground">
                保存時の内部データ: <span className="font-mono">{modsCsv || "(empty)"}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                デフォルト: <span className="font-mono">{defaults.MODS || "(empty)"}</span>
              </div>
            </div>

            <div className="p-6 bg-card border rounded-lg space-y-4">
              <h3 className="text-lg font-semibold">追加オプション</h3>

              <details className="border rounded p-4 bg-background">
                <summary className="cursor-pointer select-none font-medium">
                  ARK_EXTRA_OPTS（クリックで展開）
                </summary>
                <div className="pt-4 space-y-2">
                  <div className="flex items-center justify-end">
                    <button
                      onClick={() => resetExtra("ARK_EXTRA_OPTS")}
                      className="px-2 py-1 rounded bg-secondary text-secondary-foreground hover:bg-secondary/80 text-xs"
                      type="button"
                    >
                      デフォルトに戻す
                    </button>
                  </div>
                  <textarea
                    value={settings.ARK_EXTRA_OPTS}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        ARK_EXTRA_OPTS: e.target.value,
                      }))
                    }
                    className="w-full min-h-[140px] px-3 py-2 border rounded bg-background whitespace-pre-wrap break-words"
                    placeholder="?ServerCrosshair=true?..."
                  />
                  <p className="text-xs text-muted-foreground">改行/#/'/\" は禁止（.env破壊防止）</p>
                  <p className="text-xs text-muted-foreground">
                    デフォルト: <span className="font-mono">{defaults.ARK_EXTRA_OPTS || "(empty)"}</span>
                  </p>
                </div>
              </details>

              <details className="border rounded p-4 bg-background">
                <summary className="cursor-pointer select-none font-medium">
                  ARK_EXTRA_DASH_OPTS（クリックで展開）
                </summary>
                <div className="pt-4 space-y-2">
                  <div className="flex items-center justify-end">
                    <button
                      onClick={() => resetExtra("ARK_EXTRA_DASH_OPTS")}
                      className="px-2 py-1 rounded bg-secondary text-secondary-foreground hover:bg-secondary/80 text-xs"
                      type="button"
                    >
                      デフォルトに戻す
                    </button>
                  </div>
                  <textarea
                    value={settings.ARK_EXTRA_DASH_OPTS}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        ARK_EXTRA_DASH_OPTS: e.target.value,
                      }))
                    }
                    className="w-full min-h-[140px] px-3 py-2 border rounded bg-background whitespace-pre-wrap break-words"
                    placeholder="-ForceAllowCaveFlyers ..."
                  />
                  <p className="text-xs text-muted-foreground">改行/#/'/\" は禁止（.env破壊防止）</p>
                  <p className="text-xs text-muted-foreground">
                    デフォルト: <span className="font-mono">{defaults.ARK_EXTRA_DASH_OPTS || "(empty)"}</span>
                  </p>
                </div>
              </details>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
