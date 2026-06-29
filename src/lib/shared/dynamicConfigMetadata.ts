export const DYNAMIC_CONFIG_DESCRIPTIONS: Record<string, string> = {
  BabyCuddleIntervalMultiplier: '赤ちゃんのケア（刷り込み）の間隔を調整します。<br/>値が小さいほど間隔が短くなります。<br/>推奨：0.1～0.0185',
  BabyImprintAmountMultiplier: '1回のケアで上昇する刷り込み値の倍率を調整します。<br/>値が大きいほど1回のケアで上昇する刷り込み値が増えます。<br/>推奨：2～20',
  BabyMatureSpeedMultiplier: '赤ちゃんの成長速度を調整します。<br/>値が大きいほど早く成長します。<br/>推奨：20～60',
  EggHatchSpeedMultiplier: '卵の孵化速度を調整します。<br/>値が大きいほど早く孵化します。<br/>推奨：15～60',
  HarvestAmountMultiplier: '資源の採取量を調整します。<br/>推奨：2.0～5.0',
  HexagonRewardMultiplier: 'ヘキサゴン報酬の倍率を調整します。<br/>推奨：1.5～3.0',
  MatingIntervalMultiplier: '交配の間隔を調整します。<br/>値が小さいほど次に交配できるようになるまでの時間が短くなります。<br/>推奨：0.1～0.01',
  XPMultiplier: '獲得経験値の倍率を調整します。<br/>推奨：2.0～5.0',
  TamingSpeedMultiplier: 'テイム速度の倍率を調整します。<br/>値が大きいほど早くテイムできます。<br/>推奨：6.0～10.0',
  DynamicColorset: '使用する動的なカラーセットを指定します。',
  DynamicColorsetChanceOverride: '動的なカラーセットが適用される確率をオーバーライドします。',
};

export const DYNAMIC_MULTIPLIER_KEYS = Object.keys(DYNAMIC_CONFIG_DESCRIPTIONS)
  .filter((key) => key.endsWith('Multiplier'));
