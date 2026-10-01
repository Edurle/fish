import { clamp } from '../core/math'
import type { AbilityKind } from '../systems/Abilities'
import { drawSpecies } from '../render/creatureArt'
import { groundTopAt, resolveCircleVsBlocks, segmentHitsBlocks } from '../world/Collisions'
import type { World } from '../world/World'
import type { Player } from './Player'

export type CreatureShape = 'fish' | 'puffer' | 'eel' | 'crab' | 'turtle' | 'bird'
export type CreatureBehavior = 'wander' | 'flee' | 'chase' | 'dive'
/** 活动介质：决定生物的移动约束区域 */
export type CreatureMedium = 'water' | 'air' | 'land'

export interface SpeciesDef {
  id: string
  name: string
  medium: CreatureMedium
  shape: CreatureShape
  color: string
  /** 体型区间（半径 px），实例化时随机 */
  sizeRange: [number, number]
  hp: number
  damage: number
  speed: number
  behavior: CreatureBehavior
  /** 群体生成数量（1 = 独居） */
  group: number
  meatType: AbilityKind
  meatRange: [number, number]
  /** 主动追猎的感知半径（chase/dive） */
  aggroRange?: number
  /** 特殊机制：鼓胀 / 毒 / 放电 / 高减伤 */
  special?: 'puff' | 'poison' | 'shock' | 'shell'
}

/** 物种表：按生态分区查阅 SpawnManager */
export const SPECIES: ReadonlyArray<SpeciesDef> = [
  // —— 浅海 ——
  { id: 'minnow', name: '小鱼', medium: 'water', shape: 'fish', color: '#8fd0e8', sizeRange: [8, 12], hp: 6, damage: 0, speed: 55, behavior: 'wander', group: 7, meatType: 'vigor', meatRange: [1, 2] },
  { id: 'herring', name: '鲱鱼', medium: 'water', shape: 'fish', color: '#b8cfe0', sizeRange: [14, 18], hp: 14, damage: 0, speed: 105, behavior: 'flee', group: 1, meatType: 'vigor', meatRange: [2, 3] },
  // —— 珊瑚礁 ——
  { id: 'puffer', name: '河豚', medium: 'water', shape: 'puffer', color: '#d9c26a', sizeRange: [16, 24], hp: 35, damage: 8, speed: 40, behavior: 'wander', group: 1, meatType: 'armor', meatRange: [2, 4], special: 'puff' },
  { id: 'poisonfish', name: '毒鲀', medium: 'water', shape: 'fish', color: '#9b6ad6', sizeRange: [14, 20], hp: 18, damage: 5, speed: 55, behavior: 'chase', group: 1, meatType: 'venom', meatRange: [2, 3], aggroRange: 950, special: 'poison' },
  { id: 'turtle', name: '海龟', medium: 'water', shape: 'turtle', color: '#6f9b5f', sizeRange: [24, 34], hp: 60, damage: 6, speed: 30, behavior: 'wander', group: 1, meatType: 'armor', meatRange: [3, 5], special: 'shell' },
  // —— 深海 ——
  { id: 'lantern', name: '灯笼鱼', medium: 'water', shape: 'fish', color: '#3d4a66', sizeRange: [26, 38], hp: 50, damage: 10, speed: 35, behavior: 'wander', group: 1, meatType: 'vigor', meatRange: [3, 5] },
  { id: 'eel', name: '电鳗', medium: 'water', shape: 'eel', color: '#5a6b4a', sizeRange: [20, 30], hp: 28, damage: 6, speed: 70, behavior: 'wander', group: 1, meatType: 'shock', meatRange: [3, 4], special: 'shock' },
  // —— 远洋 ——
  { id: 'sailfish', name: '旗鱼', medium: 'water', shape: 'fish', color: '#4a7ba8', sizeRange: [18, 26], hp: 16, damage: 0, speed: 165, behavior: 'flee', group: 1, meatType: 'tail', meatRange: [3, 4] },
  { id: 'shark', name: '大白鲨', medium: 'water', shape: 'fish', color: '#7d93a6', sizeRange: [34, 50], hp: 130, damage: 22, speed: 118, behavior: 'chase', group: 1, meatType: 'bite', meatRange: [4, 6], aggroRange: 1250 },
  // —— 天空 ——
  { id: 'seagull', name: '海鸥', medium: 'air', shape: 'bird', color: '#eceff2', sizeRange: [10, 14], hp: 8, damage: 0, speed: 88, behavior: 'wander', group: 5, meatType: 'wing', meatRange: [1, 2] },
  { id: 'flyingfish', name: '飞鱼', medium: 'air', shape: 'fish', color: '#7ec4c9', sizeRange: [12, 16], hp: 10, damage: 0, speed: 150, behavior: 'flee', group: 3, meatType: 'wing', meatRange: [2, 3] },
  { id: 'pelican', name: '鹈鹕', medium: 'air', shape: 'bird', color: '#d8cbb2', sizeRange: [22, 30], hp: 45, damage: 15, speed: 100, behavior: 'dive', group: 1, meatType: 'bite', meatRange: [3, 4], aggroRange: 700 },
  { id: 'eagle', name: '金雕', medium: 'air', shape: 'bird', color: '#a5763f', sizeRange: [26, 36], hp: 60, damage: 20, speed: 150, behavior: 'chase', group: 1, meatType: 'wing', meatRange: [4, 6], aggroRange: 1000 },
  // —— 岛屿 ——
  { id: 'crab', name: '螃蟹', medium: 'land', shape: 'crab', color: '#d9704a', sizeRange: [14, 20], hp: 25, damage: 8, speed: 35, behavior: 'wander', group: 1, meatType: 'limb', meatRange: [2, 3] },
  { id: 'seal', name: '海豹', medium: 'land', shape: 'fish', color: '#9b8b7a', sizeRange: [22, 30], hp: 45, damage: 10, speed: 60, behavior: 'wander', group: 1, meatType: 'vigor', meatRange: [3, 4] },
  { id: 'monitor', name: '巨蜥', medium: 'land', shape: 'fish', color: '#5f7a4a', sizeRange: [28, 40], hp: 90, damage: 18, speed: 90, behavior: 'chase', group: 1, meatType: 'limb', meatRange: [4, 6], aggroRange: 900 },
]

/** 可精英化的物种及其精英名（属性强化变种，独立调度刷新） */
export const ELITE_NAMES: Readonly<Record<string, string>> = {
  puffer: '爆弹河豚',
  poisonfish: '剧毒鲀王',
  eel: '雷霆电鳗',
  turtle: '玄武巨龟',
  lantern: '深渊灯笼鱼',
  shark: '噬血狂鲨',
  eagle: '风暴金雕',
  monitor: '暴君巨蜥',
}

export interface CreatureContext {
  world: World
  player: Player
  /** 玩家咬击瞬间（本帧）由场景置真，生物用于河豚应激 */
  playerBitNearby: boolean
  /** 飘字（精英技能提示） */
  floatText: (x: number, y: number, text: string, color: string) => void
}

let creatureSeq = 0

/**
 * 数据驱动的生物实体：行为 AI + 简单战斗属性 + 参数化绘制。
 * 受击/死亡由 WorldScene 判定并调用 hurt()/consume 肉生成。
 */
export class Creature {
  readonly uid = ++creatureSeq
  readonly species: SpeciesDef
  /** 精英变种：体型/生命/伤害/速度强化，掉肉与碎片更丰厚 */
  readonly elite: boolean
  x: number
  y: number
  vx = 0
  vy = 0
  readonly size: number
  hp: number
  readonly maxHp: number
  facing = 1
  /** 受击闪白剩余时间 */
  hurtFlash = 0
  /** 攻击动画剩余时间（张嘴/钳开合 + 前扑） */
  private attackAnim = 0
  /** 中毒剩余时间（玩家毒素） */
  private poisonTimer = 0
  /** 麻痹剩余时间（玩家电击） */
  private paralysisTimer = 0
  /** 冰缓剩余时间（玩家寒流）：移动速度大幅降低 */
  private slowTimer = 0
  /** 攻击冷却 */
  private attackCd = 0
  private wanderTimer = 0
  private wanderAngle = Math.random() * Math.PI * 2
  private animTime = Math.random() * 10
  /** 河豚鼓胀 0..1（平滑过渡） */
  private puff = 0
  private puffTimer = 0
  /** 电鳗充放电状态机 */
  private shockPhase: 'idle' | 'charge' | 'discharge' = 'idle'
  private shockTimer = 2 + Math.random() * 3
  /** 群锚点（小鱼群/海鸥群共享漂移中心） */
  groupAnchor: { x: number; y: number; vx: number; vy: number } | null = null
  /** 觅食目标（场景每帧设置的附近掉落肉块坐标），wander 生物优先游向 */
  foodTarget: { x: number; y: number } | null = null

  // —— 精英技能状态 ——
  /** 技能冷却 */
  private skillCd = 3 + Math.random() * 2
  /** 预警阶段计时（>0 时正在读条） */
  private skillWindup = 0
  /** 主动阶段计时（冲锋/俯冲进行中） */
  private skillActive = 0
  private dashVX = 0
  private dashVY = 0
  /** 冲刺方向（金雕俯冲朝释放时刻的玩家位置） */
  private dashTX = 0
  private dashTY = 0
  /** 血怒（噬血狂鲨）：一次性触发 */
  private enraged = false
  /** 血怒持续时间（>0 时速度/伤害加成生效） */
  private rageTimer = 0
  /** 剧毒鲀王毒雾区 */
  private poisonClouds: Array<{ x: number; y: number; r: number; t: number }> = []
  /** 暴君巨蜥毒涎弹 */
  private spitBalls: Array<{ x: number; y: number; vx: number; vy: number; t: number }> = []
  /** 自爆/诱饵等瞬时特效 */
  private bursts: Array<{ x: number; y: number; r: number; t: number; color: string }> = []
  /** 诱饵之光进行中（灯笼鱼） */
  private lureTimer = 0

  constructor(species: SpeciesDef, x: number, y: number, elite = false) {
    this.species = species
    this.x = x
    this.y = y
    this.elite = elite
    const [minSize, maxSize] = species.sizeRange
    const sizeK = elite ? 1.35 : 1
    this.size = (minSize + Math.random() * (maxSize - minSize)) * sizeK
    const hp = elite ? species.hp * 4 : species.hp
    this.hp = hp
    this.maxHp = hp
  }

  get alive(): boolean {
    return this.hp > 0
  }

  /** 当前实际碰撞/危险半径（河豚鼓胀时变大） */
  get radius(): number {
    return this.size * (1 + this.puff * 0.7)
  }

  /** 对玩家的伤害（精英强化 + 血怒 + 河豚鼓胀时增加） */
  get damage(): number {
    return (
      this.species.damage *
      (this.elite ? 1.7 : 1) *
      (this.rageTimer > 0 ? 1.35 : 1) *
      (1 + this.puff * 0.5)
    )
  }

  /** 该生物是否正在放电（电鳗 discharge 段） */
  get discharging(): boolean {
    return this.shockPhase === 'discharge'
  }

  get isPoisoned(): boolean {
    return this.poisonTimer > 0
  }

  get isParalyzed(): boolean {
    return this.paralysisTimer > 0
  }

  applyPoison(duration: number): void {
    this.poisonTimer = Math.max(this.poisonTimer, duration)
  }

  applyParalysis(duration: number): void {
    this.paralysisTimer = Math.max(this.paralysisTimer, duration)
  }

  applySlow(duration: number): void {
    this.slowTimer = Math.max(this.slowTimer, duration)
  }

  get isSlowed(): boolean {
    return this.slowTimer > 0
  }

  /** 受到伤害；返回是否成功（海龟减伤在内部计算） */
  hurt(dmg: number, fromX: number, fromY: number): number {
    let final = dmg
    if (this.species.special === 'shell') final *= 0.3
    // 玄武巨龟冲锋期间缩壳：近乎免伤
    if (this.elite && this.species.id === 'turtle' && this.skillActive > 0) final *= 0.2
    final = Math.max(1, Math.round(final))
    this.hp -= final
    this.hurtFlash = 0.18
    // 击退
    const dx = this.x - fromX
    const dy = this.y - fromY
    const dist = Math.max(1, Math.hypot(dx, dy))
    this.vx += (dx / dist) * 160
    this.vy += (dy / dist) * 160
    // 河豚应激鼓胀
    if (this.species.special === 'puff') this.puffTimer = 4
    return final
  }

  /** 环境持续伤害（灾害 DoT）：不经取整下限与击退，由场景统一清理死亡 */
  hurtEnvironment(dmg: number): void {
    this.hp -= dmg
  }

  /** 进食回血（吃掉落肉块） */
  heal(amount: number): void {
    this.hp = Math.min(this.maxHp, this.hp + amount)
  }

  /** 死亡掉肉数量 */
  meatDrops(): number {
    const [lo, hi] = this.species.meatRange
    const n = Math.round(lo + Math.random() * (hi - lo))
    const scale = this.size > 30 ? 2 : 1
    return n * scale * (this.elite ? 3 : 1)
  }

  update(dt: number, ctx: CreatureContext): void {
    this.animTime += dt
    this.hurtFlash = Math.max(0, this.hurtFlash - dt)
    this.attackCd = Math.max(0, this.attackCd - dt)
    this.attackAnim = Math.max(0, this.attackAnim - dt)
    this.slowTimer = Math.max(0, this.slowTimer - dt)

    const { world } = ctx
    // 玩家施加的状态效果
    if (this.poisonTimer > 0) {
      this.poisonTimer -= dt
      this.hp -= 3 * dt
    }
    if (this.paralysisTimer > 0) {
      // 麻痹：无行为，仅惯性漂移沉降
      this.paralysisTimer -= dt
      this.vx *= Math.pow(0.1, dt)
      this.vy *= Math.pow(0.1, dt)
      this.x += this.vx * dt
      this.y += this.vy * dt
      this.applyMediumConstraints(world)
      return
    }

    const { player } = ctx
    const dxp = player.x - this.x
    const dyp = player.y - this.y
    const distToPlayer = Math.hypot(dxp, dyp)
    // 玩家隐身时不再察觉玩家（不追不逃不充能）
    const aware = !player.stealthActive

    // —— 特殊机制状态机 ——
    if (this.species.special === 'puff') {
      const threat = distToPlayer < this.size + player.size + 90 || this.hurtFlash > 0 || (ctx.playerBitNearby && distToPlayer < 160)
      if (threat) this.puffTimer = Math.max(this.puffTimer, 2.5)
      this.puffTimer = Math.max(0, this.puffTimer - dt)
      const target = this.puffTimer > 0 ? 1 : 0
      this.puff += (target - this.puff) * Math.min(1, 6 * dt)
    }
    if (this.species.special === 'shock') {
      this.shockTimer -= dt
      // 玩家靠近时提前结束待机，进入充能（精英感应更远）
      const senseR = this.elite ? 800 : 650
      if (this.shockPhase === 'idle' && distToPlayer < senseR) this.shockTimer = Math.min(this.shockTimer, 0)
      if (this.shockPhase === 'idle' && this.shockTimer <= 0) {
        this.shockPhase = 'charge'
        this.shockTimer = 1.1
      } else if (this.shockPhase === 'charge' && this.shockTimer <= 0) {
        this.shockPhase = 'discharge'
        this.shockTimer = 0.55
      } else if (this.shockPhase === 'discharge' && this.shockTimer <= 0) {
        this.shockPhase = 'idle'
        this.shockTimer = 3 + Math.random() * 3
      }
    }

    // —— 行为 ——
    let targetVx = 0
    let targetVy = 0
    const sp =
      this.species.speed *
      (this.elite ? 1.12 : 1) *
      (this.rageTimer > 0 ? 1.4 : 1) *
      (this.slowTimer > 0 ? 0.35 : 1)

    if (this.species.behavior === 'flee' && aware && distToPlayer < 260 && player.y > world.waterY - 300) {
      // 逃离玩家
      const dist = Math.max(1, distToPlayer)
      targetVx = (-dxp / dist) * sp * 1.7
      targetVy = (-dyp / dist) * sp * 1.7
    } else if (
      aware &&
      this.species.behavior === 'chase' &&
      distToPlayer < (this.species.aggroRange ?? 500) * (this.elite ? 1.25 : 1)
    ) {
      // 追猎玩家：直线被岛遮挡时沿无遮挡的偏转方向前进，自然绕岛
      const baseAng = Math.atan2(dyp, dxp)
      let moveAng = baseAng
      if (segmentHitsBlocks(this.x, this.y, player.x, player.y, world.islands)) {
        const lookahead = 320
        let found = false
        for (const da of [0.6, -0.6, 1.1, -1.1, 1.6, -1.6]) {
          const a = baseAng + da
          const lx = this.x + Math.cos(a) * lookahead
          const ly = this.y + Math.sin(a) * lookahead
          if (!segmentHitsBlocks(this.x, this.y, lx, ly, world.islands)) {
            moveAng = a
            found = true
            break
          }
        }
        if (!found) moveAng = baseAng + Math.PI / 2
      }
      targetVx = Math.cos(moveAng) * sp * 1.35
      targetVy = Math.sin(moveAng) * sp * 1.35
    } else if (this.species.behavior === 'dive') {
      // 鹈鹕：平时盘旋，玩家接近水面时俯冲
      const playerNearSurface = player.y < world.waterY + 160
      if (
        aware &&
        distToPlayer < (this.species.aggroRange ?? 500) * (this.elite ? 1.25 : 1) &&
        playerNearSurface
      ) {
        const dist = Math.max(1, distToPlayer)
        targetVx = (dxp / dist) * sp * 2.4
        targetVy = (dyp / dist) * sp * 2.4
        if (this.y > world.waterY - 10) targetVy = -sp
      } else if (this.foodTarget) {
        // 盘旋时发现掉落肉块：俯下抢食
        const fx = this.foodTarget.x - this.x
        const fy = this.foodTarget.y - this.y
        const fd = Math.max(1, Math.hypot(fx, fy))
        targetVx = (fx / fd) * sp * 1.3
        targetVy = (fy / fd) * sp * 1.1
      } else {
        this.wander(dt, sp * 0.7)
        targetVx = Math.cos(this.wanderAngle) * sp * 0.7
        targetVy = Math.sin(this.wanderAngle) * sp * 0.2
        // 保持巡航高度
        const cruise = world.waterY - 260
        targetVy += clamp(-60, 60, (cruise - this.y) * 0.8)
      }
    } else {
      // wander（含群锚点吸引）；附近有掉落肉块时优先觅食
      if (this.foodTarget) {
        const fx = this.foodTarget.x - this.x
        const fy = this.foodTarget.y - this.y
        const fd = Math.max(1, Math.hypot(fx, fy))
        targetVx = (fx / fd) * sp * 1.15
        targetVy = (fy / fd) * sp * 0.85
      } else {
        this.wander(dt, sp)
        targetVx = Math.cos(this.wanderAngle) * sp
        targetVy = Math.sin(this.wanderAngle) * sp * 0.6
      }
      if (this.groupAnchor) {
        const ax = this.groupAnchor.x - this.x
        const ay = this.groupAnchor.y - this.y
        const ad = Math.hypot(ax, ay)
        if (ad > 90) {
          targetVx += (ax / ad) * sp * 0.8
          targetVy += (ay / ad) * sp * 0.8
        }
      }
    }

    // 电鳗充能阶段：向玩家逼近，为放电创造机会
    if (this.species.special === 'shock' && this.shockPhase === 'charge' && distToPlayer > 40) {
      const d = Math.max(1, distToPlayer)
      targetVx = (dxp / d) * sp * 1.25
      targetVy = (dyp / d) * sp * 1.25
    }

    const k = Math.min(1, 4 * dt)
    this.vx += (targetVx - this.vx) * k
    this.vy += (targetVy - this.vy) * k

    // 精英专属技能（可能在内部覆盖速度：读条急停/冲锋/俯冲）
    if (this.elite) this.updateEliteSkill(dt, ctx)

    this.x += this.vx * dt
    this.y += this.vy * dt

    this.applyMediumConstraints(world)
    if (Math.abs(this.vx) > 5) this.facing = this.vx < 0 ? -1 : 1
  }

  /** 精英专属技能：按物种分发；读条阶段急停，主动阶段可覆盖速度 */
  private updateEliteSkill(dt: number, ctx: CreatureContext): void {
    const { player } = ctx
    const dist = Math.hypot(player.x - this.x, player.y - this.y)
    this.skillCd -= dt
    if (this.rageTimer > 0) this.rageTimer -= dt

    // 区域效果（毒雾/毒涎弹/爆闪）任何阶段都在推进
    this.updateSkillAreas(dt, ctx)

    // 玩家隐身时不发起新技能（已读条的照常完成）
    if (player.stealthActive) return

    // 读条：急停蓄力
    if (this.skillWindup > 0) {
      this.skillWindup -= dt
      this.vx *= Math.pow(0.08, dt)
      this.vy *= Math.pow(0.08, dt)
      if (this.skillWindup > 0) return
      this.onSkillWindupEnd(ctx, dist)
      return
    }
    // 冲锋/俯冲进行中
    if (this.skillActive > 0) {
      this.skillActive -= dt
      this.vx = this.dashVX
      this.vy = this.dashVY
      const hitR = this.radius + player.size + 8
      if (
        (this.species.id === 'turtle' || this.species.id === 'eagle') &&
        Math.hypot(player.x - this.x, player.y - this.y) < hitR
      ) {
        this.skillActive = 0
        const dmg = this.species.id === 'turtle' ? 26 : 24
        player.hurt(dmg, this.x, this.y)
        const dx = player.x - this.x
        const dy = player.y - this.y
        const d = Math.max(1, Math.hypot(dx, dy))
        player.vx += (dx / d) * 380
        player.vy += (dy / d) * 380
        ctx.floatText(player.x, player.y - 34, this.species.id === 'turtle' ? '冲撞！' : '俯冲抓击！', '#ffd166')
      }
      if (this.skillActive <= 0) {
        this.vx *= 0.3
        this.vy *= 0.3
      }
      return
    }

    switch (this.species.id) {
      case 'puffer': // 爆弹河豚：自爆冲击
        if (this.skillCd <= 0 && dist < 260) {
          this.skillCd = 8
          this.skillWindup = 1.2
          ctx.floatText(this.x, this.y - this.size - 26, '充能……', '#ff9a4a')
        }
        break
      case 'poisonfish': // 剧毒鲀王：毒雾
        if (this.skillCd <= 0 && dist < 420) {
          this.skillCd = 7
          this.poisonClouds.push({ x: this.x, y: this.y, r: 105, t: 4 })
          this.bursts.push({ x: this.x, y: this.y, r: 130, t: 0.5, color: '#9b6ad6' })
          ctx.floatText(this.x, this.y - this.size - 26, '毒雾！', '#b07ae8')
        }
        break
      case 'eel': // 雷霆电鳗：连环放电（感应更远、电弧更强）
        if (this.discharging && this.skillCd <= 0 && dist < this.size + 210) {
          this.skillCd = 0.6
          player.hurt(8, this.x, this.y)
          player.applyParalysis(1.4)
          ctx.floatText(player.x, player.y - 34, '强电！', '#f0d040')
        }
        break
      case 'turtle': // 玄武巨龟：龟甲冲撞
        if (this.skillCd <= 0 && dist < 500 && dist > 80) {
          this.skillCd = 6.5
          this.skillWindup = 1
          ctx.floatText(this.x, this.y - this.size - 26, '缩壳蓄力……', '#cfe0d0')
        }
        break
      case 'lantern': // 深渊灯笼鱼：诱饵之光（拉拽 + 近身撕咬）
        if (this.lureTimer > 0) {
          this.lureTimer -= dt
          if (dist < 400) {
            const pull = 240 * dt
            player.vx += ((this.x - player.x) / Math.max(1, dist)) * pull
            player.vy += ((this.y - player.y) / Math.max(1, dist)) * pull
          }
          if (this.skillCd <= 0 && dist < this.radius + player.size + 30) {
            this.skillCd = 0.8
            player.hurt(12, this.x, this.y)
          }
        } else if (this.skillCd <= 0 && dist < 700) {
          this.skillCd = 6
          this.lureTimer = 2.5
          ctx.floatText(this.x, this.y - this.size - 26, '幽光诱饵……', '#a8e0ff')
        }
        break
      case 'shark': // 噬血狂鲨：血怒（半血一次性触发）
        if (!this.enraged && this.hp < this.maxHp * 0.5) {
          this.enraged = true
          this.rageTimer = 999
          ctx.floatText(this.x, this.y - this.size - 26, '血怒！', '#ff5a4a')
        }
        break
      case 'eagle': // 风暴金雕：俯冲抓击
        if (this.skillCd <= 0 && dist < 600) {
          this.skillCd = 5
          this.skillWindup = 0.6
        }
        break
      case 'monitor': // 暴君巨蜥：毒涎喷射
        if (this.skillCd <= 0 && dist < 550 && dist > 60) {
          this.skillCd = 4.5
          const d = Math.max(1, dist)
          this.spitBalls.push({
            x: this.x,
            y: this.y,
            vx: ((player.x - this.x) / d) * 360,
            vy: ((player.y - this.y) / d) * 360,
            t: 1.5,
          })
          ctx.floatText(this.x, this.y - this.size - 26, '毒涎！', '#8fd05a')
        }
        break
    }
  }

  /** 读条结束：按物种进入主动效果 */
  private onSkillWindupEnd(ctx: CreatureContext, dist: number): void {
    const { player } = ctx
    switch (this.species.id) {
      case 'puffer': {
        // 自爆：范围伤害 + 击退，自损但不死
        this.bursts.push({ x: this.x, y: this.y, r: 190, t: 0.45, color: '#ffb35c' })
        ctx.floatText(this.x, this.y - this.size - 26, '自爆！', '#ff9a4a')
        const d = Math.max(1, dist)
        if (dist < 170) {
          player.hurt(28, this.x, this.y)
          player.vx += ((player.x - this.x) / d) * 460
          player.vy += ((player.y - this.y) / d) * 460
        }
        this.hp = Math.max(1, this.hp - this.maxHp * 0.1)
        break
      }
      case 'turtle': {
        this.skillActive = 1.2
        const d = Math.max(1, dist)
        this.dashVX = ((player.x - this.x) / d) * 430
        this.dashVY = ((player.y - this.y) / d) * 430
        break
      }
      case 'eagle': {
        this.skillActive = 0.9
        this.dashTX = player.x
        this.dashTY = player.y
        const d = Math.max(1, Math.hypot(this.dashTX - this.x, this.dashTY - this.y))
        this.dashVX = ((this.dashTX - this.x) / d) * 480
        this.dashVY = ((this.dashTY - this.y) / d) * 480
        break
      }
    }
  }

  /** 毒雾 / 毒涎弹 / 爆闪的推进与命中 */
  private updateSkillAreas(dt: number, ctx: CreatureContext): void {
    const { player } = ctx
    for (let i = this.poisonClouds.length - 1; i >= 0; i--) {
      const c = this.poisonClouds[i]
      c.t -= dt
      c.r += 12 * dt
      if (c.t <= 0) {
        this.poisonClouds.splice(i, 1)
        continue
      }
      if (Math.hypot(player.x - c.x, player.y - c.y) < c.r) {
        player.applyPoison(2)
        player.hurtEnvironment(6 * dt)
      }
    }
    for (let i = this.spitBalls.length - 1; i >= 0; i--) {
      const b = this.spitBalls[i]
      b.t -= dt
      b.x += b.vx * dt
      b.y += b.vy * dt
      if (b.t <= 0) {
        this.spitBalls.splice(i, 1)
        continue
      }
      if (Math.hypot(player.x - b.x, player.y - b.y) < player.size + 10) {
        this.spitBalls.splice(i, 1)
        player.hurt(14, b.x, b.y)
        player.applyPoison(2.5)
        ctx.floatText(player.x, player.y - 34, '中毒！', '#8fd05a')
      }
    }
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      this.bursts[i].t -= dt
      if (this.bursts[i].t <= 0) this.bursts.splice(i, 1)
    }
  }

  private wander(dt: number, _sp: number): void {
    this.wanderTimer -= dt
    if (this.wanderTimer <= 0) {
      this.wanderTimer = 2 + Math.random() * 3
      this.wanderAngle += (Math.random() - 0.5) * 1.4
    }
  }

  /** 按活动介质约束位置：水生不出水、空中不潜水、陆生贴岛顶 */
  private applyMediumConstraints(world: World): void {
    const m = this.species.medium
    if (m === 'water') {
      if (this.y < world.waterY + this.size) {
        this.y = world.waterY + this.size
        this.vy = Math.abs(this.vy)
      }
    } else if (m === 'air') {
      if (this.y > world.waterY - this.size * 0.5) {
        this.y = world.waterY - this.size * 0.5
        this.vy = Math.min(0, this.vy)
      }
      if (this.y < 60 + this.size) {
        this.y = 60 + this.size
        this.vy = Math.abs(this.vy)
      }
    } else {
      // 陆生：贴最近岛顶横行，走到岛边缘折返
      const top = groundTopAt(world.islands, this.x, world.waterY)
      if (top === null) {
        // 出岛了：掉头并回拉
        this.vx = -this.vx
        this.x += this.vx * 0.12
      } else {
        const groundY = top - this.size * 0.7
        this.y += (groundY - this.y) * 0.25
        this.vy = 0
      }
    }
    this.x = clamp(this.size, world.width - this.size, this.x)
    if (this.y > world.height - this.size) {
      this.y = world.height - this.size
      this.vy = -Math.abs(this.vy)
    }
    // 水生生物不穿岛：被推出时沿岛缘切向滑动 + 停滞检测绕行
    if (m === 'water') {
      const r = this.size * 0.8
      let pushed = false
      const res = resolveCircleVsBlocks(this.x, this.y, r, world.islands, (nx, ny) => {
        pushed = true
        const tx = -ny
        const ty = nx
        const dot = this.vx * tx + this.vy * ty
        this.vx = tx * dot * 1.3 + nx * 30
        this.vy = ty * dot * 1.3 + ny * 30
      })
      if (pushed) {
        this.x = res.x
        this.y = res.y
      }
    }
  }

  /** 生物对玩家的接触攻击（含毒/电）；由 WorldScene 在接触时调用 */
  tryAttackPlayer(player: Player): void {
    if (this.attackCd > 0 || this.species.damage <= 0) return
    this.attackCd = 1.2
    this.attackAnim = 0.35
    const dmg = this.damage
    if (this.species.special === 'poison') {
      player.hurt(dmg, this.x, this.y)
      player.applyPoison(3)
    } else {
      player.hurt(dmg, this.x, this.y)
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    const s = this.size * (1 + this.puff * 0.55)
    const speedK = clamp(0, 1, Math.hypot(this.vx, this.vy) / Math.max(1, this.species.speed))
    const mouth = this.attackAnim > 0 ? Math.sin(Math.PI * (1 - this.attackAnim / 0.35)) : 0
    const charge = this.shockPhase === 'charge' ? clamp(0, 1, 1 - this.shockTimer / 1.1) : 0
    ctx.save()
    // 精英光环：金色脉动（随身体镜像绘制在生物之下）
    if (this.elite) {
      const pulse = 0.6 + 0.4 * Math.sin(this.animTime * 3)
      ctx.strokeStyle = `rgba(255, 210, 90, ${0.45 + 0.35 * pulse})`
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(this.x, this.y, s * 1.55 + pulse * 4, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fillStyle = `rgba(255, 210, 90, ${0.1 + 0.07 * pulse})`
      ctx.beginPath()
      ctx.arc(this.x, this.y, s * 1.55, 0, Math.PI * 2)
      ctx.fill()
      // 血怒红环（噬血狂鲨狂暴中）
      if (this.rageTimer > 0) {
        ctx.strokeStyle = `rgba(255, 70, 50, ${0.5 + 0.4 * Math.sin(this.animTime * 12)})`
        ctx.lineWidth = 4
        ctx.beginPath()
        ctx.arc(this.x, this.y, s * 1.9, 0, Math.PI * 2)
        ctx.stroke()
      }
    }
    // 冲锋/俯冲拖影
    if (this.skillActive > 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.14)'
      ctx.beginPath()
      ctx.ellipse(this.x - this.vx * 0.05, this.y - this.vy * 0.05, s * 1.1, s * 0.8, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.translate(this.x, this.y)
    // 攻击动画：前扑位移
    if (mouth > 0.02) ctx.translate(this.facing * s * 0.3 * mouth, 0)
    ctx.scale(this.facing, 1)
    drawSpecies(ctx, this.species.id, {
      s,
      t: this.animTime,
      k: speedK,
      mouth,
      puff: this.puff,
      hurt: this.hurtFlash > 0,
      charge,
      discharge: this.discharging,
    })
    ctx.restore()

    // 玩家施加的状态特效（中毒绿泡 / 麻痹电弧 / 冰缓冰晶，不随朝向镜像）
    if (this.isSlowed) {
      ctx.strokeStyle = 'rgba(168, 223, 240, 0.7)'
      ctx.lineWidth = 1.5
      for (let i = 0; i < 4; i++) {
        const a = this.animTime * 1.2 + i * 1.57
        ctx.beginPath()
        ctx.moveTo(this.x + Math.cos(a) * this.size * 0.9, this.y + Math.sin(a) * this.size * 0.9)
        ctx.lineTo(this.x + Math.cos(a) * this.size * 1.25, this.y + Math.sin(a) * this.size * 1.25)
        ctx.moveTo(
          this.x + Math.cos(a) * this.size * 1.25,
          this.y + Math.sin(a) * this.size * 0.9,
        )
        ctx.lineTo(
          this.x + Math.cos(a) * this.size * 0.9,
          this.y + Math.sin(a) * this.size * 1.25,
        )
        ctx.stroke()
      }
    }
    if (this.isPoisoned) {
      ctx.fillStyle = 'rgba(120, 220, 110, 0.7)'
      for (let i = 0; i < 3; i++) {
        const ph = this.animTime * 2.5 + i * 2.1
        ctx.beginPath()
        ctx.arc(
          this.x + Math.sin(ph) * this.size * 0.8,
          this.y - this.size * 0.9 - ((ph % 1.6) * this.size * 0.7),
          3,
          0,
          Math.PI * 2,
        )
        ctx.fill()
      }
    }
    if (this.isParalyzed) {
      ctx.strokeStyle = `rgba(240, 208, 64, ${0.5 + 0.5 * Math.sin(this.animTime * 40)})`
      ctx.lineWidth = 2
      for (let i = 0; i < 3; i++) {
        const a = this.animTime * 30 + i * 2.1
        ctx.beginPath()
        ctx.moveTo(this.x + Math.cos(a) * this.size, this.y + Math.sin(a) * this.size)
        ctx.lineTo(this.x + Math.cos(a + 0.6) * this.size * 1.4, this.y + Math.sin(a + 0.6) * this.size * 1.4)
        ctx.stroke()
      }
    }

    // 放电光环（不随朝向镜像）
    if (this.discharging) {
      ctx.strokeStyle = `rgba(240, 208, 64, ${0.5 + 0.5 * Math.sin(this.animTime * 40)})`
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(this.x, this.y, this.size + 110, 0, Math.PI * 2)
      ctx.stroke()
    }
    // 血条（受损才显示）
    if (this.hp < this.maxHp) {
      const w = this.size * 2
      ctx.fillStyle = 'rgba(0,0,0,0.45)'
      ctx.fillRect(this.x - w / 2, this.y - this.size - 14, w, 5)
      ctx.fillStyle = '#e2564a'
      ctx.fillRect(this.x - w / 2, this.y - this.size - 14, w * Math.max(0, this.hp / this.maxHp), 5)
    }
    // 精英名牌（血条上方，金色）
    if (this.elite) {
      const eliteName = ELITE_NAMES[this.species.id] ?? `精英${this.species.name}`
      ctx.font = 'bold 13px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillStyle = 'rgba(255, 210, 90, 0.95)'
      ctx.fillText(eliteName, this.x, this.y - this.size - 22)
      ctx.textAlign = 'left'
      // 技能读条警示环（充能中）
      if (this.skillWindup > 0) {
        ctx.strokeStyle = `rgba(255, 120, 70, ${0.6 + 0.4 * Math.sin(this.animTime * 24)})`
        ctx.lineWidth = 4
        ctx.beginPath()
        ctx.arc(this.x, this.y, s * 1.8, 0, Math.PI * 2)
        ctx.stroke()
      }
    }

    // 精英技能区域特效（世界坐标，不随镜像）
    // 诱饵之光：头顶光柱 + 光晕
    if (this.lureTimer > 0) {
      const glow = 0.5 + 0.3 * Math.sin(this.animTime * 5)
      const beam = ctx.createLinearGradient(0, this.y - 340, 0, this.y)
      beam.addColorStop(0, 'rgba(140, 210, 255, 0)')
      beam.addColorStop(1, `rgba(140, 210, 255, ${0.3 * glow})`)
      ctx.fillStyle = beam
      ctx.fillRect(this.x - 9, this.y - 340, 18, 340)
      ctx.fillStyle = `rgba(190, 230, 255, ${glow})`
      ctx.beginPath()
      ctx.arc(this.x, this.y - this.size - 8, 6 + glow * 3, 0, Math.PI * 2)
      ctx.fill()
    }
    // 毒雾
    for (const c of this.poisonClouds) {
      const a = Math.min(0.45, c.t / 4 + 0.15)
      const g = ctx.createRadialGradient(c.x, c.y, c.r * 0.2, c.x, c.y, c.r)
      g.addColorStop(0, `rgba(155, 106, 214, ${a})`)
      g.addColorStop(1, 'rgba(155, 106, 214, 0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2)
      ctx.fill()
    }
    // 毒涎弹
    for (const b of this.spitBalls) {
      ctx.fillStyle = '#8fd05a'
      ctx.beginPath()
      ctx.arc(b.x, b.y, 7, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(143, 208, 90, 0.4)'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(b.x, b.y)
      ctx.lineTo(b.x - b.vx * 0.06, b.y - b.vy * 0.06)
      ctx.stroke()
    }
    // 爆闪扩散环
    for (const bu of this.bursts) {
      const k = 1 - bu.t / 0.5
      ctx.strokeStyle = bu.color
      ctx.globalAlpha = 1 - k
      ctx.lineWidth = 5
      ctx.beginPath()
      ctx.arc(bu.x, bu.y, bu.r * (0.3 + k * 0.8), 0, Math.PI * 2)
      ctx.stroke()
      ctx.globalAlpha = 1
    }
  }

}

