import { clamp } from '../core/math'
import type { AbilityKind } from '../systems/Abilities'
import type { World } from '../world/World'
import type { Player } from './Player'

export interface BossDef {
  id: string
  name: string
  /** 巢穴与巡逻中心 */
  home: { x: number; y: number }
  size: number
  baseHp: number
  baseDamage: number
  meatType: AbilityKind
  medium: 'water' | 'air' | 'land'
}

/** 四大区域 Boss：强度按玩家平均能力等级缩放 */
export const BOSS_DEFS: ReadonlyArray<BossDef> = [
  { id: 'kraken', name: '深海巨乌贼', home: { x: 6500, y: 5200 }, size: 95, baseHp: 420, baseDamage: 18, meatType: 'shock', medium: 'water' },
  { id: 'thunderbird', name: '雷鸟', home: { x: 12200, y: 1100 }, size: 82, baseHp: 340, baseDamage: 16, meatType: 'wing', medium: 'air' },
  { id: 'kingturtle', name: '石甲龟王', home: { x: 14300, y: 2080 }, size: 100, baseHp: 560, baseDamage: 20, meatType: 'armor', medium: 'land' },
  { id: 'ancientshark', name: '远古鲨王', home: { x: 500, y: 3100 }, size: 86, baseHp: 460, baseDamage: 24, meatType: 'bite', medium: 'water' },
]

export interface BossContext {
  world: World
  player: Player
  /** 召唤小怪（雷鸟海鸥/鲨王鲨鱼） */
  summon: (speciesId: string, x: number, y: number) => void
  /** 震屏（龟王践踏） */
  shake: (strength: number) => void
  /** 提示消息 */
  message: (text: string) => void
  /** 飘字 */
  floatText: (x: number, y: number, text: string, color: string) => void
}

interface InkCloud {
  x: number
  y: number
  r: number
  t: number
}

/** 雷暴区（雷鸟俯冲落点）：持续麻痹与灼烧 */
interface StormZone {
  x: number
  y: number
  r: number
  t: number
}

/** 冲击波环（龟王践踏）：沿地面扩散的环形伤害带 */
interface ShockRing {
  x: number
  y: number
  r: number
  t: number
  hit: boolean
}

let bossSeq = 0

export class Boss {
  readonly uid = ++bossSeq
  readonly def: BossDef
  x: number
  y: number
  vx = 0
  vy = 0
  hp: number
  maxHp: number
  readonly size: number
  facing = 1
  hurtFlash = 0
  /** dormant 待机（玩家远）/ active 战斗 / dead 重生计时 */
  state: 'dormant' | 'active' | 'dead' = 'dormant'
  respawnTimer = 0
  private animTime = Math.random() * 10
  private touchCd = 0
  private skillCd = 2
  private inkClouds: InkCloud[] = []
  private stormZones: StormZone[] = []
  private shockRings: ShockRing[] = []
  /** 冲刺/俯冲状态 */
  private dashPhase: 'none' | 'windup' | 'dash' = 'none'
  private dashTimer = 0
  private dashVX = 0
  private dashVY = 0
  /** 龟王缩壳 */
  private shellTimer = 0
  private shellCd = 0
  /** 鲨王召唤一次标记 */
  private summoned = false
  /** 已向玩家宣告过 */
  private announced = false
  /** 玩家施加的中毒/麻痹 */
  private poisonTimer = 0
  private paralysisTimer = 0

  constructor(def: BossDef, avgPlayerLv: number) {
    this.def = def
    this.x = def.home.x
    this.y = def.home.y
    this.size = def.size
    const scale = 1 + 0.22 * avgPlayerLv
    this.maxHp = Math.round(def.baseHp * scale)
    this.hp = this.maxHp
  }

  get alive(): boolean {
    return this.hp > 0
  }

  get radius(): number {
    return this.size
  }

  /** 受伤；龟王高甲（缩壳时近乎免疫）；返回实际伤害 */
  hurt(dmg: number, fromX: number, fromY: number): number {
    let final = dmg
    if (this.def.id === 'kingturtle') final *= this.shellTimer > 0 ? 0.05 : 0.2
    final = Math.max(1, Math.round(final))
    this.hp -= final
    this.hurtFlash = 0.18
    const dx = this.x - fromX
    const dy = this.y - fromY
    const dist = Math.max(1, Math.hypot(dx, dy))
    this.vx += (dx / dist) * 40
    this.vy += (dy / dist) * 40
    return final
  }

  /** 死亡掉肉与碎片数量 */
  dropCounts(): { meat: number; shards: number } {
    return { meat: 10 + Math.floor(Math.random() * 5), shards: 3 + Math.floor(Math.random() * 3) }
  }

  applyPoison(duration: number): void {
    this.poisonTimer = Math.max(this.poisonTimer, duration)
  }

  applyParalysis(duration: number): void {
    this.paralysisTimer = Math.max(this.paralysisTimer, duration)
  }

  update(dt: number, ctx: BossContext): void {
    this.animTime += dt
    this.hurtFlash = Math.max(0, this.hurtFlash - dt)
    this.touchCd = Math.max(0, this.touchCd - dt)
    this.skillCd = Math.max(0, this.skillCd - dt)

    // 玩家施加的状态效果
    if (this.poisonTimer > 0) {
      this.poisonTimer -= dt
      this.hp -= 3 * dt
    }
    if (this.paralysisTimer > 0) {
      this.paralysisTimer -= dt
      this.vx *= Math.pow(0.08, dt)
      this.vy *= Math.pow(0.08, dt)
      this.x += this.vx * dt
      this.y += this.vy * dt
      this.applyMedium(ctx.world)
      return
    }

    if (this.state === 'dead') {
      this.respawnTimer -= dt
      if (this.respawnTimer <= 0) this.revive(ctx)
      return
    }

    const { player, world } = ctx
    const dist = Math.hypot(player.x - this.x, player.y - this.y)

    // 状态切换：靠近激活 / 远离回巢
    if (this.state === 'dormant') {
      if (dist < 900) {
        this.state = 'active'
        if (!this.announced) {
          this.announced = true
          ctx.message(`${this.def.name} 苏醒了！`)
          ctx.shake(0.5)
        }
      } else {
        this.announced = false
        // 待机：在巢穴附近缓浮
        this.driftHome(dt, 20)
        return
      }
    } else if (dist > 1600) {
      this.state = 'dormant'
      this.hp = Math.max(this.hp, Math.round(this.maxHp * 0.5))
      return
    }

    // 玩家隐身：Boss 丢失目标，返回巢穴徘徊
    if (player.stealthActive) {
      this.driftHome(dt, 30)
      this.applyMedium(ctx.world)
      return
    }

    switch (this.def.id) {
      case 'kraken':
        this.updateKraken(dt, ctx, dist)
        break
      case 'thunderbird':
        this.updateThunderbird(dt, ctx, dist)
        break
      case 'kingturtle':
        this.updateKingTurtle(dt, ctx, dist)
        break
      case 'ancientshark':
        this.updateAncientShark(dt, ctx, dist)
        break
    }

    // 通用接触伤害
    if (this.touchCd <= 0 && dist < this.radius + player.size) {
      this.touchCd = 1.5
      player.hurt(this.def.baseDamage, this.x, this.y)
      ctx.floatText(player.x, player.y - 30, `${this.def.name}！`, '#ff8866')
    }

    // 位移与介质约束
    this.x += this.vx * dt
    this.y += this.vy * dt
    this.applyMedium(world)
    if (Math.abs(this.vx) > 5) this.facing = this.vx < 0 ? -1 : 1

    // 墨云：带毒（遮蔽 + 持续伤害）
    for (let i = this.inkClouds.length - 1; i >= 0; i--) {
      const ink = this.inkClouds[i]
      ink.t -= dt
      ink.r += 40 * dt
      ink.x += 20 * dt
      if (ink.t <= 0) {
        this.inkClouds.splice(i, 1)
        continue
      }
      if (Math.hypot(player.x - ink.x, player.y - ink.y) < ink.r) {
        player.hurtEnvironment(4 * dt)
      }
    }
    // 雷暴区：麻痹累积 + 灼烧
    for (let i = this.stormZones.length - 1; i >= 0; i--) {
      const st = this.stormZones[i]
      st.t -= dt
      if (st.t <= 0) {
        this.stormZones.splice(i, 1)
        continue
      }
      if (Math.hypot(player.x - st.x, player.y - st.y) < st.r) {
        player.applyParalysis(0.25)
        player.hurtEnvironment(10 * dt)
      }
    }
    // 冲击波环：扩散命中一次（击飞）
    for (let i = this.shockRings.length - 1; i >= 0; i--) {
      const ring = this.shockRings[i]
      ring.t -= dt
      ring.r += 620 * dt
      if (ring.t <= 0 || ring.r > 300) {
        this.shockRings.splice(i, 1)
        continue
      }
      if (!ring.hit) {
        const d = Math.hypot(player.x - ring.x, player.y - ring.y)
        if (Math.abs(d - ring.r) < 40 && player.state !== 'swim') {
          ring.hit = true
          player.hurt(this.def.baseDamage, ring.x, ring.y)
          player.vy = -420
          ctx.floatText(player.x, player.y - 34, '震飞！', '#c9b45a')
        }
      }
    }
  }

  private driftHome(dt: number, speed: number): void {
    const dx = this.def.home.x - this.x
    const dy = this.def.home.y - this.y
    const d = Math.max(1, Math.hypot(dx, dy))
    if (d > 60) {
      this.vx += ((dx / d) * speed - this.vx) * Math.min(1, 2 * dt)
      this.vy += ((dy / d) * speed - this.vy) * Math.min(1, 2 * dt)
    } else {
      this.vx *= Math.pow(0.1, dt)
      this.vy *= Math.pow(0.1, dt)
    }
    this.x += this.vx * dt
    this.y += this.vy * dt
    if (Math.abs(this.vx) > 5) this.facing = this.vx < 0 ? -1 : 1
  }

  /** 巨乌贼：缓追 + 触手缠绕（麻痹）+ 喷墨遮蔽 */
  private updateKraken(dt: number, ctx: BossContext, dist: number): void {
    const { player } = ctx
    const k = Math.min(1, 1.6 * dt)
    const sp = 46
    const dx = (player.x - this.x) / Math.max(1, dist)
    const dy = (player.y - this.y) / Math.max(1, dist)
    this.vx += (dx * sp - this.vx) * k
    this.vy += (dy * sp + Math.sin(this.animTime * 1.5) * 12 - this.vy) * k

    if (this.skillCd <= 0 && dist < this.size + 160) {
      // 触手缠绕：深度麻痹 + 拖拽
      this.skillCd = 3.2
      player.hurt(this.def.baseDamage * 1.2, this.x, this.y)
      player.applyParalysis(2)
      const d = Math.max(1, dist)
      player.vx += ((this.x - player.x) / d) * 200
      player.vy += ((this.y - player.y) / d) * 200
      ctx.floatText(player.x, player.y - 40, '被触手缠绕！', '#c9a8ec')
    }
    if (this.skillCd <= 0 && dist < 620 && dist >= this.size + 160) {
      // 喷墨
      this.skillCd = 8
      for (let i = 0; i < 5; i++) {
        this.inkClouds.push({
          x: this.x + (Math.random() - 0.5) * 80,
          y: this.y + (Math.random() - 0.5) * 60,
          r: 40 + Math.random() * 30,
          t: 3.5 + Math.random() * 1.5,
        })
      }
      ctx.floatText(this.x, this.y - this.size - 20, '喷墨！', '#8899aa')
    }
  }

  /** 雷鸟：绕巢盘旋 → 预警 → 雷击俯冲 → 拉起；周期召唤海鸥 */
  private updateThunderbird(dt: number, ctx: BossContext, dist: number): void {
    const { player } = ctx
    if (this.dashPhase === 'none') {
      // 盘旋
      const a = this.animTime * 0.6
      const tx = this.def.home.x + Math.cos(a) * 320
      const ty = this.def.home.y + Math.sin(a) * 130
      this.vx += ((tx - this.x) * 1.2 - this.vx) * Math.min(1, 2.5 * dt)
      this.vy += ((ty - this.y) * 1.2 - this.vy) * Math.min(1, 2.5 * dt)
      // 召唤
      if (this.skillCd <= 0 && dist < 800) {
        this.skillCd = 15
        ctx.summon('seagull', this.x + 70, this.y - 40)
        ctx.summon('seagull', this.x - 70, this.y - 40)
        ctx.summon('seagull', this.x, this.y - 90)
        ctx.floatText(this.x, this.y - this.size, '召唤海鸥！', '#e8e2d0')
      }
      // 进入俯冲
      if (dist < 750 && this.skillCd > 2 && player.y < ctx.world.waterY + 200) {
        this.dashPhase = 'windup'
        this.dashTimer = 0.8
      }
    } else if (this.dashPhase === 'windup') {
      this.dashTimer -= dt
      this.vx *= Math.pow(0.1, dt)
      this.vy *= Math.pow(0.1, dt)
      if (this.dashTimer <= 0) {
        this.dashPhase = 'dash'
        this.dashTimer = 1.1
        const d = Math.max(1, dist)
        this.dashVX = ((player.x - this.x) / d) * 520
        this.dashVY = ((player.y - this.y) / d) * 520
        ctx.shake(0.3)
      }
    } else {
      // 俯冲：命中或冲程结束都在终点留下雷暴区
      this.dashTimer -= dt
      this.vx = this.dashVX
      this.vy = this.dashVY
      if (Math.hypot(player.x - this.x, player.y - this.y) < this.size + player.size + 30) {
        player.hurt(this.def.baseDamage * 1.2, this.x, this.y)
        player.applyParalysis(1)
        ctx.floatText(player.x, player.y - 40, '雷击俯冲！', '#f0d040')
      }
      if (this.dashTimer <= 0) {
        this.dashPhase = 'none'
        this.stormZones.push({ x: this.x, y: this.y, r: 140, t: 2 })
        ctx.shake(0.4)
        ctx.floatText(this.x, this.y - this.size, '落雷区！', '#f0d040')
      }
    }
  }

  /** 石甲龟王：岛顶巡行 + 践踏震屏；半血后周期缩壳 */
  private updateKingTurtle(dt: number, ctx: BossContext, dist: number): void {
    const { player, world } = ctx
    if (this.shellTimer > 0) {
      this.shellTimer -= dt
      this.vx *= Math.pow(0.05, dt)
      return
    }
    // 岛顶左右巡行
    const patrolW = 380
    const tx = this.def.home.x + Math.sin(this.animTime * 0.35) * patrolW
    const groundY = this.groundYAt(world, tx)
    this.vx += ((tx - this.x) * 0.9 - this.vx) * Math.min(1, 2 * dt)
    if (groundY !== null) this.y += (groundY - this.size * 0.55 - this.y) * Math.min(1, 3 * dt)
    this.vy = 0
    // 践踏：冲击波环沿地面扩散（范围更远，可被跳起躲避）
    if (this.skillCd <= 0 && dist < this.size + 300 && player.state !== 'swim') {
      this.skillCd = 4
      ctx.shake(0.7)
      this.shockRings.push({ x: this.x, y: this.y, r: 40, t: 0.45, hit: false })
      ctx.floatText(this.x, this.y - this.size - 30, '践踏！', '#c9b45a')
    }
    // 半血缩壳
    this.shellCd -= dt
    if (this.hp < this.maxHp * 0.5 && this.shellCd <= 0) {
      this.shellCd = 12
      this.shellTimer = 3
      ctx.floatText(this.x, this.y - this.size - 20, '缩入甲壳…', '#9aa7b0')
    }
  }

  /** 远古鲨王：绕巢巡逻 → 预警 → 高速冲刺；半血召唤鲨群 */
  private updateAncientShark(dt: number, ctx: BossContext, dist: number): void {
    const { player } = ctx
    if (this.dashPhase === 'none') {
      const a = this.animTime * 0.45
      const tx = this.def.home.x + Math.cos(a) * 520
      const ty = this.def.home.y + Math.sin(a) * 260
      this.vx += ((tx - this.x) * 0.8 - this.vx) * Math.min(1, 2 * dt)
      this.vy += ((ty - this.y) * 0.8 - this.vy) * Math.min(1, 2 * dt)
      if (this.skillCd <= 0 && dist < 900) {
        this.skillCd = 6
        this.dashPhase = 'windup'
        this.dashTimer = 0.6
        ctx.floatText(this.x, this.y - this.size, '锁定目标…', '#ff8866')
      }
    } else if (this.dashPhase === 'windup') {
      this.dashTimer -= dt
      this.vx *= Math.pow(0.1, dt)
      this.vy *= Math.pow(0.1, dt)
      if (this.dashTimer <= 0) {
        this.dashPhase = 'dash'
        this.dashTimer = 1.4
        const d = Math.max(1, dist)
        this.dashVX = ((player.x - this.x) / d) * 720
        this.dashVY = ((player.y - this.y) / d) * 720
      }
    } else {
      this.dashTimer -= dt
      this.vx = this.dashVX
      this.vy = this.dashVY
      if (Math.hypot(player.x - this.x, player.y - this.y) < this.size + player.size + 20) {
        player.hurt(this.def.baseDamage * 1.5, this.x, this.y)
        ctx.floatText(player.x, player.y - 40, '巨口撕咬！', '#ff8866')
      }
      if (this.dashTimer <= 0) this.dashPhase = 'none'
    }
    // 半血召唤鲨群（一次）
    if (!this.summoned && this.hp < this.maxHp * 0.5) {
      this.summoned = true
      ctx.summon('shark', this.x - 90, this.y)
      ctx.summon('shark', this.x + 90, this.y)
      ctx.summon('shark', this.x, this.y - 70)
      ctx.floatText(this.x, this.y - this.size - 20, '召唤鲨群！', '#ff8866')
    }
  }

  private groundYAt(world: World, x: number): number | null {
    let top: number | null = null
    for (const b of world.islands) {
      if (b.y >= world.waterY) continue
      if (x >= b.x && x <= b.x + b.w) {
        if (top === null || b.y < top) top = b.y
      }
    }
    return top
  }

  private applyMedium(world: World): void {
    if (this.def.medium === 'water') {
      if (this.y < world.waterY + this.size * 0.4) {
        this.y = world.waterY + this.size * 0.4
        this.vy = Math.abs(this.vy) * 0.5
      }
      if (this.y > world.height - this.size * 0.5) {
        this.y = world.height - this.size * 0.5
        this.vy = -Math.abs(this.vy) * 0.5
      }
    } else if (this.def.medium === 'air') {
      if (this.y > world.waterY - this.size * 0.3) {
        this.y = world.waterY - this.size * 0.3
        this.vy = Math.min(0, this.vy)
      }
      if (this.y < 100) {
        this.y = 100
        this.vy = Math.abs(this.vy)
      }
    }
    this.x = clamp(this.size, world.width - this.size, this.x)
  }

  private revive(ctx: BossContext): void {
    void ctx
    this.state = 'dormant'
    this.hp = this.maxHp
    this.x = this.def.home.x
    this.y = this.def.home.y
    this.summoned = false
    this.announced = false
  }

  render(ctx: CanvasRenderingContext2D): void {
    if (this.state === 'dead') return
    const s = this.size
    ctx.save()
    ctx.translate(this.x, this.y)
    ctx.scale(this.facing, 1)
    const white = this.hurtFlash > 0
    const windup = this.dashPhase === 'windup'

    switch (this.def.id) {
      case 'kraken':
        this.renderKraken(ctx, s, white)
        break
      case 'thunderbird':
        this.renderThunderbird(ctx, s, white, windup)
        break
      case 'kingturtle':
        this.renderKingTurtle(ctx, s, white)
        break
      case 'ancientshark':
        this.renderAncientShark(ctx, s, white, windup)
        break
    }
    ctx.restore()

    // 头顶名牌（战斗亮红 / 沉睡暗灰）
    const dormant = this.state === 'dormant'
    ctx.font = `bold ${Math.round(s * 0.22)}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.fillStyle = dormant ? 'rgba(180, 185, 195, 0.7)' : 'rgba(255, 108, 84, 0.95)'
    ctx.fillText(
      `${dormant ? '沉睡·' : ''}${this.def.name}`,
      this.x,
      this.y - s * 1.5 - 8,
    )
    ctx.textAlign = 'left'

    // 墨云（世界层，带毒）
    for (const ink of this.inkClouds) {
      ctx.fillStyle = `rgba(10, 14, 20, ${Math.min(0.6, ink.t / 4)})`
      ctx.beginPath()
      ctx.arc(ink.x, ink.y, ink.r, 0, Math.PI * 2)
      ctx.fill()
      // 毒性紫边
      ctx.strokeStyle = `rgba(155, 106, 214, ${Math.min(0.4, ink.t / 10)})`
      ctx.lineWidth = 3
      ctx.stroke()
    }
    // 雷暴区：电光地网
    for (const st of this.stormZones) {
      const flick = 0.35 + 0.3 * Math.sin(this.animTime * 26 + st.x)
      ctx.fillStyle = `rgba(240, 220, 80, ${0.1 * flick})`
      ctx.beginPath()
      ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = `rgba(240, 230, 120, ${flick})`
      ctx.lineWidth = 2
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + this.animTime * 3
        ctx.beginPath()
        ctx.moveTo(st.x + Math.cos(a) * st.r * 0.2, st.y + Math.sin(a) * st.r * 0.2)
        ctx.lineTo(st.x + Math.cos(a + 0.5) * st.r * 0.7, st.y + Math.sin(a + 0.5) * st.r * 0.7)
        ctx.stroke()
      }
    }
    // 冲击波环
    for (const ring of this.shockRings) {
      ctx.strokeStyle = `rgba(220, 190, 110, ${Math.max(0, ring.t / 0.45)})`
      ctx.lineWidth = 10
      ctx.beginPath()
      ctx.ellipse(ring.x, ring.y, ring.r, ring.r * 0.45, 0, 0, Math.PI * 2)
      ctx.stroke()
    }
  }

  /** 巨乌贼：钟形头冠 + 大眼 + 八条波浪触手 */
  private renderKraken(ctx: CanvasRenderingContext2D, s: number, white: boolean): void {
    const t = this.animTime
    // 触手（8 条，相位差摆动）
    ctx.lineCap = 'round'
    for (let i = 0; i < 8; i++) {
      const baseA = Math.PI * 0.25 + (i / 7) * Math.PI * 1.5
      const sway = Math.sin(t * 2.2 + i * 1.3) * 0.35
      const len = s * (1.5 + (i % 3) * 0.25)
      const midA = baseA + sway * 0.6
      const tipA = baseA + sway
      ctx.strokeStyle = white ? '#e8d5e0' : i % 2 === 0 ? '#7a4460' : '#8f5470'
      ctx.lineWidth = s * 0.16
      ctx.beginPath()
      ctx.moveTo(Math.cos(baseA + Math.PI) * s * 0.3, Math.sin(baseA + Math.PI) * s * 0.2)
      ctx.quadraticCurveTo(
        Math.cos(midA + Math.PI) * len * 0.6,
        Math.sin(midA + Math.PI) * len * 0.6,
        Math.cos(tipA + Math.PI) * len,
        Math.sin(tipA + Math.PI) * len,
      )
      ctx.stroke()
    }
    // 头冠（钟形）
    const g = ctx.createLinearGradient(0, -s, 0, s)
    g.addColorStop(0, white ? '#f0e8ee' : '#9b5a7d')
    g.addColorStop(1, white ? '#f0e8ee' : '#6e3a55')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.moveTo(-s * 0.75, s * 0.1)
    ctx.quadraticCurveTo(-s * 0.5, -s * 1.1, 0, -s * 1.05)
    ctx.quadraticCurveTo(s * 0.55, -s * 1.0, s * 0.72, s * 0.15)
    ctx.quadraticCurveTo(0, s * 0.55, -s * 0.75, s * 0.1)
    ctx.closePath()
    ctx.fill()
    // 鳍耳
    ctx.fillStyle = white ? '#f0e8ee' : '#7a4460'
    for (const side of [-1, 1]) {
      ctx.beginPath()
      ctx.ellipse(-s * 0.1, -s * 0.85, s * 0.3, s * 0.16, side * 0.5, 0, Math.PI * 2)
      ctx.fill()
    }
    // 大眼（横向瞳孔）
    ctx.fillStyle = '#f2e8b0'
    ctx.beginPath()
    ctx.ellipse(s * 0.28, -s * 0.25, s * 0.2, s * 0.15, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#1a0e14'
    ctx.beginPath()
    ctx.ellipse(s * 0.32, -s * 0.25, s * 0.05, s * 0.12, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  /** 雷鸟：巨大双翼（羽指+雷光缠翼）+ 锐喙 + 尾羽 */
  private renderThunderbird(ctx: CanvasRenderingContext2D, s: number, white: boolean, windup: boolean): void {
    const t = this.animTime
    const flap = Math.sin(t * (this.dashPhase === 'dash' ? 2 : 6))
    const bodyC = white ? '#f4f0e8' : '#7a5c2e'
    const wingC = white ? '#f4f0e8' : '#8a6a33'
    // 尾羽
    ctx.fillStyle = wingC
    ctx.beginPath()
    ctx.moveTo(-s * 0.5, 0)
    ctx.lineTo(-s * 1.3, -s * 0.3)
    ctx.lineTo(-s * 1.25, s * 0.25)
    ctx.closePath()
    ctx.fill()
    // 身体
    ctx.fillStyle = bodyC
    ctx.beginPath()
    ctx.ellipse(0, 0, s * 0.85, s * 0.5, 0, 0, Math.PI * 2)
    ctx.fill()
    // 双翼（远暗近亮 + 羽指 7）
    for (const far of [true, false]) {
      ctx.save()
      if (far) ctx.globalAlpha *= 0.55
      ctx.rotate(-0.15 - flap * 0.4)
      const wk = s * 1.9
      const g = ctx.createLinearGradient(0, 0, -wk, -s * 0.4)
      g.addColorStop(0, wingC)
      g.addColorStop(1, white ? '#f4f0e8' : '#c9a35c')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.moveTo(s * 0.1, -s * 0.1)
      ctx.quadraticCurveTo(-wk * 0.55, -s * 0.75, -wk, -s * 0.35)
      ctx.quadraticCurveTo(-wk * 0.5, s * 0.05, 0, s * 0.1)
      ctx.closePath()
      ctx.fill()
      // 羽指
      for (let i = 0; i < 7; i++) {
        const fr = i / 6
        const fx = -wk * (0.4 + fr * 0.55)
        const fy = -s * (0.55 - fr * 0.25)
        ctx.fillStyle = white ? '#f4f0e8' : '#54401f'
        ctx.beginPath()
        ctx.moveTo(fx, fy)
        ctx.quadraticCurveTo(fx - s * 0.3, fy - s * 0.08, fx - s * 0.42, fy + s * 0.12)
        ctx.quadraticCurveTo(fx - s * 0.2, fy + s * 0.08, fx, fy + s * 0.05)
        ctx.closePath()
        ctx.fill()
      }
      // 雷光缠翼（充能时强闪）
      if (windup || this.dashPhase === 'dash') {
        ctx.strokeStyle = `rgba(240, 220, 80, ${0.5 + 0.5 * Math.sin(t * 30)})`
        ctx.lineWidth = 3
        ctx.beginPath()
        let zx = -wk * 0.1
        ctx.moveTo(zx, -s * 0.3)
        while (zx > -wk * 0.9) {
          zx -= s * 0.22
          ctx.lineTo(zx, -s * (0.35 + Math.random() * 0.25))
        }
        ctx.stroke()
      }
      ctx.restore()
    }
    // 头 + 锐喙
    ctx.fillStyle = bodyC
    ctx.beginPath()
    ctx.ellipse(s * 0.8, -s * 0.15, s * 0.3, s * 0.24, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = white ? '#f4f0e8' : '#f0b429'
    ctx.beginPath()
    ctx.moveTo(s * 0.95, -s * 0.25)
    ctx.quadraticCurveTo(s * 1.5, -s * 0.2, s * 1.45, s * 0.12)
    ctx.quadraticCurveTo(s * 1.2, 0, s * 0.95, s * 0.0)
    ctx.closePath()
    ctx.fill()
    // 眼（带电光）
    ctx.fillStyle = '#f6e8a0'
    ctx.beginPath()
    ctx.arc(s * 0.88, -s * 0.22, s * 0.09, 0, Math.PI * 2)
    ctx.fill()
  }

  /** 石甲龟王：厚壳多层纹 + 壳顶王冠三尖 + 缩壳时收头收尾 */
  private renderKingTurtle(ctx: CanvasRenderingContext2D, s: number, white: boolean): void {
    const shelled = this.shellTimer > 0
    const t = this.animTime
    const shellC = white ? '#e8ede8' : '#5e8b4f'
    const darkC = white ? '#d0d8d0' : '#3f5e35'
    // 鳍足（缩壳时收起）
    if (!shelled) {
      ctx.fillStyle = white ? '#d8e0d4' : '#8fae7c'
      for (const side of [-1, 1]) {
        ctx.save()
        ctx.translate(s * 0.4, side * s * 0.6)
        ctx.rotate(side * (0.4 + Math.sin(t * 2.5) * 0.25))
        ctx.beginPath()
        ctx.ellipse(0, 0, s * 0.5, s * 0.2, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
        ctx.save()
        ctx.translate(-s * 0.5, side * s * 0.55)
        ctx.rotate(side * (0.4 - Math.sin(t * 2.5) * 0.25))
        ctx.beginPath()
        ctx.ellipse(0, 0, s * 0.38, s * 0.16, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
      // 头
      ctx.beginPath()
      ctx.ellipse(s * 1.05, -s * 0.05, s * 0.34, s * 0.26, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#12232e'
      ctx.beginPath()
      ctx.arc(s * 1.2, -s * 0.12, s * 0.06, 0, Math.PI * 2)
      ctx.fill()
    }
    // 厚壳（双层描边 + 六角纹）
    ctx.fillStyle = shellC
    ctx.beginPath()
    ctx.ellipse(0, 0, s * 1.05, s * 0.8, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = darkC
    ctx.lineWidth = s * 0.09
    ctx.stroke()
    ctx.beginPath()
    ctx.ellipse(0, 0, s * 0.82, s * 0.6, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.lineWidth = s * 0.04
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath()
      ctx.moveTo(i * s * 0.32, -s * 0.58)
      ctx.lineTo(i * s * 0.3, s * 0.58)
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.moveTo(-s * 0.7, -s * 0.1)
    ctx.quadraticCurveTo(0, -s * 0.34, s * 0.7, -s * 0.1)
    ctx.stroke()
    // 王冠三尖棘
    ctx.fillStyle = white ? '#e8d8a8' : '#c9b45a'
    for (let i = -1; i <= 1; i++) {
      const h = i === 0 ? s * 0.5 : s * 0.35
      ctx.beginPath()
      ctx.moveTo(i * s * 0.3 - s * 0.08, -s * 0.72)
      ctx.lineTo(i * s * 0.3, -s * 0.72 - h)
      ctx.lineTo(i * s * 0.3 + s * 0.08, -s * 0.72)
      ctx.closePath()
      ctx.fill()
    }
    // 缩壳发光提示
    if (shelled) {
      ctx.strokeStyle = `rgba(220, 232, 240, ${0.4 + 0.3 * Math.sin(t * 10)})`
      ctx.lineWidth = s * 0.07
      ctx.beginPath()
      ctx.ellipse(0, 0, s * 1.15, s * 0.9, 0, 0, Math.PI * 2)
      ctx.stroke()
    }
  }

  /** 远古鲨王：巨鲨 + 背鳍伤疤缺口 + 红眼 + 冲刺残影 */
  private renderAncientShark(ctx: CanvasRenderingContext2D, s: number, white: boolean, windup: boolean): void {
    const t = this.animTime
    const w = Math.sin(t * 4) * s * 0.1
    // 冲刺残影
    if (this.dashPhase === 'dash') {
      ctx.fillStyle = 'rgba(150, 60, 50, 0.18)'
      ctx.beginPath()
      ctx.ellipse(-s * 0.8, 0, s * 1.1, s * 0.5, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    const bodyC = white ? '#eef2f5' : '#7d93a6'
    const finC = white ? '#e0e8ee' : '#5f7488'
    // 尾
    ctx.fillStyle = finC
    ctx.beginPath()
    ctx.moveTo(-s * 0.8, w)
    ctx.quadraticCurveTo(-s * 1.2, -s * 0.5 + w, -s * 1.5, -s * 0.85 + w)
    ctx.quadraticCurveTo(-s * 1.05, 0, -s * 1.45, s * 0.8 + w)
    ctx.quadraticCurveTo(-s * 1.1, s * 0.25 + w, -s * 0.8, w)
    ctx.closePath()
    ctx.fill()
    // 大背鳍（带伤疤缺口）
    ctx.beginPath()
    ctx.moveTo(-s * 0.05, -s * 0.6 + w * 0.3)
    ctx.lineTo(s * 0.1, -s * 1.35)
    ctx.lineTo(s * 0.22, -s * 0.95)
    ctx.lineTo(s * 0.3, -s * 1.15)
    ctx.lineTo(s * 0.42, -s * 0.55)
    ctx.closePath()
    ctx.fill()
    // 梭形身体
    const g = ctx.createLinearGradient(0, -s, 0, s)
    g.addColorStop(0, bodyC)
    g.addColorStop(1, white ? '#f6f9fb' : '#e6edf2')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.moveTo(s * 1.05, 0)
    ctx.quadraticCurveTo(s * 0.4, -s * 0.62, -s * 0.5, -s * 0.3 + w * 0.5)
    ctx.quadraticCurveTo(-s * 0.9, w, -s * 0.5, s * 0.3 + w * 0.5)
    ctx.quadraticCurveTo(s * 0.4, s * 0.66, s * 1.05, s * 0.06)
    ctx.closePath()
    ctx.fill()
    // 鳃线
    ctx.strokeStyle = '#5f7488'
    ctx.lineWidth = s * 0.05
    for (let i = 0; i < 5; i++) {
      const gx = s * (0.38 - i * 0.1)
      ctx.beginPath()
      ctx.moveTo(gx, -s * 0.22)
      ctx.quadraticCurveTo(gx - s * 0.08, 0, gx, s * 0.22)
      ctx.stroke()
    }
    // 巨口（常张 + 双排牙）
    ctx.fillStyle = '#5c1f14'
    ctx.beginPath()
    ctx.moveTo(s * 1.0, 0)
    ctx.lineTo(s * 0.35, -s * 0.2)
    ctx.lineTo(s * 0.35, s * 0.34)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#f4f7f8'
    for (let i = 0; i < 7; i++) {
      const tx = s * (0.92 - i * 0.09)
      for (const side of [-1, 1]) {
        ctx.beginPath()
        ctx.moveTo(tx, side * s * 0.16 + s * 0.08)
        ctx.lineTo(tx - s * 0.04, side * s * 0.02 + s * 0.08)
        ctx.lineTo(tx - s * 0.08, side * s * 0.16 + s * 0.08)
        ctx.closePath()
        ctx.fill()
      }
    }
    // 红眼（锁定预警时更亮）
    const eyeGlow = windup ? 0.9 : 0.6
    ctx.fillStyle = `rgba(255, 70, 60, ${eyeGlow})`
    ctx.beginPath()
    ctx.arc(s * 0.68, -s * 0.28, s * 0.11, 0, Math.PI * 2)
    ctx.fill()
  }
}
