import type { World } from '../world/World'

/** 主动技能种类：宝箱功能型 / 精英与 Boss 掉落战斗型 */
export type SkillKind =
  | 'surge'
  | 'heal'
  | 'invuln'
  | 'stealth'
  | 'shield'
  | 'magnet'
  | 'shockwave'
  | 'voltburst'
  | 'venomfield'
  | 'frostbite'
  | 'bloodlust'
  | 'arcane'
  | 'devour'
  | 'tsunami'

export interface SkillDef {
  id: SkillKind
  name: string
  color: string
  /** 释放冷却（秒） */
  cooldown: number
  desc: string
  source: 'chest' | 'elite' | 'boss'
}

export const SKILL_DEFS: Readonly<Record<SkillKind, SkillDef>> = {
  surge: { id: 'surge', name: '疾速', color: '#7ee8ff', cooldown: 18, desc: '4 秒移动速度 ×1.75', source: 'chest' },
  heal: { id: 'heal', name: '涌泉', color: '#8fe89a', cooldown: 22, desc: '立即回复 45% 生命', source: 'chest' },
  invuln: { id: 'invuln', name: '金身', color: '#ffd76a', cooldown: 28, desc: '2.5 秒完全无敌', source: 'chest' },
  stealth: { id: 'stealth', name: '隐身', color: '#b8c8d8', cooldown: 24, desc: '3.5 秒内敌人无法察觉你', source: 'chest' },
  shield: { id: 'shield', name: '护盾', color: '#6ab8e8', cooldown: 20, desc: '获得吸收 90 点伤害的水盾（12 秒）', source: 'chest' },
  magnet: { id: 'magnet', name: '磁力', color: '#e8c86a', cooldown: 16, desc: '6 秒内吸取周围的肉与掉落物', source: 'chest' },
  shockwave: { id: 'shockwave', name: '冲击波', color: '#ffab6a', cooldown: 14, desc: '震退并重创周围敌人', source: 'elite' },
  voltburst: { id: 'voltburst', name: '电爆', color: '#f0e064', cooldown: 16, desc: '麻痹并击退周围敌人', source: 'elite' },
  venomfield: { id: 'venomfield', name: '毒域', color: '#9b6ad6', cooldown: 15, desc: '在原地布下持续毒云', source: 'elite' },
  frostbite: { id: 'frostbite', name: '寒流', color: '#a8dff0', cooldown: 15, desc: '大幅减速周围敌人', source: 'elite' },
  bloodlust: { id: 'bloodlust', name: '血刃', color: '#e2564a', cooldown: 18, desc: '8 秒撕咬伤害 ×2 并吸血', source: 'elite' },
  arcane: { id: 'arcane', name: '奥术脉冲', color: '#c9a8ff', cooldown: 25, desc: '毁灭性的大范围脉冲', source: 'boss' },
  devour: { id: 'devour', name: '巨口吞噬', color: '#ff8866', cooldown: 20, desc: '直接吞噬周围残血的猎物', source: 'boss' },
  tsunami: { id: 'tsunami', name: '海啸冲击', color: '#5ab8d8', cooldown: 18, desc: '向前发射毁灭水波', source: 'boss' },
}

/** 宝箱可开出的技能池 */
export const CHEST_SKILLS: ReadonlyArray<SkillKind> = [
  'surge',
  'heal',
  'invuln',
  'stealth',
  'shield',
  'magnet',
]
/** 精英技能书掉落池 */
export const ELITE_SKILLS: ReadonlyArray<SkillKind> = [
  'shockwave',
  'voltburst',
  'venomfield',
  'frostbite',
  'bloodlust',
]
/** Boss 技能书固定池（击杀随机掉落其一） */
export const BOSS_SKILLS: ReadonlyArray<SkillKind> = ['arcane', 'devour', 'tsunami']

const CHEST_LIFETIME = 120

/**
 * 宝箱：规律刷新的地图实体，接触开启，
 * 随机获得一个功能型技能（替换当前技能）。
 */
export class Chest {
  x: number
  y: number
  private age = 0
  private bob = Math.random() * Math.PI * 2

  constructor(x: number, y: number) {
    this.x = x
    this.y = y
  }

  get expired(): boolean {
    return this.age >= CHEST_LIFETIME
  }

  get remain(): number {
    return CHEST_LIFETIME - this.age
  }

  update(dt: number, world: World): void {
    this.age += dt
    this.bob += dt
    // 水中缓沉微摆；陆上/空中静止
    if (this.y > world.waterY) {
      this.y += Math.sin(this.bob * 1.2) * 3 * dt
      this.x += Math.sin(this.bob * 0.6) * 4 * dt
    }
  }

  tryOpen(px: number, py: number): boolean {
    return Math.hypot(px - this.x, py - this.y) < 46
  }

  render(ctx: CanvasRenderingContext2D): void {
    const remain = this.remain
    if (remain < 10 && Math.sin(this.age * 8) > 0.4) return
    const glow = 0.55 + 0.35 * Math.sin(this.bob * 2.4)
    const fade = Math.min(1, remain / 5)

    // 头顶光柱（低亮度，区别于圣物金色）
    const beam = ctx.createLinearGradient(0, -200, 0, 0)
    beam.addColorStop(0, 'rgba(255, 220, 150, 0)')
    beam.addColorStop(1, `rgba(255, 220, 150, ${0.22 * glow * fade})`)
    ctx.fillStyle = beam
    ctx.fillRect(this.x - 8, this.y - 200, 16, 200)

    ctx.save()
    ctx.translate(this.x, this.y + Math.sin(this.bob * 1.6) * 2)
    ctx.globalAlpha = fade

    // 箱体
    const bodyGrad = ctx.createLinearGradient(0, -14, 0, 22)
    bodyGrad.addColorStop(0, '#a87840')
    bodyGrad.addColorStop(1, '#7a5228')
    ctx.fillStyle = bodyGrad
    ctx.beginPath()
    ctx.roundRect(-22, -10, 44, 28, 4)
    ctx.fill()
    // 箱盖（拱形）
    ctx.fillStyle = '#8f6434'
    ctx.beginPath()
    ctx.moveTo(-22, -10)
    ctx.quadraticCurveTo(-22, -26, 0, -26)
    ctx.quadraticCurveTo(22, -26, 22, -10)
    ctx.closePath()
    ctx.fill()
    // 金属包边
    ctx.strokeStyle = '#e8c86a'
    ctx.lineWidth = 2.5
    ctx.strokeRect(-22, -10, 44, 28)
    ctx.beginPath()
    ctx.moveTo(-22, -10)
    ctx.quadraticCurveTo(-22, -26, 0, -26)
    ctx.quadraticCurveTo(22, -26, 22, -10)
    ctx.stroke()
    // 锁扣
    ctx.fillStyle = `rgba(255, 225, 130, ${0.7 + 0.3 * glow})`
    ctx.beginPath()
    ctx.roundRect(-4, -14, 8, 10, 2)
    ctx.fill()

    ctx.restore()
  }
}

const BOOK_LIFETIME = 60

/**
 * 技能书：精英/Boss 掉落的漂浮拾取物，
 * 接触习得对应技能（替换当前技能）。
 */
export class SkillBook {
  x: number
  y: number
  readonly kind: SkillKind
  private vx: number
  private vy: number
  private age = 0
  private spin = Math.random() * Math.PI * 2

  constructor(x: number, y: number, kind: SkillKind) {
    this.x = x
    this.y = y
    this.kind = kind
    this.vx = (Math.random() - 0.5) * 120
    this.vy = (Math.random() - 0.5) * 80
  }

  get expired(): boolean {
    return this.age >= BOOK_LIFETIME
  }

  get remain(): number {
    return BOOK_LIFETIME - this.age
  }

  update(dt: number, world: World): void {
    this.age += dt
    this.spin += dt * 2
    if (this.y > world.waterY) {
      // 水中：初速衰减 + 缓沉
      this.vx *= Math.pow(0.2, dt)
      this.vy += (20 - this.vy) * Math.min(1, 2 * dt)
    } else {
      this.vy += 800 * dt
      this.vx *= Math.pow(0.4, dt)
    }
    this.x += this.vx * dt
    this.y += this.vy * dt
    if (this.y > world.height - 10) this.y = world.height - 10
  }

  render(ctx: CanvasRenderingContext2D): void {
    const remain = this.remain
    if (remain < 5 && Math.sin(this.age * 10) > 0.2) return
    const def = SKILL_DEFS[this.kind]
    const glow = 0.6 + 0.4 * Math.sin(this.age * 3)

    // 光晕
    ctx.fillStyle = def.color
    ctx.globalAlpha = 0.25 * glow
    ctx.beginPath()
    ctx.arc(this.x, this.y, 22, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1

    ctx.save()
    ctx.translate(this.x, this.y)
    ctx.rotate(Math.sin(this.spin) * 0.25)
    // 书本
    ctx.fillStyle = '#3a2e50'
    ctx.beginPath()
    ctx.roundRect(-12, -15, 24, 30, 3)
    ctx.fill()
    ctx.fillStyle = '#4c3d68'
    ctx.beginPath()
    ctx.roundRect(-9, -12, 20, 26, 2)
    ctx.fill()
    // 书脊
    ctx.fillStyle = '#2c2340'
    ctx.fillRect(-12, -15, 4, 30)
    // 符文（技能主题色，闪烁）
    ctx.fillStyle = def.color
    ctx.globalAlpha = glow
    ctx.beginPath()
    ctx.moveTo(2, -8)
    ctx.lineTo(8, -2)
    ctx.lineTo(2, 4)
    ctx.lineTo(-2, 4)
    ctx.lineTo(4, -2)
    ctx.lineTo(-2, -8)
    ctx.closePath()
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.restore()
  }
}
