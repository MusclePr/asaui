import fs from 'node:fs';
import path from 'node:path';
import { CLUSTER_DIR } from './cluster';
import { getContainers, execRcon } from './docker';

export const DYNAMIC_CONFIG_FILE = path.join(CLUSTER_DIR, 'web', 'dynamicconfig.ini');
export const DYNAMIC_CONFIG_APPLY_COMMAND = 'ForceUpdateDynamicConfig';

export interface DynamicConfig {
  [key: string]: string;
}

export const DYNAMIC_CONFIG_DESCRIPTIONS: Record<string, string> = {
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

export function readDynamicConfig(): DynamicConfig {
  if (!fs.existsSync(DYNAMIC_CONFIG_FILE)) {
    return {};
  }

  const content = fs.readFileSync(DYNAMIC_CONFIG_FILE, 'utf-8');
  const lines = content.split('\n');
  const config: DynamicConfig = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith(';')) {
      const [key, ...valueParts] = trimmed.split('=');
      const value = valueParts.join('=');
      config[key.trim()] = value.trim();
    }
  }

  return config;
}

export function writeDynamicConfig(config: DynamicConfig): void {
  let content = '; https://ark.wiki.gg/wiki/Server_configuration#DynamicConfig\n';
  for (const [key, value] of Object.entries(config)) {
    content += `${key}=${value}\n`;
  }
  fs.writeFileSync(DYNAMIC_CONFIG_FILE, content, 'utf-8');
}

export async function broadcastDynamicConfigReload() {
  const containers = await getContainers();
  const runningContainers = containers.filter(c => c.state === 'running' && c.isManaged);
  
  const results = await Promise.allSettled(
    runningContainers.map(c => execRcon(c.id, DYNAMIC_CONFIG_APPLY_COMMAND))
  );

  return results.map((res, index) => ({
    containerName: runningContainers[index].name,
    status: res.status,
    output: res.status === 'fulfilled' ? res.value : (res as PromiseRejectedResult).reason?.message || String((res as PromiseRejectedResult).reason)
  }));
}
