/** 八项能力：类型、名称、主题色、等级状态与效果计算（2c 能力系统核心） */

export type AbilityKind = 'bite' | 'tail' | 'armor' | 'vigor' | 'venom' | 'shock' | 'wing' | 'limb'

export interface AbilityInfo {
  /** 中文短名（HUD/飘字用） */
  label: string
  /** 能力主题色（肉块/飘字/HUD 着色） */
  color: string
}

export const ABILITY_INFO: Record<AbilityKind, AbilityInfo> = {
  bite: { label: '咬合力', color: '#e2564a' },
  tail: { label: '尾力', color: '#4aa3e2' },
  armor: { label: '硬鳞', color: '#9aa7b0' },
  vigor: { label: '生命力', color: '#5fce6a' },
  venom: { label: '毒素', color: '#a95fd6' },
  shock: { label: '电击', color: '#f0d040' },
  wing: { label: '翼', color: '#e8e2d0' },
  limb: { label: '肢', color: '#c98d4b' },
}

export const ABILITY_KINDS: ReadonlyArray<AbilityKind> = [
  'bite', 'tail', 'armor', 'vigor', 'venom', 'shock', 'wing', 'limb',
]

export const MAX_ABILITY_LV = 10

/** 突破等级：升到该级需要消耗该能力专属圣物（Lv4 需 1 个，Lv7 需 2 个） */
export const RELIC_COST: Readonly<Record<number, number>> = { 4: 1, 7: 2 }

/** 圣物中文名（拾取提示与指引用） */
export const RELIC_NAMES: Record<AbilityKind, string> = {
  bite: '鲨之利牙',
  tail: '旗鱼之鳍',
  armor: '龟甲残片',
  vigor: '生命珍珠',
  venom: '毒腺胞囊',
  shock: '雷光水晶',
  wing: '风之羽',
  limb: '古蜥龙骨',
}

/** 各圣物的刷新栖息区域标签（WorldScene 采样用） */
export type RelicHabitat = 'shallow' | 'reef' | 'deep' | 'ocean' | 'sky' | 'island'

export const RELIC_HABITATS: Record<AbilityKind, ReadonlyArray<RelicHabitat>> = {
  bite: ['ocean', 'deep'],
  tail: ['ocean'],
  armor: ['reef', 'island'],
  vigor: ['shallow', 'reef'],
  venom: ['reef'],
  shock: ['deep', 'sky'],
  wing: ['sky'],
  limb: ['island'],
}

export const HABITAT_LABELS: Record<RelicHabitat, string> = {
  shallow: '浅海',
  reef: '珊瑚礁',
  deep: '深海',
  ocean: '远洋',
  sky: '天空',
  island: '岛屿',
}

/** 圣物库存：kind → 持有数 */
export type RelicInventory = Record<AbilityKind, number>

export function createRelicInventory(): RelicInventory {
  const r = {} as RelicInventory
  for (const k of ABILITY_KINDS) r[k] = 0
  return r
}

export interface AbilityState {
  /** 0 = 未解锁；1~10 */
  lv: number
  exp: number
}

export type Abilities = Record<AbilityKind, AbilityState>

export function createAbilities(): Abilities {
  const a = {} as Abilities
  for (const k of ABILITY_KINDS) a[k] = { lv: 0, exp: 0 }
  return a
}

/** 升到下一级所需经验：0→1 门槛低（尝鲜即解锁），之后递增 */
export function expToNext(lv: number): number {
  return lv === 0 ? 3 : 4 + (lv - 1) * 3
}

export interface ExpGainResult {
  /** 本次是否至少升了一级 */
  leveledUp: boolean
  /** 升级后的等级（未升级为原等级） */
  newLv: number
  /** 经验满但缺少圣物，卡在突破门槛 */
  blockedByRelic: boolean
}

/**
 * 加经验（吃肉/碎片）；4/7 级为突破级：
 * 经验满时需消耗对应数量圣物才能继续，缺圣物则经验卡满等待。
 * relics 为传入的库存对象，突破成功时直接扣减。
 */
export function gainExp(
  a: Abilities,
  kind: AbilityKind,
  amount: number,
  relics?: RelicInventory,
): ExpGainResult {
  const st = a[kind]
  const oldLv = st.lv
  st.exp += amount
  let blocked = false
  while (st.lv < MAX_ABILITY_LV) {
    const need = expToNext(st.lv)
    if (st.exp < need) break
    const nextLv = st.lv + 1
    const relicNeed = RELIC_COST[nextLv] ?? 0
    if (relicNeed > 0) {
      const have = relics?.[kind] ?? 0
      if (have < relicNeed) {
        // 卡满等待圣物
        st.exp = need
        blocked = true
        break
      }
      relics![kind] = have - relicNeed
    }
    st.exp -= need
    st.lv++
  }
  if (st.lv >= MAX_ABILITY_LV) st.exp = 0
  return { leveledUp: st.lv > oldLv, newLv: st.lv, blockedByRelic: blocked }
}

/** 部位形态档位：0 无 / 1 初形(1-3级) / 2 中形(4-6) / 3 终形(7-10) */
export function tierOf(lv: number): number {
  if (lv <= 0) return 0
  if (lv <= 3) return 1
  if (lv <= 6) return 2
  return 3
}

/** 由能力等级计算的玩家数值效果（集中一处，避免散落魔法数字） */
export interface AbilityEffects {
  /** 撕咬伤害（基础 12，咬合力 +15%/级） */
  biteDamage: number
  /** 水中最大游速（基础 270，尾力 +8%/级） */
  swimMax: number
  /** 受伤乘数（硬鳞 -6%/级，下限 0.4） */
  damageTaken: number
  /** 最大生命（基础 100，生命力 +15/级） */
  maxHp: number
  /** 生命恢复/秒（生命力 0.4/级，未投入不回复） */
  hpRegen: number
  /** 登岛行走速度（基础 190，肢 +8%/级；0 级未解锁） */
  walkMax: number
  /** 翼等级：0-6 未成翼（仅增强出水跃空高度）/ 7+ 解锁飞行 */
  wingLv: number
  /** 肢等级：0 未解锁 */
  limbLv: number
  /** 成翼后的空中飞行速度（7 级 130 → 10 级 295，满级前明显迟缓） */
  wingAirMax: number
  /** 出水跃空初速：未成翼时唯一的空中收益，决定跃出水面高度 */
  leapVy: number
  /** 撕咬使生物中毒的每秒伤害（毒素） */
  venomDps: number
  /** 撕咬麻痹生物的概率（电击） */
  shockChance: number
  /** 各部位形态档位 */
  tiers: Record<AbilityKind, number>
}

export function computeEffects(a: Abilities): AbilityEffects {
  const lv = (k: AbilityKind): number => a[k].lv
  const tiers = {} as Record<AbilityKind, number>
  for (const k of ABILITY_KINDS) tiers[k] = tierOf(a[k].lv)
  return {
    biteDamage: 12 * (1 + 0.15 * lv('bite')),
    swimMax: 270 * (1 + 0.08 * lv('tail')),
    damageTaken: Math.max(0.4, 1 - 0.06 * lv('armor')),
    maxHp: 100 + 15 * lv('vigor'),
    hpRegen: 0.4 * lv('vigor'),
    walkMax: 190 * (1 + 0.08 * lv('limb')),
    wingLv: lv('wing'),
    limbLv: lv('limb'),
    wingAirMax: lv('wing') >= 7 ? 130 + (lv('wing') - 7) * 55 : 0,
    leapVy: 300 + 105 * lv('wing'),
    venomDps: 3 * lv('venom'),
    shockChance: Math.min(0.6, 0.08 * lv('shock')),
    tiers,
  }
}
