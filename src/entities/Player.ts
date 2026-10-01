import type { InputManager } from '../core/Input'
import { clamp } from '../core/math'
import { drawPlayerFish, type PlayerTiers } from '../render/creatureArt'
import { computeEffects, createAbilities, type AbilityEffects } from '../systems/Abilities'
import type { SkillKind } from './Skill'
import type { World } from '../world/World'

export type PlayerState = 'swim' | 'air' | 'ground' | 'strand'

const GRAVITY = 1500
const SWIM_LERP = 8
const WING_GRAVITY = 110
const NO_WING_AIR_CONTROL = 330
const WALK_LERP = 10
const JUMP_VY = -620
const STRAND_SPEED = 36
const STRAND_DPS = 3.5
const ENTER_WATER_VY_DAMP = 0.45

/**
 * 玩家：三态物理（水中游 / 空中飞或抛体 / 陆上行走或搁浅）。
 * 全部数值（伤害/速度/减伤/血量/翼肢解锁）由能力等级驱动，
 * 场景在能力升级后调用 applyEffects 刷新。
 */
export class Player {
  x: number
  y: number
  vx = 0
  vy = 0
  readonly size = 18
  hp = 100
  facing = 1
  state: PlayerState = 'swim'
  /** 撕咬动作计时器（>0 时张嘴，伤害判定由场景在咬击瞬间执行） */
  biteTimer = 0
  /** 咬击冷却（连咬间隔） */
  readonly biteCooldown = 0.35
  /** 咬击判定半径（嘴前方） */
  readonly biteRange = 64
  /** 本帧是否发起了咬击（场景消费后清零） */
  justBit = false
  private biteCooldownLeft = 0
  /** 复活后短暂无敌闪烁 */
  private invulnTimer = 0
  /** 受击/复活共用无敌帧 */
  private hitInvuln = 0
  /** 中毒剩余时间 */
  private poisonTimer = 0
  /** 麻痹剩余时间 */
  private paralysisTimer = 0
  private animTime = 0

  /** 能力效果（等级驱动，场景升级后刷新） */
  effects: AbilityEffects = computeEffects(createAbilities())
  /** 主动技能：宝箱/技能书获得（kind 为空表示未持有），场景驱动释放 */
  readonly skill: { kind: SkillKind | null; cd: number; active: number } = {
    kind: null,
    cd: 0,
    active: 0,
  }
  /** 护盾技能剩余吸收量（>0 时受伤先扣盾） */
  shieldValue = 0

  constructor(private readonly world: World) {
    this.x = world.spawnX
    this.y = world.spawnY
  }

  /** 能力变化后刷新数值；生命力升档时同步补满增量血量 */
  applyEffects(next: AbilityEffects): void {
    const hpGain = Math.max(0, next.maxHp - this.effects.maxHp)
    this.effects = next
    if (hpGain > 0) this.hp = Math.min(next.maxHp, this.hp + hpGain)
  }

  get maxHp(): number {
    return this.effects.maxHp
  }

  get biteDamage(): number {
    return this.effects.biteDamage * (this.bloodlustActive ? 2 : 1)
  }

  /** 翼等级：0-6 未成翼（出水跃空增强）/ 7+ 可飞行 */
  get wingLv(): number {
    return this.effects.wingLv
  }

  get hasWing(): boolean {
    return this.effects.wingLv > 0
  }

  get hasLimb(): boolean {
    return this.effects.limbLv > 0
  }

  get invulnerable(): boolean {
    return (
      this.invulnTimer > 0 ||
      this.hitInvuln > 0 ||
      (this.skill.kind === 'invuln' && this.skill.active > 0)
    )
  }

  /** 疾速技能生效中 */
  get surgeActive(): boolean {
    return this.skill.kind === 'surge' && this.skill.active > 0
  }

  /** 隐身生效中：敌人不再察觉玩家 */
  get stealthActive(): boolean {
    return this.skill.kind === 'stealth' && this.skill.active > 0
  }

  /** 磁力生效中：吸取掉落物 */
  get magnetActive(): boolean {
    return this.skill.kind === 'magnet' && this.skill.active > 0
  }

  /** 血刃生效中：撕咬 ×2 且吸血 */
  get bloodlustActive(): boolean {
    return this.skill.kind === 'bloodlust' && this.skill.active > 0
  }

  /** 护盾生效中 */
  get shieldActive(): boolean {
    return this.skill.kind === 'shield' && this.skill.active > 0 && this.shieldValue > 0
  }

  get poisoned(): boolean {
    return this.poisonTimer > 0
  }

  get paralyzed(): boolean {
    return this.paralysisTimer > 0
  }

  /** 受到伤害（硬鳞减伤）与击退；无敌帧内忽略；护盾先行吸收 */
  hurt(dmg: number, fromX: number, fromY: number): boolean {
    if (this.invulnerable) return false
    let remaining = dmg * this.effects.damageTaken
    if (this.shieldActive && remaining > 0) {
      const absorbed = Math.min(this.shieldValue, remaining)
      this.shieldValue -= absorbed
      remaining -= absorbed
      if (this.shieldValue <= 0) this.skill.active = 0
      if (remaining <= 0.01) return true
    }
    this.hp -= remaining
    this.hitInvuln = 0.8
    const dx = this.x - fromX
    const dy = this.y - fromY
    const dist = Math.max(1, Math.hypot(dx, dy))
    this.vx += (dx / dist) * 260
    this.vy += (dy / dist) * 260
    if (this.hp <= 0) this.hp = 0
    return true
  }

  /** 环境持续伤害（灾害灼烧/卷入）：硬鳞减伤生效，不吃无敌帧与击退；护盾先行吸收 */
  hurtEnvironment(dmg: number): void {
    let remaining = dmg * this.effects.damageTaken
    if (this.shieldActive && remaining > 0) {
      const absorbed = Math.min(this.shieldValue, remaining)
      this.shieldValue -= absorbed
      remaining -= absorbed
      if (this.shieldValue <= 0) this.skill.active = 0
      if (remaining <= 0.01) return
    }
    this.hp -= remaining
    if (this.hp <= 0) this.hp = 0
  }

  applyPoison(duration: number): void {
    this.poisonTimer = Math.max(this.poisonTimer, duration)
  }

  applyParalysis(duration: number): void {
    this.paralysisTimer = Math.max(this.paralysisTimer, duration)
  }

  respawn(): void {
    this.x = this.world.spawnX
    this.y = this.world.spawnY
    this.vx = 0
    this.vy = 0
    this.hp = this.maxHp
    this.state = 'swim'
    this.invulnTimer = 2
  }

  update(dt: number, input: InputManager): void {
    this.animTime += dt
    this.biteTimer = Math.max(0, this.biteTimer - dt)
    this.invulnTimer = Math.max(0, this.invulnTimer - dt)
    this.hitInvuln = Math.max(0, this.hitInvuln - dt)
    if (this.skill.cd > 0) this.skill.cd -= dt
    if (this.skill.active > 0) this.skill.active -= dt
    // 生命力：缓慢恢复（中毒/搁浅的持续损失仍照常结算）
    if (this.hp > 0 && this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + this.effects.hpRegen * dt)
    }
    // 中毒持续掉血
    if (this.poisonTimer > 0) {
      this.poisonTimer -= dt
      this.hp -= 2.5 * dt
    }
    // 麻痹：输入无效，速度衰减
    if (this.paralysisTimer > 0) this.paralysisTimer -= dt
    const mv = this.paralysisTimer > 0 ? { x: 0, y: 0 } : input.getMoveVector()
    if (this.paralysisTimer > 0) {
      this.vx *= Math.pow(0.15, dt)
      this.vy *= Math.pow(0.15, dt)
    }
    // 撕咬输入：justBit 供场景在本帧判定命中，判定后由场景清零
    if (input.attackJustPressed() && this.biteCooldownLeft <= 0) {
      this.biteTimer = 0.22
      this.biteCooldownLeft = this.biteCooldown
      this.justBit = true
    }
    this.biteCooldownLeft = Math.max(0, this.biteCooldownLeft - dt)

    if (this.state === 'ground' || this.state === 'strand') {
      this.updateOnLand(dt, mv)
    } else if (this.state === 'air') {
      this.updateInAir(dt, mv)
    } else {
      this.updateInWater(dt, mv)
    }

    this.x += this.vx * dt
    this.y += this.vy * dt

    // 世界水平边界与海底
    if (this.x < this.size) {
      this.x = this.size
      this.vx = Math.max(0, this.vx)
    } else if (this.x > this.world.width - this.size) {
      this.x = this.world.width - this.size
      this.vx = Math.min(0, this.vx)
    }
    if (this.y > this.world.height - this.size) {
      this.y = this.world.height - this.size
      this.vy = 0
    }

    // 水面切换：swim ↔ air（陆态不参与，由碰撞决定）
    if (this.y < this.world.waterY && this.state === 'swim') {
      this.state = 'air'
      // 出水跃空脉冲：向上游出水面时按翼等级提升跃空高度
      if (this.vy < -40) this.vy = Math.min(this.vy, -this.effects.leapVy)
    } else if (this.y > this.world.waterY && this.state === 'air') {
      this.state = 'swim'
      this.vy *= ENTER_WATER_VY_DAMP
    }

    const landed = this.resolveIslandCollisions()
    if (this.state === 'ground' || this.state === 'strand') {
      if (!landed) this.state = 'air' // 走出块边缘
      else this.state = this.hasLimb ? 'ground' : 'strand'
    } else if (landed && this.y < this.world.waterY) {
      // 只有水面之上的块顶才可站立；水下礁石只作为障碍推出
      this.state = this.hasLimb ? 'ground' : 'strand'
      if (this.state === 'ground') this.vx *= 0.4
    }

    if (Math.abs(this.vx) > 10) this.facing = this.vx < 0 ? -1 : 1
  }

  private updateInWater(dt: number, mv: { x: number; y: number }): void {
    const k = Math.min(1, SWIM_LERP * dt)
    const max = this.effects.swimMax * (this.surgeActive ? 1.75 : 1)
    this.vx += (mv.x * max - this.vx) * k
    this.vy += (mv.y * max - this.vy) * k
  }

  private updateInAir(dt: number, mv: { x: number; y: number }): void {
    if (this.wingLv >= 7) {
      // 成翼飞行：全向控制 + 弱重力缓沉；7-9 级速度迟缓，10 级达到完全体
      const k = Math.min(1, SWIM_LERP * dt)
      const max = this.effects.wingAirMax * (this.surgeActive ? 1.75 : 1)
      this.vx += (mv.x * max - this.vx) * k
      this.vy += (mv.y * max - this.vy) * k
      this.vy += WING_GRAVITY * dt
    } else {
      // 未成翼：抛体，水平控制力弱（翼等级只决定出水跃空高度）
      this.vx += mv.x * NO_WING_AIR_CONTROL * (this.surgeActive ? 1.6 : 1) * dt
      this.vx *= Math.pow(0.5, dt)
      this.vy += GRAVITY * dt
    }
  }

  private updateOnLand(dt: number, mv: { x: number; y: number }): void {
    if (this.state === 'strand') {
      // 搁浅：挣扎蠕动 + 持续掉血
      this.vx += (mv.x * STRAND_SPEED - this.vx) * Math.min(1, 4 * dt)
      this.hp -= STRAND_DPS * dt
      this.vy += GRAVITY * dt
    } else {
      const k = Math.min(1, WALK_LERP * dt)
      const max = this.effects.walkMax * (this.surgeActive ? 1.75 : 1)
      this.vx += (mv.x * max - this.vx) * k
      this.vy += GRAVITY * dt
      // 摇杆/按键向上 = 跳
      if (mv.y < -0.5) {
        this.vy = JUMP_VY
        this.state = 'air'
      }
    }
  }

  /** 圆 vs 岛块 AABB 碰撞推出；返回是否站在某块顶上 */
  private resolveIslandCollisions(): boolean {
    let landed = false
    const r = this.size * 0.8
    for (const b of this.world.islands) {
      if (this.x + r < b.x || this.x - r > b.x + b.w) continue
      if (this.y + r < b.y || this.y - r > b.y + b.h) continue

      const cx = clamp(b.x, b.x + b.w, this.x)
      const cy = clamp(b.y, b.y + b.h, this.y)
      const dx = this.x - cx
      const dy = this.y - cy
      const distSq = dx * dx + dy * dy
      if (distSq >= r * r) continue

      let nx: number
      let ny: number
      let depth: number
      if (distSq > 1e-6) {
        const dist = Math.sqrt(distSq)
        nx = dx / dist
        ny = dy / dist
        depth = r - dist
      } else {
        // 圆心陷入块内：沿最浅轴推出
        const left = this.x - b.x
        const right = b.x + b.w - this.x
        const top = this.y - b.y
        const bottom = b.y + b.h - this.y
        const minPen = Math.min(left, right, top, bottom)
        if (minPen === top) {
          nx = 0
          ny = -1
          depth = top + r
        } else if (minPen === bottom) {
          nx = 0
          ny = 1
          depth = bottom + r
        } else if (minPen === left) {
          nx = -1
          ny = 0
          depth = left + r
        } else {
          nx = 1
          ny = 0
          depth = right + r
        }
      }

      this.x += nx * depth
      this.y += ny * depth
      const vn = this.vx * nx + this.vy * ny
      if (vn < 0) {
        this.vx -= vn * nx
        this.vy -= vn * ny
      }
      if (ny < -0.5 && this.vy >= -1) landed = true
    }
    return landed
  }

  render(ctx: CanvasRenderingContext2D): void {
    const struggling = this.state === 'strand'
    const s = this.size
    const speedK = clamp(0, 1, Math.hypot(this.vx, this.vy) / this.effects.swimMax)
    const mouthOpen = this.biteTimer > 0
      ? Math.sin((Math.PI * this.biteTimer) / 0.22)
      : struggling
        ? 0.4 + 0.4 * Math.sin(this.animTime * 20)
        : 0

    ctx.save()
    ctx.translate(this.x, this.y)
    if (struggling) ctx.rotate(Math.sin(this.animTime * 24) * 0.08)
    // 未成翼抛体时身体朝速度方向低头；镜像后 rotate 的正角在视觉上仍指向下方，两种朝向都正确
    const pitch = this.state === 'air' && this.wingLv < 7 ? clamp(-0.6, 0.6, this.vy / 700) : 0
    // 咬击前扑
    if (mouthOpen > 0.02) ctx.translate(this.facing * s * 0.25 * mouthOpen, 0)
    ctx.scale(this.facing, 1)
    ctx.rotate(pitch)
    if (this.invulnTimer > 0 && Math.sin(this.animTime * 24) > 0) ctx.globalAlpha = 0.45

    drawPlayerFish(ctx, {
      s,
      t: this.animTime,
      k: speedK,
      mouth: mouthOpen,
      tiers: this.effects.tiers as PlayerTiers,
      ground: this.state === 'ground',
    })
    // 隐身：整体半透明
    if (this.stealthActive) ctx.globalAlpha *= 0.45
    // 状态特效（中毒绿泡 / 麻痹电火花 / 技能光环）
    if (this.skill.kind === 'invuln' && this.skill.active > 0) {
      ctx.strokeStyle = `rgba(255, 215, 106, ${0.55 + 0.45 * Math.sin(this.animTime * 18)})`
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.arc(0, 0, s * 1.7, 0, Math.PI * 2)
      ctx.stroke()
    }
    if (this.shieldActive) {
      const k = this.shieldValue / 90
      ctx.strokeStyle = `rgba(106, 184, 232, ${0.4 + 0.3 * Math.sin(this.animTime * 6)})`
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.arc(0, 0, s * 1.6, 0, Math.PI * 2)
      ctx.stroke()
      ctx.strokeStyle = `rgba(106, 184, 232, ${0.25 * k})`
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(0, 0, s * 1.9, 0, Math.PI * 2)
      ctx.stroke()
    }
    if (this.bloodlustActive) {
      ctx.strokeStyle = `rgba(226, 86, 74, ${0.5 + 0.4 * Math.sin(this.animTime * 10)})`
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(0, 0, s * 1.45, 0, Math.PI * 2)
      ctx.stroke()
    }
    if (this.surgeActive) {
      ctx.strokeStyle = 'rgba(126, 232, 255, 0.55)'
      ctx.lineWidth = 2
      for (let i = 0; i < 3; i++) {
        const oy = -6 + i * 6
        ctx.beginPath()
        ctx.moveTo(-s * 1.4 - Math.random() * 14, oy)
        ctx.lineTo(-s * 2.1 - Math.random() * 22, oy)
        ctx.stroke()
      }
    }
    if (this.poisonTimer > 0) {
      ctx.fillStyle = 'rgba(120, 220, 110, 0.7)'
      for (let i = 0; i < 4; i++) {
        const ph = this.animTime * 2 + i * 1.7
        ctx.beginPath()
        ctx.arc(
          Math.sin(ph) * s * 0.9,
          -s * 0.8 - ((ph % 2) * s * 0.5),
          2.5 + Math.sin(ph * 3) * 1.2,
          0,
          Math.PI * 2,
        )
        ctx.fill()
      }
    }
    if (this.paralysisTimer > 0) {
      ctx.strokeStyle = '#f0d040'
      ctx.lineWidth = 2
      for (let i = 0; i < 3; i++) {
        const a = this.animTime * 30 + i * 2.1
        const r1 = s * 1.1
        const r2 = s * 1.5
        ctx.beginPath()
        ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1)
        ctx.lineTo(Math.cos(a + 0.5) * r2, Math.sin(a + 0.5) * r2)
        ctx.stroke()
      }
    }

    ctx.restore()
  }
}
