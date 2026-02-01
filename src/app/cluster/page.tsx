"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import AppLayout from "@/components/AppLayout";
import { Save, Plus, Trash2, RefreshCcw, ArrowUp, ArrowDown, Power, PowerOff } from "lucide-react";
import { PasswordInput } from "@/components/PasswordInput";
import { getApiUrl } from "@/lib/utils";

type Settings = {
  MAX_PLAYERS: number;
  SERVER_PASSWORD: string;
  ARK_ADMIN_PASSWORD: string;
  CLUSTER_ID: string;
  MODS: string;
  ALL_MODS: string;
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
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [settings, setSettings] = useState<Settings>({
    MAX_PLAYERS: 10,
    SERVER_PASSWORD: "",
    ARK_ADMIN_PASSWORD: "",
    CLUSTER_ID: "",
    MODS: "",
    ALL_MODS: "",
    ARK_EXTRA_OPTS: "",
    ARK_EXTRA_DASH_OPTS: "",
  });

  const [defaults, setDefaults] = useState<Defaults>({
    MAX_PLAYERS: 10,
    SERVER_PASSWORD: "",
    ARK_ADMIN_PASSWORD: "",
    CLUSTER_ID: "",
    MODS: "",
    ALL_MODS: "",
    ARK_EXTRA_OPTS: "",
    ARK_EXTRA_DASH_OPTS: "",
  });

  const [allModIds, setAllModIds] = useState<string[]>([]);
  const [enabledModIds, setEnabledModIds] = useState<string[]>([]);
  const [modInfo, setModInfo] = useState<Record<string, ModInfo>>({});
  const [newModId, setNewModId] = useState("");

  const modsCsv = useMemo(() => {
    // MODS should follow the order in ALL_MODS but only include enabled ones
    return allModIds.filter((id) => enabledModIds.includes(id)).join(",");
  }, [allModIds, enabledModIds]);

  const allModsCsv = useMemo(() => joinModsCsv(allModIds), [allModIds]);

  const fetchSettings = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(getApiUrl("/api/cluster/env"), { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load settings");

      const s: Partial<Settings> = data?.settings || {};
      const d: Partial<Defaults> = data?.defaults || {};
      const resolvedDefaults: Defaults = {
        MAX_PLAYERS: Number.isFinite(d.MAX_PLAYERS) ? Number(d.MAX_PLAYERS) : 10,
        SERVER_PASSWORD: d.SERVER_PASSWORD ?? "",
        ARK_ADMIN_PASSWORD: d.ARK_ADMIN_PASSWORD ?? "",
        CLUSTER_ID: d.CLUSTER_ID ?? "",
        MODS: d.MODS ?? "",
        ALL_MODS: d.ALL_MODS ?? "",
        ARK_EXTRA_OPTS: d.ARK_EXTRA_OPTS ?? "",
        ARK_EXTRA_DASH_OPTS: d.ARK_EXTRA_DASH_OPTS ?? "",
      };
      const merged: Settings = {
        MAX_PLAYERS: Number.isFinite(s.MAX_PLAYERS) ? Number(s.MAX_PLAYERS) : 10,
        SERVER_PASSWORD: s.SERVER_PASSWORD ?? "",
        ARK_ADMIN_PASSWORD: s.ARK_ADMIN_PASSWORD ?? "",
        CLUSTER_ID: s.CLUSTER_ID ?? "",
        MODS: s.MODS ?? "",
        ALL_MODS: s.ALL_MODS ?? "",
        ARK_EXTRA_OPTS: s.ARK_EXTRA_OPTS ?? "",
        ARK_EXTRA_DASH_OPTS: s.ARK_EXTRA_DASH_OPTS ?? "",
      };

      setDefaults(resolvedDefaults);
      setSettings(merged);

      const loadedAll = parseModsCsv(merged.ALL_MODS);
      const loadedEnabled = parseModsCsv(merged.MODS);

      // Gracefully handle legacy or manual edits
      const mergedAll = Array.from(new Set([...loadedAll, ...loadedEnabled]));
      setAllModIds(mergedAll);
      setEnabledModIds(loadedEnabled);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const fetchModInfo = async (id: string) => {
    if (modInfo[id]) return;
    try {
      const res = await fetch(getApiUrl(`/api/curseforge/mod/${id}`), { cache: "no-store" });
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
      for (const id of allModIds) {
        // sequential to avoid API burst
        // eslint-disable-next-line no-await-in-loop
        await fetchModInfo(id);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allModsCsv]);

  const validatePassword = (value: string, label: string): string | null => {
    if (value.length > 32) return `${label} は 32 文字以内で指定してください`;
    if (/[\s\r\n#'"]/u.test(value)) {
      return `${label} に空白/改行/#/'/\" は使用できません（.env破壊防止）`;
    }
    return null;
  };

  const validateMods = (value: string, label: string): string | null => {
    if (!value) return null;
    if (!/^\d+(,\d+)*$/.test(value)) return `${label} は数字IDをカンマ区切りで指定してください`;
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
    const p3 = validatePassword(settings.CLUSTER_ID, "CLUSTER_ID");
    if (p3) return p3;
    const m1 = validateMods(modsCsv, "MODS");
    if (m1) return m1;
    const m2 = validateMods(allModsCsv, "ALL_MODS");
    if (m2) return m2;
    const e1 = validateExtra(settings.ARK_EXTRA_OPTS, "ARK_EXTRA_OPTS");
    if (e1) return e1;
    const e2 = validateExtra(settings.ARK_EXTRA_DASH_OPTS, "ARK_EXTRA_DASH_OPTS");
    if (e2) return e2;
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, modsCsv, allModsCsv]);

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
        ALL_MODS: allModsCsv,
      };
      const res = await fetch(getApiUrl("/api/cluster/env"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to save");
      setMessage("保存しました");
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
    if (allModIds.includes(id)) {
      setNewModId("");
      return;
    }
    setAllModIds((prev) => [...prev, id]);
    setEnabledModIds((prev) => [...prev, id]);
    setNewModId("");
    await fetchModInfo(id);
  };

  const removeMod = (id: string) => {
    setAllModIds((prev) => prev.filter((x) => x !== id));
    setEnabledModIds((prev) => prev.filter((x) => x !== id));
  };

  const toggleMod = (id: string) => {
    if (enabledModIds.includes(id)) {
      setEnabledModIds((prev) => prev.filter((x) => x !== id));
    } else {
      setEnabledModIds((prev) => [...prev, id]);
    }
  };

  const moveMod = (id: string, direction: "up" | "down") => {
    const list = [...allModIds];
    const idx = list.indexOf(id);
    if (idx === -1) return;
    if (direction === "up" && idx > 0) {
      [list[idx], list[idx - 1]] = [list[idx - 1], list[idx]];
    } else if (direction === "down" && idx < list.length - 1) {
      [list[idx], list[idx + 1]] = [list[idx + 1], list[idx]];
    }
    setAllModIds(list);
  };

  const resetMaxPlayers = () => {
    setSettings((prev) => ({
      ...prev,
      MAX_PLAYERS: defaults.MAX_PLAYERS,
    }));
  };

  const resetStringField = (key: "SERVER_PASSWORD" | "ARK_ADMIN_PASSWORD" | "CLUSTER_ID") => {
    setSettings((prev) => ({
      ...prev,
      [key]: defaults[key],
    }));
  };

  const resetMods = () => {
    const dAll = parseModsCsv(defaults.ALL_MODS);
    const dEnabled = parseModsCsv(defaults.MODS);
    setAllModIds(Array.from(new Set([...dAll, ...dEnabled])));
    setEnabledModIds(dEnabled);
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

            {isAdmin && (
              <div className="p-6 bg-card border rounded-lg space-y-4">
                <h3 className="text-lg font-semibold">パスワード</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-sm font-medium">SERVER_PASSWORD</label>
                      <button
                        onClick={() => resetStringField("SERVER_PASSWORD")}
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
                        onClick={() => resetStringField("ARK_ADMIN_PASSWORD")}
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
            )}

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
                      <th className="py-2 pr-4 w-10 text-center">状態</th>
                      <th className="py-2 pr-4">ID</th>
                      <th className="py-2 pr-4">名前</th>
                      <th className="py-2">順序 / 操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allModIds.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-3 text-muted-foreground">
                          未設定
                        </td>
                      </tr>
                    ) : (
                      allModIds.map((id, idx) => {
                        const isEnabled = enabledModIds.includes(id);
                        return (
                          <tr key={id} className={`border-b ${!isEnabled ? "opacity-60 grayscale" : "bg-primary/5"}`}>
                            <td className="py-2 pr-4 text-center">
                              <button
                                onClick={() => toggleMod(id)}
                                className={isEnabled ? "text-primary hover:text-primary/70" : "text-muted-foreground hover:text-primary"}
                                title={isEnabled ? "無効化" : "有効化"}
                              >
                                {isEnabled ? <Power className="h-4 w-4" /> : <PowerOff className="h-4 w-4" />}
                              </button>
                            </td>
                            <td className="py-2 pr-4 font-mono">{id}</td>
                            <td className={`py-2 pr-4 ${!isEnabled ? "line-through" : ""}`}>
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
                                modInfo[id]?.name || id
                              )}
                            </td>
                            <td className="py-2 flex items-center gap-1">
                              <button
                                onClick={() => moveMod(id, "up")}
                                disabled={idx === 0}
                                className="p-1 rounded hover:bg-secondary disabled:opacity-30"
                              >
                                <ArrowUp className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => moveMod(id, "down")}
                                disabled={idx === allModIds.length - 1}
                                className="p-1 rounded hover:bg-secondary disabled:opacity-30"
                              >
                                <ArrowDown className="h-4 w-4" />
                              </button>
                              <div className="w-2" />
                              <button
                                onClick={() => removeMod(id)}
                                className="px-3 py-1 rounded bg-secondary text-secondary-foreground hover:bg-secondary/80 inline-flex items-center gap-2"
                              >
                                <Trash2 className="h-4 w-4" /> 削除
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}

                    <tr>
                      <td className="py-2 pr-4" />
                      <td className="py-2 pr-4">
                        <input
                          value={newModId}
                          onChange={(e) => setNewModId(e.target.value)}
                          placeholder="MOD ID"
                          className="w-32 px-2 py-1 border rounded bg-background font-mono"
                          onKeyDown={(e) => e.key === "Enter" && addMod()}
                        />
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        追加すると CurseForge から名前/URL を補完します
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
              <div className="text-xs text-muted-foreground flex flex-col gap-1">
                <div>
                  保存時の内部データ (MODS): <span className="font-mono">{modsCsv || "(empty)"}</span>
                </div>
                <div>
                  保存時の内部データ (ALL_MODS): <span className="font-mono">{allModsCsv || "(empty)"}</span>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                デフォルト: <span className="font-mono">{defaults.MODS || "(empty)"}</span>
              </div>
            </div>

            {isAdmin && (
              <div className="p-6 bg-card border rounded-lg space-y-4">
                <h3 className="text-lg font-semibold">高度なオプション</h3>

                <details className="border rounded p-4 bg-background">
                  <summary className="cursor-pointer select-none font-medium">
                    CLUSTER_ID（クリックで展開）
                  </summary>
                  <div className="pt-4 space-y-2">
                    <div className="flex items-center justify-end">
                      <button
                        onClick={() => resetStringField("CLUSTER_ID")}
                        className="px-2 py-1 rounded bg-secondary text-secondary-foreground hover:bg-secondary/80 text-xs"
                        type="button"
                      >
                        デフォルトに戻す
                      </button>
                    </div>
                    <input
                      type="text"
                      value={settings.CLUSTER_ID}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          CLUSTER_ID: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 border rounded bg-background font-mono"
                      maxLength={32}
                      placeholder="（空なら未設定）"
                    />
                    <p className="text-xs text-muted-foreground">クラスタ間同期（転送）の識別に必要です。</p>
                    <p className="text-xs text-muted-foreground">空白/改行/#/'/\" は禁止（.env破壊防止）</p>
                    <p className="text-xs text-muted-foreground">
                      デフォルト: <span className="font-mono">{defaults.CLUSTER_ID || "(empty)"}</span>
                    </p>
                  </div>
                </details>

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
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
