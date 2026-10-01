import type { World } from '../world/World'

const SHARD_LIFETIME = 45

/** 进化碎片：Boss 与宝物掉落的万能经验，收集后在能力间自由分配 */
export class Shard {
  x: number
  y: number
  private vx: number
  private vy: number
  private age = 0
  private bob = Math.random() * Math.PI * 2

  constructor(x: number, y: number) {
    this.x = x
    this.y = y
    this.vx = (Math.random() - 0.5) * 120
    this.vy = (Math.random() - 0.5) * 90
  }

  get expired(): boolean {
    return this.age >= SHARD_LIFETIME
  }

  update(dt: number, world: World): void {
    this.age += dt
    this.bob += dt
    if (this.y > world.waterY) {
      // 水中：散开后悬浮微漂
      this.vx *= Math.pow(0.15, dt)
      this.vy += (-14 - this.vy) * Math.min(1, 1.5 * dt)
      this.x += (this.vx + Math.sin(this.bob * 1.6) * 8) * dt
      this.y += this.vy * dt
    } else {
      // 空中：抛落后悬浮
      this.vy += 500 * dt
      this.vx *= Math.pow(0.3, dt)
      this.x += this.vx * dt
      this.y += this.vy * dt
      if (this.y > world.waterY + 4) this.y = world.waterY + 4
    }
    this.x = Math.max(10, Math.min(world.width - 10, this.x))
  }

  render(ctx: CanvasRenderingContext2D): void {
    const remain = SHARD_LIFETIME - this.age
    if (remain < 4 && Math.sin(this.age * 10) > 0.3) return
    const glow = 0.6 + 0.4 * Math.sin(this.bob * 4)
    ctx.save()
    ctx.translate(this.x, this.y)
    // 光晕
    const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 22)
    g.addColorStop(0, `rgba(140, 240, 220, ${0.5 * glow})`)
    g.addColorStop(1, 'rgba(140, 240, 220, 0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(0, 0, 22, 0, Math.PI * 2)
    ctx.fill()
    // 菱形晶体
    ctx.rotate(this.bob * 1.4)
    ctx.fillStyle = '#9ff0e2'
    ctx.beginPath()
    ctx.moveTo(0, -9)
    ctx.lineTo(6, 0)
    ctx.lineTo(0, 9)
    ctx.lineTo(-6, 0)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = '#e2fffa'
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.restore()
  }
}
