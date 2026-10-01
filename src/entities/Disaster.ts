import { clamp } from '../core/math'
import type { Creature } from './Creature'
import type { Player } from './Player'
import type { World } from '../world/World'

export type DisasterKind = 'volcano' | 'vent' | 'meteor' | 'tornado'

/** 灾害对世界的操作入口：伤害走场景统一入口，死亡的生物由场景清理掉肉 */
export interface DisasterContext {
  world: World
  player: Player
  creatures: Creature[]
  hurtCreature(c: Creature, dmg: number, fx: number, fy: number): void
  /** 单次打击伤害（爆炸/撞击）：带无敌帧与击退 */
  hurtPlayer(dmg: number, fx: number, fy: number): void
  /** 环境持续伤害（灼烧/卷入 DoT）：不吃无敌帧 */
  hurtPlayerContinuous(dmg: number): void
  hurtCreatureContinuous(c: Creature, dmg: number): void
  shake(strength: number): void
  floatText(x: number, y: number, text: string, color: string): void
}

export interface Disaster {
  readonly kind: DisasterKind
  readonly label: string
  x: number
  y: number
  readonly expired: boolean
  readonly remain: number
  update(dt: number, ctx: DisasterContext): void
  /** 背景层：地形附着物（火山口/泉口） */
  renderBack(ctx: CanvasRenderingContext2D): void
  /** 前景层：动态效果（弹体/气柱/旋风） */
  renderFront(ctx: CanvasRenderingContext2D): void
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  color: string
  buoyancy: number
}

function stepParticles(particles: Particle[], dt: number): void {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]
    p.life -= dt
    if (p.life <= 0) {
      particles.splice(i, 1)
      continue
    }
    p.vy -= p.buoyancy * dt
    p.x += p.vx * dt
    p.y += p.vy * dt
  }
}

function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[]): void {
  for (const p of particles) {
    ctx.globalAlpha = clamp(0, 1, p.life / p.maxLife) * 0.85
    ctx.fillStyle = p.color
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

function spawnParticle(
  particles: Particle[],
  x: number,
  y: number,
  vx: number,
  vy: number,
  life: number,
  size: number,
  color: string,
  buoyancy = 0,
): void {
  particles.push({ x, y, vx, vy, life, maxLife: life, size, color, buoyancy })
}

// ———————————————————— 海底火山喷发 ————————————————————

const VOLCANO_WARN = 3.5
const VOLCANO_ERUPT = 7
const VOLCANO_FADE = 3

/**
 * 深海海底火山：预警（裂缝红光冒泡）→ 喷发（岩浆弹 + 中心羽流）
 * → 余烬消散。岩浆弹落点溅射，羽流持续灼烧，可烧死生物掉肉。
 */
class VolcanoEruption implements Disaster {
  readonly kind = 'volcano'
  readonly label = '海底火山喷发'
  x: number
  y: number
  expired = false
  private phase: 'warn' | 'erupt' | 'fade' = 'warn'
  private timer = VOLCANO_WARN
  private age = 0
  private bombTimer = 0
  private bombs: Array<{ x: number; y: number; vx: number; vy: number }> = []
  private particles: Particle[] = []
  private animT = Math.random() * 10

  constructor(x: number, y: number) {
    this.x = x
    this.y = y
  }

  get remain(): number {
    return VOLCANO_WARN + VOLCANO_ERUPT + VOLCANO_FADE - this.age
  }

  update(dt: number, ctx: DisasterContext): void {
    this.age += dt
    this.animT += dt
    this.timer -= dt
    stepParticles(this.particles, dt)

    if (this.phase === 'warn' && this.timer <= 0) {
      this.phase = 'erupt'
      this.timer = VOLCANO_ERUPT
      ctx.shake(0.9)
    } else if (this.phase === 'erupt' && this.timer <= 0) {
      this.phase = 'fade'
      this.timer = VOLCANO_FADE
    } else if (this.phase === 'fade' && this.timer <= 0) {
      this.expired = true
      return
    }

    if (this.phase === 'warn') {
      // 预警：裂缝冒泡
      if (Math.random() < dt * 14) {
        spawnParticle(
          this.particles,
          this.x + (Math.random() - 0.5) * 70,
          this.y - 10,
          (Math.random() - 0.5) * 30,
          -60 - Math.random() * 80,
          1.6,
          3 + Math.random() * 4,
          'rgba(255, 160, 90, 0.8)',
          60,
        )
      }
      return
    }

    if (this.phase === 'erupt') {
      // 中心羽流灼烧
      this.burnColumn(dt, ctx)
      // 烟尘与火星
      if (Math.random() < dt * 30) {
        spawnParticle(
          this.particles,
          this.x + (Math.random() - 0.5) * 60,
          this.y - 20,
          (Math.random() - 0.5) * 50,
          -180 - Math.random() * 200,
          1.4,
          5 + Math.random() * 7,
          Math.random() < 0.5 ? 'rgba(255, 120, 40, 0.9)' : 'rgba(90, 90, 95, 0.5)',
          40,
        )
      }
      // 岩浆弹
      this.bombTimer -= dt
      if (this.bombTimer <= 0) {
        this.bombTimer = 0.55
        this.bombs.push({
          x: this.x + (Math.random() - 0.5) * 40,
          y: this.y - 30,
          vx: (Math.random() - 0.5) * 560,
          vy: -(760 + Math.random() * 260),
        })
      }
      ctx.shake(0.25)
    } else {
      // fade：余烬
      if (Math.random() < dt * 8) {
        spawnParticle(
          this.particles,
          this.x + (Math.random() - 0.5) * 90,
          this.y - 14,
          (Math.random() - 0.5) * 40,
          -50 - Math.random() * 60,
          2,
          4 + Math.random() * 4,
          'rgba(120, 100, 100, 0.4)',
          10,
        )
      }
    }

    // 岩浆弹飞行与爆炸
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i]
      b.vy += 1300 * dt
      b.x += b.vx * dt
      b.y += b.vy * dt
      // 拖尾火星
      if (Math.random() < dt * 40) {
        spawnParticle(this.particles, b.x, b.y, 0, 40, 0.5, 3, 'rgba(255, 150, 60, 0.9)')
      }
      if (b.vy > 0 && b.y >= this.y - 6) {
        this.explode(b.x, this.y - 6, ctx)
        this.bombs.splice(i, 1)
      }
    }
  }

  /** 中心羽流：中轴线附近持续伤害 */
  private burnColumn(dt: number, ctx: DisasterContext): void {
    const hurtAt = (tx: number, ty: number): boolean =>
      Math.abs(tx - this.x) < 110 && ty < this.y && ty > this.y - 380
    if (hurtAt(ctx.player.x, ctx.player.y)) {
      ctx.hurtPlayerContinuous(15 * dt)
    }
    for (const c of ctx.creatures) {
      if (c.alive && hurtAt(c.x, c.y)) ctx.hurtCreatureContinuous(c, 15 * dt)
    }
  }

  private explode(x: number, y: number, ctx: DisasterContext): void {
    const R = 90
    ctx.shake(0.4)
    ctx.floatText(x, y - 40, '轰！', '#ff9a4a')
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2
      const sp = 120 + Math.random() * 320
      spawnParticle(
        this.particles,
        x,
        y,
        Math.cos(a) * sp,
        Math.sin(a) * sp - 120,
        0.7,
        3 + Math.random() * 5,
        'rgba(255, 130, 50, 0.95)',
        -60,
      )
    }
    const pd = Math.hypot(ctx.player.x - x, ctx.player.y - y)
    if (pd < R) ctx.hurtPlayer(30 * (1 - pd / R * 0.5), x, y)
    for (const c of ctx.creatures) {
      if (!c.alive) continue
      const d = Math.hypot(c.x - x, c.y - y)
      if (d < R) ctx.hurtCreature(c, 30 * (1 - d / R * 0.5), x, y)
    }
  }

  renderBack(ctx: CanvasRenderingContext2D): void {
    // 海底火山丘体
    ctx.save()
    ctx.translate(this.x, this.y)
    ctx.fillStyle = '#3a2f31'
    ctx.beginPath()
    ctx.moveTo(-110, 10)
    ctx.quadraticCurveTo(-52, -46, -22, -54)
    ctx.lineTo(22, -54)
    ctx.quadraticCurveTo(52, -46, 110, 10)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#4a3b3d'
    ctx.beginPath()
    ctx.moveTo(-60, 4)
    ctx.quadraticCurveTo(-30, -36, -16, -42)
    ctx.lineTo(16, -42)
    ctx.quadraticCurveTo(30, -36, 60, 4)
    ctx.closePath()
    ctx.fill()
    // 岩浆裂缝：预警/喷发时发红脉动
    const heat =
      this.phase === 'erupt' ? 1 : this.phase === 'warn' ? 0.35 + 0.3 * Math.sin(this.animT * 6) : 0.25
    if (heat > 0.05) {
      ctx.strokeStyle = `rgba(255, ${Math.round(120 * heat)}, 40, ${0.55 + 0.35 * heat})`
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(-26, -44)
      ctx.quadraticCurveTo(-10, -34, 0, -46)
      ctx.quadraticCurveTo(12, -34, 26, -44)
      ctx.stroke()
    }
    ctx.restore()
  }

  renderFront(ctx: CanvasRenderingContext2D): void {
    // 喷发羽流：橙红渐变柱，边缘抖动
    if (this.phase === 'erupt') {
      const h = 360 + Math.sin(this.animT * 9) * 26
      const grad = ctx.createLinearGradient(0, 0, 0, -h)
      grad.addColorStop(0, 'rgba(255, 190, 90, 0.75)')
      grad.addColorStop(0.4, 'rgba(255, 110, 40, 0.55)')
      grad.addColorStop(1, 'rgba(120, 60, 60, 0)')
      ctx.save()
      ctx.translate(this.x, this.y - 30)
      ctx.fillStyle = grad
      const w = 46 + Math.sin(this.animT * 11) * 7
      ctx.beginPath()
      ctx.moveTo(-w * 0.55, 0)
      ctx.quadraticCurveTo(-w, -h * 0.5, -w * 1.7, -h)
      ctx.lineTo(w * 1.7, -h)
      ctx.quadraticCurveTo(w, -h * 0.5, w * 0.55, 0)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }
    // 岩浆弹
    for (const b of this.bombs) {
      ctx.fillStyle = '#ffb35c'
      ctx.beginPath()
      ctx.arc(b.x, b.y, 11, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#ff7a2e'
      ctx.beginPath()
      ctx.arc(b.x, b.y, 7, 0, Math.PI * 2)
      ctx.fill()
    }
    drawParticles(ctx, this.particles)
  }
}

// ———————————————————— 海底热泉 ————————————————————

const VENT_TOTAL = 26
const VENT_CYCLE = 4.5
const VENT_BURST = 1.5

/**
 * 深海热泉：长周期灾害，静默（细泡）与喷发（高温气泡柱）交替。
 * 喷发柱内持续灼烧，节奏可预判，玩家可卡间隙穿越或驱赶生物入柱。
 */
class HydrothermalVent implements Disaster {
  readonly kind = 'vent'
  readonly label = '海底热泉'
  x: number
  y: number
  expired = false
  private age = 0
  private cycleT = 0
  private particles: Particle[] = []
  private animT = Math.random() * 10

  constructor(x: number, y: number) {
    this.x = x
    this.y = y
  }

  get remain(): number {
    return VENT_TOTAL - this.age
  }

  /** 当前是否喷发（含起落缓冲） */
  private get bursting(): boolean {
    return this.cycleT > VENT_CYCLE - VENT_BURST
  }

  update(dt: number, ctx: DisasterContext): void {
    this.age += dt
    this.animT += dt
    this.cycleT = (this.cycleT + dt) % VENT_CYCLE
    stepParticles(this.particles, dt)
    if (this.age >= VENT_TOTAL) {
      this.expired = true
      return
    }

    if (this.bursting) {
      // 喷发柱灼烧 + 大气泡
      const hurtAt = (tx: number, ty: number): boolean =>
        Math.abs(tx - this.x) < 80 && ty < this.y + 10 && ty > this.y - 500
      if (hurtAt(ctx.player.x, ctx.player.y)) ctx.hurtPlayerContinuous(20 * dt)
      for (const c of ctx.creatures) {
        if (c.alive && hurtAt(c.x, c.y)) ctx.hurtCreatureContinuous(c, 20 * dt)
      }
      if (Math.random() < dt * 26) {
        spawnParticle(
          this.particles,
          this.x + (Math.random() - 0.5) * 56,
          this.y - 16,
          (Math.random() - 0.5) * 40,
          -260 - Math.random() * 200,
          1.8,
          5 + Math.random() * 9,
          'rgba(230, 235, 240, 0.55)',
          120,
        )
      }
      // 震感微弱
      if (Math.random() < dt * 2) ctx.shake(0.08)
    } else if (Math.random() < dt * 6) {
      spawnParticle(
        this.particles,
        this.x + (Math.random() - 0.5) * 40,
        this.y - 12,
        (Math.random() - 0.5) * 16,
        -70 - Math.random() * 50,
        2.2,
        2 + Math.random() * 3,
        'rgba(200, 210, 220, 0.35)',
        40,
      )
    }
  }

  renderBack(ctx: CanvasRenderingContext2D): void {
    ctx.save()
    ctx.translate(this.x, this.y)
    // 烟囱堆积体
    ctx.fillStyle = '#4d4a48'
    ctx.beginPath()
    ctx.moveTo(-34, 6)
    ctx.quadraticCurveTo(-16, -30, -8, -34)
    ctx.lineTo(8, -34)
    ctx.quadraticCurveTo(16, -30, 34, 6)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#5d5955'
    ctx.fillRect(-8, -40, 16, 8)
    // 泉口热光
    const glow = this.bursting ? 0.9 : 0.3 + 0.15 * Math.sin(this.animT * 3)
    ctx.fillStyle = `rgba(255, 140, 80, ${glow * 0.5})`
    ctx.beginPath()
    ctx.ellipse(0, -38, 12, 5, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  renderFront(ctx: CanvasRenderingContext2D): void {
    if (this.bursting) {
      // 高温气泡柱
      const grad = ctx.createLinearGradient(0, this.y, 0, this.y - 500)
      grad.addColorStop(0, 'rgba(240, 244, 248, 0.5)')
      grad.addColorStop(1, 'rgba(240, 244, 248, 0)')
      ctx.fillStyle = grad
      const w = 62 + Math.sin(this.animT * 13) * 8
      ctx.beginPath()
      ctx.moveTo(this.x - w * 0.4, this.y - 20)
      ctx.quadraticCurveTo(this.x - w, this.y - 260, this.x - w * 0.6, this.y - 500)
      ctx.lineTo(this.x + w * 0.6, this.y - 500)
      ctx.quadraticCurveTo(this.x + w, this.y - 260, this.x + w * 0.4, this.y - 20)
      ctx.closePath()
      ctx.fill()
    }
    drawParticles(ctx, this.particles)
  }
}

// ———————————————————— 陨石坠落 ————————————————————

const METEOR_WARN = 2.6
const METEOR_FALL = 0.9
const METEOR_BURN = 2.5

/**
 * 陨石：天空落点红圈预警 → 火焰拖尾坠落 → 撞击溅射（水上下均生效）
 * → 地面燃烧余光。落点随机在玩家附近，溅射伤害中心高边缘低。
 */
class MeteorStrike implements Disaster {
  readonly kind = 'meteor'
  readonly label = '陨石坠落'
  x: number
  y: number
  expired = false
  private phase: 'warn' | 'fall' | 'burn' = 'warn'
  private timer = METEOR_WARN
  private age = 0
  private shockAge = -1
  private particles: Particle[] = []
  private animT = Math.random() * 10
  /** 坠落起点相对落点的偏移高度 */
  private readonly dropH = 1900

  constructor(x: number, y: number) {
    this.x = x
    this.y = y
  }

  get remain(): number {
    return METEOR_WARN + METEOR_FALL + METEOR_BURN - this.age
  }

  /** 陨石当前位置（fall 阶段插值） */
  private get meteorY(): number {
    if (this.phase === 'warn') return this.y - this.dropH
    if (this.phase === 'fall') {
      const t = 1 - this.timer / METEOR_FALL
      // 加速坠落
      return this.y - this.dropH * (1 - t * t)
    }
    return this.y
  }

  update(dt: number, ctx: DisasterContext): void {
    this.age += dt
    this.animT += dt
    this.timer -= dt
    stepParticles(this.particles, dt)
    if (this.shockAge >= 0) this.shockAge += dt

    if (this.phase === 'warn' && this.timer <= 0) {
      this.phase = 'fall'
      this.timer = METEOR_FALL
    } else if (this.phase === 'fall' && this.timer <= 0) {
      this.impact(ctx)
      this.phase = 'burn'
      this.timer = METEOR_BURN
    } else if (this.phase === 'burn' && this.timer <= 0) {
      this.expired = true
      return
    }

    if (this.phase === 'fall') {
      const my = this.meteorY
      // 火焰拖尾
      if (Math.random() < dt * 60) {
        spawnParticle(
          this.particles,
          this.x + (Math.random() - 0.5) * 20,
          my + (Math.random() - 0.5) * 20,
          (Math.random() - 0.5) * 60,
          180 + Math.random() * 160,
          0.5,
          4 + Math.random() * 6,
          Math.random() < 0.6 ? 'rgba(255, 140, 50, 0.9)' : 'rgba(255, 220, 120, 0.8)',
          -80,
        )
      }
    } else if (this.phase === 'burn' && Math.random() < dt * 20) {
      spawnParticle(
        this.particles,
        this.x + (Math.random() - 0.5) * 120,
        this.y - Math.random() * 10,
        (Math.random() - 0.5) * 60,
        -80 - Math.random() * 100,
        1.2,
        4 + Math.random() * 5,
        'rgba(255, 120, 50, 0.7)',
        30,
      )
    }
  }

  private impact(ctx: DisasterContext): void {
    const R = 170
    ctx.shake(1.2)
    this.shockAge = 0
    ctx.floatText(this.x, this.y - 60, '陨石撞击！', '#ffcf7a')
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * Math.PI * 2
      const sp = 180 + Math.random() * 480
      spawnParticle(
        this.particles,
        this.x,
        this.y,
        Math.cos(a) * sp,
        -Math.abs(Math.sin(a)) * sp - 100,
        0.9,
        3 + Math.random() * 6,
        Math.random() < 0.5 ? 'rgba(255, 160, 70, 0.95)' : 'rgba(140, 130, 125, 0.8)',
        -140,
      )
    }
    const pd = Math.hypot(ctx.player.x - this.x, ctx.player.y - this.y)
    if (pd < R) ctx.hurtPlayer(60 * (1 - (pd / R) * 0.6), this.x, this.y)
    for (const c of ctx.creatures) {
      if (!c.alive) continue
      const d = Math.hypot(c.x - this.x, c.y - this.y)
      if (d < R) ctx.hurtCreature(c, 60 * (1 - (d / R) * 0.6), this.x, this.y)
    }
  }

  renderBack(): void {
    // 陨石无地形附着
  }

  renderFront(ctx: CanvasRenderingContext2D): void {
    if (this.phase === 'warn' || this.phase === 'fall') {
      // 落点警示圈：收缩 + 旋转虚线
      const total = METEOR_WARN + METEOR_FALL
      const left = this.phase === 'warn' ? this.timer + METEOR_FALL : this.timer
      const r = 170 * clamp(0.35, 1, left / total)
      const pulse = 0.55 + 0.35 * Math.sin(this.animT * 8)
      ctx.save()
      ctx.translate(this.x, this.y)
      ctx.strokeStyle = `rgba(255, 90, 70, ${pulse})`
      ctx.lineWidth = 3
      ctx.setLineDash([14, 10])
      ctx.lineDashOffset = -this.animT * 40
      ctx.beginPath()
      ctx.ellipse(0, 0, r, r * 0.4, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = `rgba(255, 90, 70, ${pulse * 0.16})`
      ctx.beginPath()
      ctx.ellipse(0, 0, r, r * 0.4, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    if (this.phase === 'fall') {
      const my = this.meteorY
      // 拖尾
      const tail = ctx.createLinearGradient(this.x, my, this.x, my + 260)
      tail.addColorStop(0, 'rgba(255, 200, 110, 0.9)')
      tail.addColorStop(1, 'rgba(255, 100, 40, 0)')
      ctx.fillStyle = tail
      ctx.beginPath()
      ctx.moveTo(this.x - 14, my - 10)
      ctx.lineTo(this.x + 14, my - 10)
      ctx.lineTo(this.x + 40, my + 260)
      ctx.lineTo(this.x - 40, my + 260)
      ctx.closePath()
      ctx.fill()
      // 陨石本体
      ctx.fillStyle = '#7a6a60'
      ctx.beginPath()
      ctx.arc(this.x, my, 26, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#5c4f47'
      ctx.beginPath()
      ctx.arc(this.x - 8, my + 6, 7, 0, Math.PI * 2)
      ctx.arc(this.x + 10, my - 4, 5, 0, Math.PI * 2)
      ctx.fill()
      // 前缘炽热
      ctx.fillStyle = 'rgba(255, 190, 90, 0.85)'
      ctx.beginPath()
      ctx.ellipse(this.x, my - 12, 20, 8, 0, 0, Math.PI * 2)
      ctx.fill()
    }

    if (this.phase === 'burn') {
      // 撞击冲击波扩散环
      if (this.shockAge >= 0 && this.shockAge < 0.6) {
        const t = this.shockAge / 0.6
        ctx.strokeStyle = `rgba(255, 220, 150, ${(1 - t) * 0.8})`
        ctx.lineWidth = 6 * (1 - t) + 2
        ctx.beginPath()
        ctx.ellipse(this.x, this.y, 170 * t, 170 * t * 0.55, 0, 0, Math.PI * 2)
        ctx.stroke()
      }
      // 残骸火光
      const k = clamp(0, 1, this.timer / METEOR_BURN)
      ctx.fillStyle = `rgba(255, ${Math.round(100 + 60 * k)}, 40, ${0.5 * k})`
      ctx.beginPath()
      ctx.ellipse(this.x, this.y, 46, 14, 0, 0, Math.PI * 2)
      ctx.fill()
    }

    drawParticles(ctx, this.particles)
  }
}

// ———————————————————— 龙卷风 ————————————————————

const TORNADO_TOTAL = 15

/**
 * 海面龙卷风：沿水面缓慢漂移的移动旋风。
 * 近距拉拽、核心卷入抛飞，只影响水上与近水面目标。
 */
class Tornado implements Disaster {
  readonly kind = 'tornado'
  readonly label = '龙卷风'
  x: number
  y: number
  expired = false
  private age = 0
  private vx: number
  private particles: Particle[] = []
  private animT = Math.random() * 10

  constructor(x: number, y: number) {
    this.x = x
    this.y = y
    this.vx = (Math.random() < 0.5 ? -1 : 1) * (40 + Math.random() * 45)
  }

  get remain(): number {
    return TORNADO_TOTAL - this.age
  }

  update(dt: number, ctx: DisasterContext): void {
    this.age += dt
    this.animT += dt
    stepParticles(this.particles, dt)
    if (this.age >= TORNADO_TOTAL) {
      this.expired = true
      return
    }

    this.x += this.vx * dt + Math.sin(this.animT * 0.8) * 18 * dt
    this.x = clamp(200, ctx.world.width - 200, this.x)

    // 卷起水花
    if (Math.random() < dt * 30) {
      spawnParticle(
        this.particles,
        this.x + (Math.random() - 0.5) * 90,
        this.y - Math.random() * 20,
        (Math.random() - 0.5) * 120,
        -200 - Math.random() * 300,
        0.8,
        3 + Math.random() * 5,
        'rgba(220, 235, 245, 0.7)',
        40,
      )
    }

    const PULL_R = 300
    const CORE_R = 120
    const affects = (ty: number): boolean => ty < ctx.world.waterY + 250

    // 玩家
    const p = ctx.player
    if (affects(p.y)) {
      const dx = this.x - p.x
      const dy = this.y - 90 - p.y
      const d = Math.hypot(dx, dy)
      if (d < PULL_R && d > 1) {
        const pull = (1 - d / PULL_R) * 620 * dt
        p.vx += (dx / d) * pull
        p.vy += (dy / d) * pull * 0.7
        if (d < CORE_R) {
          ctx.hurtPlayerContinuous(12 * dt)
          // 核心卷入：抛飞（周期性给冲量，制造失控旋转感）
          if (Math.random() < dt * 1.6) {
            p.vy = -560 - Math.random() * 160
            p.vx = this.vx * 3 + (Math.random() - 0.5) * 400
            ctx.floatText(p.x, p.y - 30, '被卷起！', '#cfe8f5')
          }
        }
      }
    }

    // 生物（被卷死同样掉肉）
    for (const c of ctx.creatures) {
      if (!c.alive || !affects(c.y)) continue
      const dx = this.x - c.x
      const dy = this.y - 90 - c.y
      const d = Math.hypot(dx, dy)
      if (d < PULL_R && d > 1) {
        const pull = (1 - d / PULL_R) * 520 * dt
        c.vx += (dx / d) * pull
        c.vy += (dy / d) * pull * 0.7
        if (d < CORE_R) {
          ctx.hurtCreatureContinuous(c, 12 * dt)
          if (Math.random() < dt * 2) {
            c.vy = -420 - Math.random() * 200
            c.vx += (Math.random() - 0.5) * 300
          }
        }
      }
    }
  }

  renderBack(): void {
    // 龙卷风无地形附着
  }

  renderFront(ctx: CanvasRenderingContext2D): void {
    const topY = this.y - 640
    const fade = Math.min(1, this.remain / 2.5)
    ctx.save()
    ctx.globalAlpha = fade
    ctx.translate(this.x, this.y)

    // 顶部尘云盖：翻滚的深色云团
    for (let i = 0; i < 5; i++) {
      const ph = this.animT * 1.6 + i * 1.25
      ctx.fillStyle = 'rgba(112, 126, 140, 0.62)'
      ctx.beginPath()
      ctx.ellipse(Math.sin(ph) * 95, topY + 6 + Math.cos(ph * 0.7) * 10, 86, 30, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = 'rgba(128, 142, 156, 0.8)'
    ctx.beginPath()
    ctx.ellipse(0, topY + 8, 235, 54, 0, 0, Math.PI * 2)
    ctx.fill()

    // 漏斗主体：三层锥形（内凹轮廓 + 明暗渐变 + 边缘高光）
    for (let layer = 0; layer < 3; layer++) {
      const ph = this.animT * (2.2 + layer * 0.7) + layer * 2.1
      const bottomW = 30 + layer * 13
      const topW = 115 + layer * 36
      const grad = ctx.createLinearGradient(0, 0, 0, topY)
      grad.addColorStop(0, 'rgba(138, 153, 168, 0.8)')
      grad.addColorStop(0.55, 'rgba(116, 131, 148, 0.66)')
      grad.addColorStop(1, 'rgba(102, 117, 134, 0.52)')
      ctx.fillStyle = grad
      const sway = Math.sin(ph) * 16
      ctx.beginPath()
      ctx.moveTo(-bottomW + sway, 0)
      // 控制点靠近中轴 → 边缘内凹的漏斗形
      ctx.quadraticCurveTo(-(bottomW + topW) * 0.36, topY * 0.5, -topW + sway * 1.8, topY)
      ctx.lineTo(topW + sway * 1.8, topY)
      ctx.quadraticCurveTo((bottomW + topW) * 0.36, topY * 0.5, bottomW + sway, 0)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = 'rgba(238, 246, 253, 0.4)'
      ctx.lineWidth = 2
      ctx.stroke()
    }

    // 中轴暗核：增强柱体体积
    const coreGrad = ctx.createLinearGradient(0, 0, 0, topY)
    coreGrad.addColorStop(0, 'rgba(72, 86, 100, 0.5)')
    coreGrad.addColorStop(1, 'rgba(72, 86, 100, 0.18)')
    ctx.fillStyle = coreGrad
    ctx.beginPath()
    ctx.moveTo(-8, 0)
    ctx.quadraticCurveTo(-52, topY * 0.5, -100, topY)
    ctx.lineTo(100, topY)
    ctx.quadraticCurveTo(52, topY * 0.5, 8, 0)
    ctx.closePath()
    ctx.fill()

    // 旋转纹理弧线
    ctx.strokeStyle = 'rgba(243, 249, 255, 0.5)'
    ctx.lineWidth = 2.5
    for (let i = 0; i < 8; i++) {
      const ty = -34 - i * 78
      const tw = 52 + i * 15
      const ph = this.animT * 3.2 + i * 1.1
      ctx.beginPath()
      ctx.ellipse(Math.sin(ph) * 12, ty, tw, tw * 0.22, 0, Math.PI * 0.05, Math.PI * 1.2)
      ctx.stroke()
    }

    // 底部水雾裙：涡旋吸入感
    ctx.fillStyle = 'rgba(228, 240, 248, 0.65)'
    ctx.beginPath()
    ctx.ellipse(0, -4, 84, 22, 0, 0, Math.PI * 2)
    ctx.fill()
    for (let i = 0; i < 4; i++) {
      const ph = this.animT * 4 + i * 1.6
      ctx.strokeStyle = 'rgba(238, 247, 253, 0.55)'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.ellipse(0, -4, 60 + i * 26, 14 + i * 5, 0, ph % (Math.PI * 2), ph % (Math.PI * 2) + Math.PI * 0.9)
      ctx.stroke()
    }

    ctx.restore()
    ctx.globalAlpha = 1
    drawParticles(ctx, this.particles)
  }
}

// ———————————————————— 工厂 ————————————————————

/** 灾害展示名（HUD/消息用） */
export const DISASTER_LABELS: Readonly<Record<DisasterKind, string>> = {
  volcano: '海底火山喷发',
  vent: '海底热泉',
  meteor: '陨石坠落',
  tornado: '龙卷风',
}

/**
 * 在指定中心附近为某种灾害采样触发位置。
 * 火山/热泉贴深海海底；陨石任意；龙卷风在海面线上。
 */
export function createDisaster(
  kind: DisasterKind,
  cx: number,
  cy: number,
  world: World,
): Disaster {
  switch (kind) {
    case 'volcano': {
      const x = clamp(300, world.width - 300, cx + (Math.random() - 0.5) * 900)
      const y = world.height - 130
      return new VolcanoEruption(x, y)
    }
    case 'vent': {
      const x = clamp(300, world.width - 300, cx + (Math.random() - 0.5) * 900)
      const y = world.height - 120
      return new HydrothermalVent(x, y)
    }
    case 'meteor': {
      const x = clamp(300, world.width - 300, cx + (Math.random() - 0.5) * 1200)
      const y = clamp(300, world.height - 120, cy + (Math.random() - 0.5) * 1000)
      return new MeteorStrike(x, y)
    }
    case 'tornado': {
      const x = clamp(400, world.width - 400, cx + (Math.random() - 0.5) * 1100)
      const y = world.waterY - 30
      return new Tornado(x, y)
    }
  }
}

export const DISASTER_KINDS: ReadonlyArray<DisasterKind> = ['volcano', 'vent', 'meteor', 'tornado']
