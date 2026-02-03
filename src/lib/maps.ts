export const ASA_MAP_NAMES: Record<string, string> = {
  "TheIsland_WP": "アイランド",
  "TheCenter_WP": "センター",
  "ScorchedEarth_WP": "スコーチドアース",
  "Ragnarok_WP": "ラグナロク",
  "Aberration_WP": "アベレーション",
  "Extinction_WP": "エクスティンクション",
  "Valguero_WP": "バルゲロ",
  "Astraeos_WP": "アストレオス",
  // "Genesis1_WP": "ジェネシス1",
  // "CrystalIsles_WP": "クリスタルアイルズ",
  // "Genesis2_WP": "ジェネシス2",
  // "LostIsland_WP": "ロストアイランド",
  // "Fjordur_WP": "フィヨルド",
  "BobsMissions_WP": "Club ARK",
  "SurvivalOfTheFittest_TheIsland_WP": "Survival Of The Fittest",
  "LostColony_WP": "ロストコロニー",
};

export function getMapDisplayName(mapRaw: string): string {
  return ASA_MAP_NAMES[mapRaw] || mapRaw;
}
