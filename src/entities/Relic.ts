import type { AbilityKind } from '../systems/Abilities'
import { ABILITY_INFO } from '../systems/Abilities'
import type { World } from '../world/World'

const RELIC_LIFETIME = 90

/**
 * 进化圣物：限时刷新的能力突破钥匙（Lv4/Lv7 需消耗）。
 * 存在期间头顶光柱 + 倒计时环，到期淡出消失。
 */
export class Relic {
  readonly kind: AbilityKind
  x: number
  y: number
  private age = 0
  private bob = Math.random() * Math.PI * 2

  constructor(kind: AbilityKind, x: number, y: number) {
    this.kind = kind
    this.x = x
    this.y = y
  }

  get expired(): boolean {
    return this.age >= RELIC_LIFETIME
  }

  get remain(): number {
    return RELIC_LIFETIME - this.age
  }

  get info(): { color: string } {
    return ABILITY_INFO[this.kind]
  }

  update(dt: number, world: World): void {
    this.age += dt
    this.bob += dt
    // 悬浮：水中缓升微漂，空中上下浮动
    if (this.y > world.waterY) {
      this.y += Math.sin(this.bob * 1.4) * 4 * dt
      this.x += Math.sin(this.bob * 0.7) * 5 * dt
    } else {
      this.y += Math.sin(this.bob * 1.1) * 7 * dt
    }
  }

  /** 玩家接触拾取 */
  tryPickup(px: number, py: number): boolean {
    return Math.hypot(px - this.x, py - this.y) < 42
  }

  render(ctx: CanvasRenderingContext2D): void {
    const remain = this.remain
    // 最后 10 秒闪烁警示
    if (remain < 10 && Math.sin(this.age * 8) > 0.4) return
    const info = ABILITY_INFO[this.kind]
    const glow = 0.6 + 0.4 * Math.sin(this.bob * 3)
    const fade = Math.min(1, remain / 5)

    // 头顶光柱（世界内的可见指引）
    const beam = ctx.createLinearGradient(0, -260, 0, 0)
    beam.addColorStop(0, 'rgba(255, 240, 190, 0)')
    beam.addColorStop(1, `rgba(255, 240, 190, ${0.35 * glow * fade})`)
    ctx.fillStyle = beam
    ctx.fillRect(this.x - 10, this.y - 260, 20, 260)

    ctx.save()
    ctx.translate(this.x, this.y)
    ctx.globalAlpha = fade

    // 光晕
    ctx.globalAlpha = fade * 0.3 * glow
    ctx.fillStyle = info.color
    ctx.beginPath()
    ctx.arc(0, 0, 30, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = fade

    // 底台水晶（能力主题色）
    ctx.rotate(Math.sin(this.bob * 0.9) * 0.12)
    ctx.fillStyle = info.color
    ctx.beginPath()
    ctx.moveTo(0, -16)
    ctx.lineTo(11, 0)
    ctx.lineTo(0, 16)
    ctx.lineTo(-11, 0)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'
    ctx.lineWidth = 1.5
    ctx.stroke()

    // 能力符号（白色叠加）
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    this.drawGlyph(ctx, this.kind)

    // 倒计时环
    const ratio = remain / RELIC_LIFETIME
    ctx.strokeStyle = remain < 15 ? 'rgba(255, 120, 90, 0.9)' : 'rgba(255, 240, 190, 0.7)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(0, 0, 24, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio)
    ctx.stroke()

    ctx.restore()
  }

  /** 八种能力的小符号（白色，画在水晶之上） */
  private drawGlyph(ctx: CanvasRenderingContext2D, kind: AbilityKind): void {
    switch (kind) {
      case 'bite': // 双牙
        for (const dx of [-3, 3]) {
          ctx.beginPath()
          ctx.moveTo(dx - 2.5, -6)
          ctx.quadraticCurveTo(dx, 2, dx - 0.5, 7)
          ctx.quadraticCurveTo(dx + 2, 2, dx + 2.5, -6)
          ctx.closePath()
          ctx.fill()
        }
        break
      case 'tail': // 流线鳍
        ctx.beginPath()
        ctx.moveTo(-7, 5)
        ctx.quadraticCurveTo(-2, -6, 8, -3)
        ctx.quadraticCurveTo(2, 2, 4, 7)
        ctx.closePath()
        ctx.fill()
        break
      case 'armor': // 盾
        ctx.beginPath()
        ctx.moveTo(0, -7)
        ctx.lineTo(6, -4)
        ctx.lineTo(5, 4)
        ctx.quadraticCurveTo(0, 8, -5, 4)
        ctx.lineTo(-6, -4)
        ctx.closePath()
        ctx.fill()
        break
      case 'vigor': // 珠
        ctx.beginPath()
        ctx.arc(0, 0, 5.5, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = 'rgba(255,255,255,0.95)'
        ctx.beginPath()
        ctx.arc(-1.8, -1.8, 1.8, 0, Math.PI * 2)
        ctx.fill()
        break
      case 'venom': // 毒滴
        ctx.beginPath()
        ctx.moveTo(0, -8)
        ctx.quadraticCurveTo(6, 2, 3, 5)
        ctx.quadraticCurveTo(0, 8, -3, 5)
        ctx.quadraticCurveTo(-6, 2, 0, -8)
        ctx.closePath()
        ctx.fill()
        break
      case 'shock': // 闪电
        ctx.beginPath()
        ctx.moveTo(2, -8)
        ctx.lineTo(-4, 1)
        ctx.lineTo(0, 1)
        ctx.lineTo(-2, 8)
        ctx.lineTo(5, -2)
        ctx.lineTo(1, -2)
        ctx.closePath()
        ctx.fill()
        break
      case 'wing': // 羽
        ctx.beginPath()
        ctx.ellipse(0, 0, 8, 3.2, -0.6, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = 'rgba(255,255,255,0.92)'
        ctx.lineWidth = 1.2
        ctx.beginPath()
        ctx.moveTo(-8, 5)
        ctx.lineTo(8, -5)
        ctx.stroke()
        break
      case 'limb': // 爪骨
        ctx.beginPath()
        ctx.ellipse(0, 2, 3, 6, 0, 0, Math.PI * 2)
        ctx.fill()
        for (const dx of [-5, 0, 5]) {
          ctx.beginPath()
          ctx.ellipse(dx, -6, 1.6, 3, dx * 0.08, 0, Math.PI * 2)
          ctx.fill()
        }
        break
    }
  }
}
