"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import Editor from "@monaco-editor/react";
import AppLayout from "@/components/AppLayout";
import { Save, Plus, Trash2, RefreshCcw, ArrowUp, ArrowDown, Power, PowerOff, ShieldAlert, ChevronDown, ChevronRight, Eye, EyeOff, Zap, Settings2, Info, Users } from "lucide-react";
import { PasswordInput } from "@/components/PasswordInput";
import { getApiUrl } from "@/lib/utils";
import { ASA_MAP_NAMES } from "@/lib/maps";
import { ContainerStatus } from "@/types";

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

type EnvConfig = Record<string, string>;

type DynamicConfig = Record<string, string>;

const DYNAMIC_CONFIG_DESCRIPTIONS: Record<string, string> = {
  BabyCuddleIntervalMultiplier: '赤ちゃんのケア（刷り込み）の間隔を調整します。値が小さいほど間隔が短くなります。',
  BabyImprintAmountMultiplier: '1回のケアで上昇する刷り込み値の倍率を調整します。',
  BabyMatureSpeedMultiplier: '赤ちゃんの成長速度を調整します。値が大きいほど早く成長します。',
  DynamicColorset: '使用する動的なカラーセットを指定します。',
  DynamicColorsetChanceOverride: '動的なカラーセットが適用される確率をオーバーライドします。',
  EggHatchSpeedMultiplier: '卵の孵化速度を調整します。値が大きいほど早く孵化します。',
  HarvestAmountMultiplier: '資源の採取量を調整します。',
  HexagonRewardMultiplier: 'ヘキサゴン報酬の倍率を調整します。',
  MatingIntervalMultiplier: '交配の間隔を調整します。値が小さいほど次に交配できるようになるまでの時間が短くなります。',
  XPMultiplier: '獲得経験値の倍率を調整します。',
  TamingSpeedMultiplier: 'テイム速度の倍率を調整します。',
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
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [needsApply, setNeedsApply] = useState(false);
  const [simpleMode, setSimpleMode] = useState(true);
  const [activeTab, setActiveTab] = useState<"static" | "dynamic" | "ini-gus" | "ini-game">("static");

  const [containers, setContainers] = useState<ContainerStatus[]>([]);

  const anyServerRunning = useMemo(() => {
    return containers.some(c => c.state === "running");
  }, [containers]);

  // Common Settings (formerly .cluster, now .common.env)
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

  // Cluster/Infra Settings (.env)
  const [envConfig, setEnvConfig] = useState<EnvConfig>({});

  // Dynamic Settings (dynamicconfig.ini)
  const [dynamicConfig, setDynamicConfig] = useState<DynamicConfig>({});
  const [originalDynamicConfig, setOriginalDynamicConfig] = useState<DynamicConfig>({});
  const [savingDynamic, setSavingDynamic] = useState(false);

  // Raw INI States
  const [iniContent, setIniContent] = useState("");
  const [loadingIni, setLoadingIni] = useState(false);
  const [savingIni, setSavingIni] = useState(false);

  const [allModIds, setAllModIds] = useState<string[]>([]);
  const [enabledModIds, setEnabledModIds] = useState<string[]>([]);
  const [modInfo, setModInfo] = useState<Record<string, ModInfo>>({});
  const [newModId, setNewModId] = useState("");

  const modsCsv = useMemo(() => {
    return allModIds.filter((id) => enabledModIds.includes(id)).join(",");
  }, [allModIds, enabledModIds]);

  const allModsCsv = useMemo(() => joinModsCsv(allModIds), [allModIds]);

  const fetchIni = async (filename: "GameUserSettings.ini" | "Game.ini") => {
    setLoadingIni(true);
    setError(null);
    try {
      const res = await fetch(getApiUrl(`/api/cluster/config-file/${filename}`), { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `${filename} の読み込みに失敗しました`);
      setIniContent(data.content || "");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingIni(false);
    }
  };

  const saveIni = async (filename: "GameUserSettings.ini" | "Game.ini") => {
    if (anyServerRunning) {
      setError("サーバー起動中は保存できません");
      return;
    }
    setSavingIni(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(getApiUrl(`/api/cluster/config-file/${filename}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: iniContent }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `${filename} の保存に失敗しました`);
      setMessage(data.message);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSavingIni(false);
    }
  };

  const fetchAllData = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      // 1. Common Settings
      const resEnv = await fetch(getApiUrl("/api/cluster/env"), { cache: "no-store" });
      const dataEnv = await resEnv.json();
      if (!resEnv.ok) throw new Error(dataEnv?.error || "共通設定の読み込みに失敗しました");

      const s: Partial<Settings> = dataEnv?.settings || {};
      const d: Partial<Defaults> = dataEnv?.defaults || {};
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
      setAllModIds(Array.from(new Set([...loadedAll, ...loadedEnabled])));
      setEnabledModIds(loadedEnabled);

      // 2. Infra/Server Settings (.env)
      const resConfig = await fetch(getApiUrl("/api/cluster/config"), { cache: "no-store" });
      const dataConfig = await resConfig.json();
      if (!resConfig.ok) throw new Error(dataConfig?.error || "インフラ設定の読み込みに失敗しました");
      setEnvConfig(dataConfig.env || {});

      // 3. Dynamic Config (dynamicconfig.ini)
      const resDynamic = await fetch(getApiUrl("/api/cluster/dynamic"), { cache: "no-store" });
      const dataDynamic = await resDynamic.json();
      if (resDynamic.ok) {
        setDynamicConfig(dataDynamic);
        setOriginalDynamicConfig(dataDynamic);
      }

      // 4. Container status (to check player counts)
      const resStats = await fetch(getApiUrl("/api/containers"), { cache: "no-store" });
      if (resStats.ok) {
        const statsData = await resStats.json();
        if (Array.isArray(statsData)) {
          setContainers(statsData);
        }
      }

    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  useEffect(() => {
    if (activeTab === "ini-gus") {
      fetchIni("GameUserSettings.ini");
    } else if (activeTab === "ini-game") {
      fetchIni("Game.ini");
    }
  }, [activeTab, anyServerRunning]);

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

    // Validate map duplication
    const maps = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const map = envConfig[`ASA${i}_SERVER_MAP`];
      if (map) {
        if (maps.has(map)) return `マップ「${map}」が重複しています。`;
        maps.add(map);
      }
    }

    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, modsCsv, allModsCsv, envConfig]);

  const saveAll = async () => {
    setError(null);
    setMessage(null);
    const v = clientValidationError;
    if (v) {
      setError(v);
      return;
    }

    setSaving(true);
    try {
      // 1. Save Common Settings
      const commonBody: Settings = {
        ...settings,
        MODS: modsCsv,
        ALL_MODS: allModsCsv,
      };
      const resEnv = await fetch(getApiUrl("/api/cluster/env"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(commonBody),
      });
      if (!resEnv.ok) {
        const data = await resEnv.json();
        throw new Error(data?.error || "共通設定の保存に失敗しました");
      }

      // 2. Save Infra Settings
      const resConfig = await fetch(getApiUrl("/api/cluster/config"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: envConfig }),
      });
      const dataConfig = await resConfig.json();
      if (!resConfig.ok) {
        throw new Error(dataConfig?.error || "インフラ設定の保存に失敗しました");
      }
      // Update local state with normalized values from server (e.g. ASA_SLAVE_PORTS)
      if (dataConfig.env) {
        setEnvConfig(dataConfig.env);
      }

      setMessage("設定を保存しました。反映させるには「変更を適用」をクリックしてください。");
      setNeedsApply(true);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  const saveDynamic = async () => {
    setError(null);
    setMessage(null);
    setSavingDynamic(true);
    try {
      const res = await fetch(getApiUrl("/api/cluster/dynamic"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dynamicConfig),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "動的設定の保存に失敗しました");
      
      setOriginalDynamicConfig(dynamicConfig);
      setMessage(data.message || "動的設定を保存し、各サーバーへの反映リクエストを送信しました。");
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSavingDynamic(false);
    }
  };

  const applyChanges = async () => {
    if (!confirm("クラスター全体を再起動して設定を適用しますか？")) return;
    setApplying(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(getApiUrl("/api/cluster/compose"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "up" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "適応に失敗しました");
      setMessage("設定を適応しました（クラスターを起動/再起動しました）");
      setNeedsApply(false);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setApplying(false);
    }
  };

  const updateEnv = (key: string, value: string | boolean) => {
    setEnvConfig((prev) => ({
      ...prev,
      [key]: value === true ? "true" : value === false ? "false" : value,
    }));
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
          <div className="flex flex-col gap-1">
            <h2 className="text-3xl font-bold tracking-tight">設定</h2>
            <p className="text-sm text-muted-foreground">クラスターおよびサーバーの構成設定</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={fetchAllData}
              className="px-4 py-2 bg-secondary text-secondary-foreground rounded text-sm hover:bg-secondary/80 flex items-center gap-2"
              disabled={loading || loadingIni}
            >
              <RefreshCcw className="h-4 w-4" /> 再読込
            </button>
            {activeTab === "static" ? (
              <button
                onClick={saveAll}
                className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90 flex items-center gap-2"
                disabled={saving || loading}
              >
                <Save className="h-4 w-4" /> 保存
              </button>
            ) : activeTab === "dynamic" ? (
              <button
                onClick={saveDynamic}
                className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90 flex items-center gap-2 shadow-lg shadow-primary/20"
                disabled={savingDynamic || loading}
              >
                <Zap className="h-4 w-4" /> 保存して即時反映
              </button>
            ) : (
              <button
                onClick={() => saveIni(activeTab === "ini-gus" ? "GameUserSettings.ini" : "Game.ini")}
                className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90 flex items-center gap-2 shadow-lg shadow-primary/20"
                disabled={savingIni || loadingIni || anyServerRunning}
              >
                <Save className="h-4 w-4" /> 保存
              </button>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab("static")}
            className={`px-6 py-3 text-sm font-medium transition-colors relative ${
              activeTab === "static" 
                ? "text-primary border-b-2 border-primary" 
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4" />
              静的設定 (要再起動)
            </div>
          </button>
          <button
            onClick={() => setActiveTab("dynamic")}
            className={`px-6 py-3 text-sm font-medium transition-colors relative ${
              activeTab === "dynamic" 
                ? "text-primary border-b-2 border-primary" 
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              動的設定 (即時反映)
            </div>
          </button>
          <button
            onClick={() => setActiveTab("ini-gus")}
            className={`px-6 py-3 text-sm font-medium transition-colors relative ${
              activeTab === "ini-gus" 
                ? "text-primary border-b-2 border-primary" 
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4" />
              GameUserSettings.ini
            </div>
          </button>
          <button
            onClick={() => setActiveTab("ini-game")}
            className={`px-6 py-3 text-sm font-medium transition-colors relative ${
              activeTab === "ini-game" 
                ? "text-primary border-b-2 border-primary" 
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4" />
              Game.ini
            </div>
          </button>
        </div>

        {needsApply && activeTab === "static" && (
          <div className="p-4 bg-orange-100 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-800 rounded-lg flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-orange-800 dark:text-orange-200">
              <ShieldAlert className="h-5 w-5" />
              <div>
                <p className="font-semibold">未適応の変更があります</p>
                <p className="text-sm opacity-90">保存した設定を有効にするには、クラスターを再起動（一括起動）する必要があります。</p>
              </div>
            </div>
            <button
              onClick={applyChanges}
              disabled={applying}
              className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50 text-sm font-bold flex items-center gap-2 shadow-sm"
            >
              変更を適用 (再起動)
            </button>
          </div>
        )}

        {loading ? (
          <div>Loading...</div>
        ) : (
          <div className="space-y-6 pb-12">
            {(error || message) && (
              <div
                className={`p-4 border rounded ${error ? "border-destructive text-destructive bg-destructive/10" : "border-green-500 text-green-600 bg-green-50"}`}
              >
                {error || message}
              </div>
            )}

            {activeTab === "static" && (
              <>
                {/* クラスタ設定 (.env) */}
                {isAdmin && (
                  <div className="space-y-4">
                    <h3 className="text-xl font-bold border-l-4 border-primary pl-3">クラスタ設定</h3>
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                      <div className="p-4 bg-card border rounded-lg space-y-3">
                        <label className="text-sm font-semibold">セッション名 (プレフィックス)</label>
                        <input
                          type="text"
                          value={envConfig.ASA_SESSION_PREFIX || ""}
                          onChange={(e) => updateEnv("ASA_SESSION_PREFIX", e.target.value)}
                          className="w-full px-3 py-2 border rounded bg-background"
                          placeholder="TEST - "
                        />
                        <p className="text-xs text-muted-foreground">セッション名の冒頭に付与されます</p>
                      </div>

                      <div className="p-4 bg-card border rounded-lg space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-semibold">定期バックアップ</label>
                          <button
                            onClick={() => updateEnv("ASA_AUTO_BACKUP_ENABLED", envConfig.ASA_AUTO_BACKUP_ENABLED !== "true")}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${envConfig.ASA_AUTO_BACKUP_ENABLED === "true" ? "bg-primary" : "bg-muted"}`}
                          >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-primary-foreground transition-transform ${envConfig.ASA_AUTO_BACKUP_ENABLED === "true" ? "translate-x-6" : "translate-x-1"}`} />
                          </button>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">タイミング (Cron)</label>
                          <input
                            type="text"
                            value={envConfig.ASA_AUTO_BACKUP_CRON_EXPRESSION || ""}
                            onChange={(e) => updateEnv("ASA_AUTO_BACKUP_CRON_EXPRESSION", e.target.value)}
                            disabled={envConfig.ASA_AUTO_BACKUP_ENABLED !== "true"}
                            className={`w-full px-3 py-1 text-sm border rounded font-mono transition-opacity ${
                              envConfig.ASA_AUTO_BACKUP_ENABLED === "true" 
                                ? "bg-background opacity-100" 
                                : "bg-muted opacity-50 cursor-not-allowed"
                            }`}
                          />
                        </div>
                      </div>

                      <div className="p-4 bg-card border rounded-lg space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-semibold">定期更新 (Steam/Mods)</label>
                          <button
                            onClick={() => updateEnv("ASA_AUTO_UPDATE_ENABLED", envConfig.ASA_AUTO_UPDATE_ENABLED !== "true")}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${envConfig.ASA_AUTO_UPDATE_ENABLED === "true" ? "bg-primary" : "bg-muted"}`}
                          >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-primary-foreground transition-transform ${envConfig.ASA_AUTO_UPDATE_ENABLED === "true" ? "translate-x-6" : "translate-x-1"}`} />
                          </button>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">タイミング (Cron)</label>
                          <input
                            type="text"
                            value={envConfig.ASA_AUTO_UPDATE_CRON_EXPRESSION || ""}
                            onChange={(e) => updateEnv("ASA_AUTO_UPDATE_CRON_EXPRESSION", e.target.value)}
                            disabled={envConfig.ASA_AUTO_UPDATE_ENABLED !== "true"}
                            className={`w-full px-3 py-1 text-sm border rounded font-mono transition-opacity ${
                              envConfig.ASA_AUTO_UPDATE_ENABLED === "true" 
                                ? "bg-background opacity-100" 
                                : "bg-muted opacity-50 cursor-not-allowed"
                            }`}
                          />
                        </div>
                      </div>

                      <div className="p-4 bg-card border rounded-lg space-y-3">
                        <label className="text-sm font-semibold">Discord Webhook (共通設定)</label>
                        <input
                          type="text"
                          value={envConfig.ASA_DISCORD_WEBHOOK_URL || ""}
                          onChange={(e) => updateEnv("ASA_DISCORD_WEBHOOK_URL", e.target.value)}
                          className="w-full px-3 py-2 border rounded bg-background font-mono text-sm"
                          placeholder="https://discord.com/api/webhooks/..."
                        />
                        <p className="text-xs text-muted-foreground">個別設定がない場合のデフォルト通知先となります</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* サーバー個別設定 */}
                <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold border-l-4 border-primary pl-3">サーバー設定</h3>
                <button
                  onClick={() => setSimpleMode(!simpleMode)}
                  className="text-xs text-primary flex items-center gap-1 hover:underline"
                >
                  {simpleMode ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                  {simpleMode ? "詳細設定を表示" : "シンプルモード"}
                </button>
              </div>
              <div className="grid gap-4">
                {Array.from({ length: 10 }).map((_, i) => {
                  const mapKey = `ASA${i}_SERVER_MAP`;
                  const mapValue = envConfig[mapKey];
                  if (mapValue === undefined) return null;
                  if (!isAdmin && mapValue === "") return null;

                  const containerName = envConfig[`ASA${i}_CONTAINER_NAME`];
                  const container = containers.find(c => c.name === containerName);
                  const onlineCount = container?.onlinePlayers?.length || 0;
                  const offlineCount = container?.offlinePlayers?.length || 0;
                  const hasPlayers = (onlineCount + offlineCount) > 0;

                  return (
                    <div key={i} className="p-4 bg-card border rounded-lg shadow-sm">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="px-1.5 py-0.5 bg-primary/10 text-primary text-[10px] font-bold rounded uppercase shrink-0">
                          asa{i}
                        </span>
                        <span className="text-sm font-mono font-bold truncate">
                          {containerName} <span className="text-muted-foreground mx-1">:</span> {envConfig.ASA_SESSION_PREFIX || ""}{envConfig[`ASA${i}_SESSION_NAME`] || ""}
                        </span>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 items-end">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-semibold">マップ</label>
                            {hasPlayers && (
                              <span className="text-[10px] text-destructive font-bold flex items-center gap-0.5">
                                <Users className="h-3 w-3" />
                                変更不可 ({onlineCount + offlineCount}人)
                              </span>
                            )}
                          </div>
                          <select
                            value={mapValue ?? ""}
                            onChange={(e) => updateEnv(mapKey, e.target.value)}
                            disabled={hasPlayers}
                            className={`w-full px-3 py-2 border rounded text-sm ${hasPlayers ? "bg-muted cursor-not-allowed" : "bg-background"}`}
                          >
                            <option value="">(None)</option>
                            {Object.entries(ASA_MAP_NAMES).map(([raw, display]) => (
                               <option key={raw} value={raw}>
                                {display} ({raw})
                              </option>
                            ))}
                          </select>
                        </div>

                        {!simpleMode && (
                          <>
                            <div className="space-y-1">
                              <label className="text-xs font-semibold">セッション名 (末尾)</label>
                              <input
                                type="text"
                                value={envConfig[`ASA${i}_SESSION_NAME`] || ""}
                                readOnly
                                className="w-full px-3 py-2 border rounded bg-muted text-sm text-muted-foreground cursor-not-allowed"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-semibold">SERVER ポート</label>
                              <input
                                type="text"
                                value={envConfig[`ASA${i}_SERVER_PORT`] || ""}
                                readOnly
                                className="w-full px-3 py-2 border rounded bg-muted text-sm text-muted-foreground cursor-not-allowed"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-semibold">QUERY ポート</label>
                              <input
                                type="text"
                                value={envConfig[`ASA${i}_QUERY_PORT`] || ""}
                                readOnly
                                className="w-full px-3 py-2 border rounded bg-muted text-sm text-muted-foreground cursor-not-allowed"
                              />
                            </div>

                            {isAdmin && (
                              <div className="space-y-1 lg:col-span-4">
                                <label className="text-xs font-semibold text-primary flex items-center gap-1">
                                  <Zap className="h-3 w-3" /> Discord Webhook URL (個別設定)
                                </label>
                                <input
                                  type="text"
                                  value={envConfig[`ASA${i}_DISCORD_WEBHOOK_URL`] || ""}
                                  onChange={(e) => updateEnv(`ASA${i}_DISCORD_WEBHOOK_URL`, e.target.value)}
                                  className="w-full px-3 py-2 border rounded bg-background text-sm font-mono"
                                  placeholder="https://discord.com/api/webhooks/..."
                                />
                                <p className="text-[10px] text-muted-foreground">このサーバー専用の通知先を指定する場合に入力します（空なら共通設定を使用）</p>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 共通サーバー設定 */}
            <div className="space-y-4">
              <h3 className="text-xl font-bold border-l-4 border-primary pl-3">サーバー共通設定</h3>
              
              <div className="p-6 bg-card border rounded-lg space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <h4 className="text-lg font-semibold flex items-center gap-2">
                      プレイヤー上限 <span className="text-xs font-normal text-muted-foreground">(MAX_PLAYERS)</span>
                    </h4>
                    <button
                      onClick={resetMaxPlayers}
                      className="px-2 py-1 rounded bg-secondary text-secondary-foreground hover:bg-secondary/80 text-xs"
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
                    <div className="w-16 text-right font-mono font-bold text-primary">{settings.MAX_PLAYERS}</div>
                  </div>
                </div>

                {isAdmin && (
                  <div className="space-y-4 border-t pt-6">
                    <h4 className="text-lg font-semibold">パスワード</h4>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <label className="text-sm font-medium">参加パスワード <span className="text-xs text-muted-foreground font-normal">(SERVER_PASSWORD)</span></label>
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
                          className="w-full px-3 py-2 border rounded bg-background text-sm"
                          maxLength={32}
                          placeholder="（空なら未設定）"
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <label className="text-sm font-medium">管理者パスワード <span className="text-xs text-muted-foreground font-normal">(ARK_ADMIN_PASSWORD)</span></label>
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
                          className="w-full px-3 py-2 border rounded bg-background text-sm"
                          maxLength={32}
                          placeholder="（空なら未設定）"
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-4 border-t pt-6">
                  <div className="flex items-center justify-between gap-4">
                    <h4 className="text-lg font-semibold">MODS</h4>
                    <button
                      onClick={resetMods}
                      className="px-2 py-1 rounded bg-secondary text-secondary-foreground hover:bg-secondary/80 text-xs"
                      type="button"
                    >
                      デフォルトに戻す
                    </button>
                  </div>

                  <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr className="text-left border-b">
                          <th className="py-2 pl-4 w-10 text-center">有効</th>
                          <th className="py-2 px-4 w-32">ID</th>
                          <th className="py-2 px-4">名前</th>
                          <th className="py-2 px-4 w-40">順序 / 操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allModIds.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="py-8 text-center text-muted-foreground italic">
                              MODは登録されていません
                            </td>
                          </tr>
                        ) : (
                          allModIds.map((id, idx) => {
                            const isEnabled = enabledModIds.includes(id);
                            return (
                              <tr key={id} className={`border-b transition-colors hover:bg-muted/30 ${!isEnabled ? "opacity-60 grayscale" : "bg-primary/5"}`}>
                                <td className="py-2 pl-4 text-center">
                                  <button
                                    onClick={() => toggleMod(id)}
                                    className={`${isEnabled ? "text-primary" : "text-muted-foreground"} hover:scale-110 transition-transform`}
                                    title={isEnabled ? "無効化" : "有効化"}
                                  >
                                    {isEnabled ? <Power className="h-5 w-5" /> : <PowerOff className="h-5 w-5" />}
                                  </button>
                                </td>
                                <td className="py-2 px-4 font-mono font-bold text-xs">{id}</td>
                                <td className={`py-2 px-4 ${!isEnabled ? "line-through" : ""}`}>
                                  {modInfo[id]?.url ? (
                                    <a
                                      className="text-primary hover:underline font-medium"
                                      href={modInfo[id]?.url}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      {modInfo[id]?.name || "Loading..."}
                                    </a>
                                  ) : (
                                    modInfo[id]?.name || id
                                  )}
                                </td>
                                <td className="py-2 px-4 flex items-center gap-1">
                                  <button
                                    onClick={() => moveMod(id, "up")}
                                    disabled={idx === 0}
                                    className="p-1.5 rounded-full hover:bg-secondary disabled:opacity-20"
                                  >
                                    <ArrowUp className="h-4 w-4" />
                                  </button>
                                  <button
                                    onClick={() => moveMod(id, "down")}
                                    disabled={idx === allModIds.length - 1}
                                    className="p-1.5 rounded-full hover:bg-secondary disabled:opacity-20"
                                  >
                                    <ArrowDown className="h-4 w-4" />
                                  </button>
                                  <div className="w-2" />
                                  <button
                                    onClick={() => removeMod(id)}
                                    className="p-1.5 text-destructive hover:bg-destructive/10 rounded-full transition-colors"
                                    title="削除"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        )}

                        <tr className="bg-muted/20">
                          <td className="py-3 px-4" colSpan={2}>
                            <input
                              value={newModId}
                              onChange={(e) => setNewModId(e.target.value)}
                              placeholder="MOD ID (数字)"
                              className="w-full px-3 py-1.5 border rounded bg-background font-mono text-sm"
                              onKeyDown={(e) => e.key === "Enter" && addMod()}
                            />
                          </td>
                          <td className="py-3 px-4 text-xs text-muted-foreground">
                            追加すると CurseForge から情報を自動取得します
                          </td>
                          <td className="py-3 px-4">
                            <button
                              onClick={addMod}
                              className="w-full px-3 py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center justify-center gap-2 text-sm font-bold"
                            >
                              <Plus className="h-4 w-4" /> 追加
                            </button>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {isAdmin && (
                  <div className="space-y-4 border-t pt-6">
                    <h4 className="text-lg font-semibold">高度なオプション</h4>

                    <div className="grid gap-4">
                      <details className="border rounded-lg overflow-hidden bg-background group">
                        <summary className="cursor-pointer select-none font-medium p-4 bg-muted/30 hover:bg-muted/50 transition-colors flex items-center gap-2">
                          <span className="group-open:rotate-90 transition-transform"><ChevronRight className="h-4 w-4" /></span>
                          CLUSTER_ID <span className="text-xs font-normal text-muted-foreground">(転送同期用ID)</span>
                        </summary>
                        <div className="p-4 space-y-4 border-t">
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-muted-foreground">クラスタ間同期（転送）の識別に必要です。</p>
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
                            className="w-full px-3 py-2 border rounded bg-background font-mono text-sm"
                            maxLength={32}
                            placeholder="（空なら未設定）"
                          />
                        </div>
                      </details>

                      <details className="border rounded-lg overflow-hidden bg-background group">
                        <summary className="cursor-pointer select-none font-medium p-4 bg-muted/30 hover:bg-muted/50 transition-colors flex items-center gap-2">
                          <span className="group-open:rotate-90 transition-transform"><ChevronRight className="h-4 w-4" /></span>
                          起動オプション <span className="text-xs font-normal text-muted-foreground">(ARK_EXTRA_OPTS)</span>
                        </summary>
                        <div className="p-4 space-y-4 border-t">
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-muted-foreground">URLパラメータ形式のオプションを指定します。</p>
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
                            className="w-full min-h-[140px] px-3 py-2 border rounded bg-background font-mono text-xs"
                            placeholder="?ServerCrosshair=true?..."
                          />
                        </div>
                      </details>

                      <details className="border rounded-lg overflow-hidden bg-background group">
                        <summary className="cursor-pointer select-none font-medium p-4 bg-muted/30 hover:bg-muted/50 transition-colors flex items-center gap-2">
                          <span className="group-open:rotate-90 transition-transform"><ChevronRight className="h-4 w-4" /></span>
                          拡張コマンドオプション <span className="text-xs font-normal text-muted-foreground">(ARK_EXTRA_DASH_OPTS)</span>
                        </summary>
                        <div className="p-4 space-y-4 border-t">
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-muted-foreground">ハイフン形式の引数を指定します。</p>
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
                            className="w-full min-h-[140px] px-3 py-2 border rounded bg-background font-mono text-xs"
                            placeholder="-ForceAllowCaveFlyers ..."
                          />
                        </div>
                      </details>
                    </div>
                  </div>
                )}
              </div>
            </div>
              </>
            )}

            {activeTab === "dynamic" && (
              <div className="space-y-6">
                <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex items-start gap-3">
                  <Zap className="h-5 w-5 text-amber-600 mt-0.5" />
                  <div className="text-sm space-y-1">
                    <p className="font-bold text-amber-800 dark:text-amber-200">動的設定（即時反映領域）</p>
                    <p className="text-amber-700 dark:text-amber-300 opacity-90">
                      ここでの変更は `dynamicconfig.ini` に保存され、全サーバーへ反映リクエストが送られます。
                      <strong className="ml-1">サーバーの再起動は不要です。</strong>
                    </p>
                  </div>
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                  <div className="p-6 bg-card border rounded-lg space-y-6">
                    <h3 className="text-lg font-bold flex items-center gap-2">
                      <Settings2 className="h-5 w-5" />
                      倍率・ゲームバランス
                    </h3>
                    <div className="space-y-4">
                      {Object.keys(dynamicConfig).filter(k => k.endsWith('Multiplier')).map(key => (
                        <div key={key} className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <label className="text-sm font-semibold flex items-center gap-1.5">
                              {key}
                              <div className="group relative">
                                <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-2 bg-popover text-popover-foreground text-xs rounded shadow-xl border opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                                  {DYNAMIC_CONFIG_DESCRIPTIONS[key] || "設定項目"}
                                </div>
                              </div>
                            </label>
                            {originalDynamicConfig[key] !== dynamicConfig[key] && (
                              <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold uppercase">変更あり</span>
                            )}
                          </div>
                          <input
                            type="number"
                            step="0.1"
                            value={dynamicConfig[key]}
                            onChange={(e) => setDynamicConfig(prev => ({ ...prev, [key]: e.target.value }))}
                            className="w-full px-3 py-2 border rounded bg-background font-mono text-sm"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="p-6 bg-card border rounded-lg space-y-6">
                    <h3 className="text-lg font-bold flex items-center gap-2">
                      <Plus className="h-5 w-5" />
                      その他・カラーセット
                    </h3>
                    <div className="space-y-4">
                      {Object.keys(dynamicConfig).filter(k => !k.endsWith('Multiplier')).map(key => (
                        <div key={key} className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <label className="text-sm font-semibold flex items-center gap-1.5">
                              {key}
                              <div className="group relative">
                                <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-2 bg-popover text-popover-foreground text-xs rounded shadow-xl border opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                                  {DYNAMIC_CONFIG_DESCRIPTIONS[key] || "設定項目"}
                                </div>
                              </div>
                            </label>
                            {originalDynamicConfig[key] !== dynamicConfig[key] && (
                              <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold uppercase">変更あり</span>
                            )}
                          </div>
                          <input
                            type="text"
                            value={dynamicConfig[key]}
                            onChange={(e) => setDynamicConfig(prev => ({ ...prev, [key]: e.target.value }))}
                            className="w-full px-3 py-2 border rounded bg-background font-mono text-sm"
                          />
                        </div>
                      ))}
                      
                      <div className="pt-4 border-t">
                        <a 
                          href="https://ark.wiki.gg/wiki/Server_configuration#DynamicConfig" 
                          target="_blank" 
                          rel="noreferrer"
                          className="text-xs text-primary hover:underline flex items-center gap-1"
                        >
                          詳細なドキュメント (Wiki) を見る
                          <ChevronRight className="h-3 w-3" />
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {(activeTab === "ini-gus" || activeTab === "ini-game") && (
              <div className="space-y-6">
                <div className={`p-4 rounded-lg border flex items-start gap-3 ${anyServerRunning ? "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-200" : "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-200"}`}>
                  <Info className="h-5 w-5 mt-0.5" />
                  <div className="text-sm space-y-1">
                    <p className="font-bold">{activeTab === "ini-gus" ? "GameUserSettings.ini" : "Game.ini"} エディタ</p>
                    {anyServerRunning ? (
                      <p>サーバーが起動中のため、現在は閲覧のみ可能です。編集するには全サーバーを停止してください。</p>
                    ) : (
                      <p>
                        ファイルを直接編集します。
                      </p>
                    )}
                  </div>
                </div>

                <div className="bg-card border rounded-lg overflow-hidden flex flex-col h-[600px]">
                  {loadingIni ? (
                    <div className="flex-1 flex items-center justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                  ) : (
                    <Editor
                      height="100%"
                      language="ini"
                      theme="vs-dark"
                      value={iniContent}
                      onChange={(value) => setIniContent(value || "")}
                      options={{
                        readOnly: anyServerRunning,
                        minimap: { enabled: false },
                        fontSize: 14,
                        automaticLayout: true,
                        scrollBeyondLastLine: false,
                        renderLineHighlight: "all",
                        wordWrap: "on",
                        padding: { top: 16, bottom: 16 },
                      }}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
