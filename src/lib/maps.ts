export const ASA_MAP_NAMES: Record<string, string> = {
  "TheIsland_WP": "アイランド",
  "TheIsland_WP:1460513": "アイランド公式改善版",
  "TheCenter_WP": "センター",
  "ScorchedEarth_WP": "スコーチドアース",
  "ScorchedEarthRM_WP:1465909": "スコーチドアースリボーン",
  "Ragnarok_WP": "ラグナロク",
  "Aberration_WP": "アベレーション",
  "Extinction_WP": "エクスティンクション",
  "Valguero_WP": "バルゲロ",
  "LostColony_WP": "ロストコロニー",
  "Astraeos_WP": "アストレオス",
  "Genesis1_WP": "ジェネシス１",
  // "CrystalIsles_WP": "クリスタルアイルズ",
  // "Genesis2_WP": "ジェネシス2",
  // "LostIsland_WP": "ロストアイランド",
  // "Fjordur_WP": "フィヨルド",
  "BobsMissions_WP:1005639": "Club ARK",
  "SurvivalOfTheFittest_TheIsland_WP": "Survival Of The Fittest",
  "epiphany_WP:1193764": "エピファニー",
};

export function getMapDisplayName(mapRaw: string): string {
  return ASA_MAP_NAMES[mapRaw] || mapRaw;
}

export function getBaseMapName(mapRaw: string): string {
  return mapRaw.split(":")[0];
}
