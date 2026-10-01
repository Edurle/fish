import type { AbilityKind } from '../systems/Abilities'
import { ABILITY_INFO } from '../systems/Abilities'
import type { World } from '../world/World'

const MEAT_LIFETIME = 30

/**
 * 生物被击败后掉落的肉：带能力主题色的小块，
 * 水中缓慢下沉摆动、空中下落至水面、玩家接触即被吃掉。
 */
export class MeatChunk {
  x: number
  y: number
  private vx: number
  private vy: number
  private age = 0
  private bobPhase = Math.random() * Math.PI * 2
  readonly kind: AbilityKind

  constructor(x: number, y: number, kind: AbilityKind) {
    this.x = x
    this.y = y
    this.kind = kind
    this.vx = (Math.random() - 0.5) * 90
    this.vy = (Math.random() - 0.5) * 60
  }

  get expired(): boolean {
    return this.age >= MEAT_LIFETIME
  }

  update(dt: number, world: World): void {
    this.age += dt
    const inWater = this.y > world.waterY
    if (inWater) {
      // 水中：初速衰减后缓慢下沉 + 左右摆动
      this.vx *= Math.pow(0.2, dt)
      this.vy += (26 - this.vy) * Math.min(1, 2 * dt)
      this.x += (this.vx + Math.sin(this.age * 2.2 + this.bobPhase) * 14) * dt
      this.y += this.vy * dt
      if (this.y > world.height - 8) this.y = world.height - 8
    } else {
      // 空中：抛落
      this.vy += 900 * dt
      this.vx *= Math.pow(0.4, dt)
      this.x += this.vx * dt
      this.y += this.vy * dt
      if (this.y > world.waterY) this.y = world.waterY + 2
    }
    this.x = Math.max(8, Math.min(world.width - 8, this.x))
  }

  render(ctx: CanvasRenderingContext2D): void {
    // 最后 3 秒闪烁提示将消失
    const remain = MEAT_LIFETIME - this.age
    if (remain < 3 && Math.sin(this.age * 12) > 0.2) return
    const info = ABILITY_INFO[this.kind]
    ctx.save()
    ctx.translate(this.x, this.y)
    ctx.rotate(Math.sin(this.age * 1.8 + this.bobPhase) * 0.6)
    ctx.fillStyle = info.color
    ctx.beginPath()
    ctx.moveTo(-6, -4)
    ctx.quadraticCurveTo(0, -8, 6, -3)
    ctx.quadraticCurveTo(8, 2, 2, 5)
    ctx.quadraticCurveTo(-4, 7, -6, 2)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.restore()
  }
}
