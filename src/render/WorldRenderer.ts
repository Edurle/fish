import type { Camera } from '../world/Camera'
import type { World } from '../world/World'

interface Bubble {
  x: number
  y: number
  r: number
  vy: number
}

/** 颜色锚点：世界 y → 天空/水体颜色（用于整屏深度渐变） */
const COLOR_STOPS: ReadonlyArray<{ wy: number; color: [number, number, number] }> = [
  { wy: 0, color: [126, 200, 255] },
  { wy: 2000, color: [186, 230, 246] },
  { wy: 2400, color: [216, 243, 250] },
  { wy: 2401, color: [46, 127, 184] },
  { wy: 3800, color: [23, 90, 142] },
  { wy: 5400, color: [12, 42, 72] },
  { wy: 6600, color: [5, 13, 24] },
]

/** 深度渐变天空与水体、云、太阳、岛屿、气泡、水面波浪 */
export class WorldRenderer {
  private time = 0
  private bubbles: Bubble[] = []
  private bubbleTimer = 0

  constructor(private readonly world: World) {}

  update(dt: number, playerX: number, playerY: number, playerInWater: boolean): void {
    this.time += dt
    if (playerInWater) {
      this.bubbleTimer -= dt
      if (this.bubbleTimer <= 0) {
        this.bubbleTimer = 0.18
        this.bubbles.push({
          x: playerX + (Math.random() - 0.5) * 24,
          y: playerY + (Math.random() - 0.5) * 12,
          r: 1.5 + Math.random() * 3.5,
          vy: 30 + Math.random() * 40,
        })
      }
    }
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i]
      b.y -= b.vy * dt
      if (b.y < this.world.waterY + 2) this.bubbles.splice(i, 1)
    }
    if (this.bubbles.length > 120) this.bubbles.splice(0, this.bubbles.length - 120)
  }

  /** 背景层：渐变、太阳、云、岛屿（画在实体之下） */
  renderBack(ctx: CanvasRenderingContext2D, cam: Camera, viewW: number, viewH: number): void {
    this.drawDepthGradient(ctx, cam, viewW, viewH)
    this.drawSun(ctx, viewW)
    this.drawClouds(ctx, cam, viewW, viewH)
    this.drawIslands(ctx, cam, viewW, viewH)
    this.drawBubbles(ctx)
  }

  /** 前景层：水下色调罩与水面波浪（画在实体之上，制造入水层次感） */
  renderFront(ctx: CanvasRenderingContext2D, cam: Camera, viewW: number, viewH: number): void {
    const underTop = Math.max(this.world.waterY, cam.y)
    if (underTop < cam.y + viewH) {
      ctx.fillStyle = 'rgba(20, 62, 118, 0.30)'
      ctx.fillRect(cam.x, underTop, viewW, cam.y + viewH - underTop)
    }
    this.drawSurfaceWaves(ctx, cam, viewW)
  }

  private drawDepthGradient(ctx: CanvasRenderingContext2D, cam: Camera, viewW: number, viewH: number): void {
    const top = cam.y
    const bottom = cam.y + viewH
    const grad = ctx.createLinearGradient(0, top, 0, bottom)
    const stops = COLOR_STOPS
    // 视口起止色：取所在区间的锚点插值，中间的锚点按比例插入
    grad.addColorStop(0, this.colorAt(top))
    for (const s of stops) {
      if (s.wy > top && s.wy < bottom) {
        grad.addColorStop((s.wy - top) / viewH, rgbStr(s.color))
      }
    }
    grad.addColorStop(1, this.colorAt(bottom))
    ctx.fillStyle = grad
    ctx.fillRect(cam.x, cam.y, viewW, viewH)
  }

  private colorAt(wy: number): string {
    const stops = COLOR_STOPS
    if (wy <= stops[0].wy) return rgbStr(stops[0].color)
    for (let i = 1; i < stops.length; i++) {
      if (wy <= stops[i].wy) {
        const a = stops[i - 1]
        const b = stops[i]
        const t = (wy - a.wy) / (b.wy - a.wy)
        return rgbStr([
          Math.round(a.color[0] + (b.color[0] - a.color[0]) * t),
          Math.round(a.color[1] + (b.color[1] - a.color[1]) * t),
          Math.round(a.color[2] + (b.color[2] - a.color[2]) * t),
        ])
      }
    }
    return rgbStr(stops[stops.length - 1].color)
  }

  private drawSun(ctx: CanvasRenderingContext2D, viewW: number): void {
    // 太阳画在屏幕空间（远景感）
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    const sx = viewW - 150
    const sy = 120
    const halo = ctx.createRadialGradient(sx, sy, 10, sx, sy, 120)
    halo.addColorStop(0, 'rgba(255, 244, 200, 0.9)')
    halo.addColorStop(1, 'rgba(255, 244, 200, 0)')
    ctx.fillStyle = halo
    ctx.fillRect(sx - 120, sy - 120, 240, 240)
    ctx.fillStyle = '#fff3c4'
    ctx.beginPath()
    ctx.arc(sx, sy, 36, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  private drawClouds(ctx: CanvasRenderingContext2D, cam: Camera, viewW: number, viewH: number): void {
    const PARALLAX = 0.75
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)'
    for (const c of this.world.clouds) {
      const x = c.x - cam.x * PARALLAX
      const y = c.y - cam.y * PARALLAX
      // 云的世界坐标被视差压缩后按视口剔除；x 取模让云在世界外也循环出现
      const spanW = this.world.width * PARALLAX + viewW * 2
      let sx = ((x % spanW) + spanW) % spanW - viewW + cam.x
      if (y < cam.y - 200 || y > cam.y + viewH + 200) continue
      const s = 60 * c.scale
      ctx.beginPath()
      ctx.ellipse(sx, y, s * 1.6, s * 0.55, 0, 0, Math.PI * 2)
      ctx.ellipse(sx + s * 0.9, y + s * 0.18, s * 1.05, s * 0.45, 0, 0, Math.PI * 2)
      ctx.ellipse(sx - s * 0.9, y + s * 0.2, s * 0.9, s * 0.4, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  private drawIslands(ctx: CanvasRenderingContext2D, cam: Camera, viewW: number, viewH: number): void {
    for (const b of this.world.islands) {
      if (b.x + b.w < cam.x - 40 || b.x > cam.x + viewW + 40) continue
      if (b.y + b.h < cam.y - 40 || b.y > cam.y + viewH + 40) continue
      const underwater = b.y > this.world.waterY
      // 土层
      ctx.fillStyle = underwater ? '#6d5a44' : '#b98d5a'
      this.roundRect(ctx, b.x, b.y, b.w, b.h, 14)
      ctx.fill()
      // 描边
      ctx.strokeStyle = 'rgba(30, 22, 12, 0.35)'
      ctx.lineWidth = 4
      ctx.stroke()
      // 顶面植被：水上草地 / 水下藻类
      if (underwater) {
        ctx.fillStyle = '#3f7d52'
        this.roundRect(ctx, b.x + 6, b.y, b.w - 12, 14, 7)
        ctx.fill()
      } else {
        ctx.fillStyle = '#6cbf5a'
        this.roundRect(ctx, b.x + 4, b.y, b.w - 8, 26, 12)
        ctx.fill()
        ctx.fillStyle = '#4e9b40'
        this.roundRect(ctx, b.x + 4, b.y + 20, b.w - 8, 8, 4)
        ctx.fill()
        // 点缀草丛
        ctx.strokeStyle = '#3f8433'
        ctx.lineWidth = 3
        ctx.lineCap = 'round'
        for (let gx = b.x + 40; gx < b.x + b.w - 30; gx += 90) {
          const h = 10 + ((gx * 7919) % 13)
          ctx.beginPath()
          ctx.moveTo(gx, b.y + 2)
          ctx.quadraticCurveTo(gx + 4, b.y - h * 0.6, gx + 2, b.y - h)
          ctx.stroke()
        }
      }
    }
  }

  private drawBubbles(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.30)'
    for (const b of this.bubbles) {
      ctx.beginPath()
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  private drawSurfaceWaves(ctx: CanvasRenderingContext2D, cam: Camera, viewW: number): void {
    const wy = this.world.waterY
    if (wy < cam.y - 30 || wy > cam.y + 2000) return
    ctx.beginPath()
    const step = 26
    ctx.moveTo(cam.x - 20, wy + this.waveAt(cam.x - 20))
    for (let x = cam.x - 20 + step; x <= cam.x + viewW + 20; x += step) {
      ctx.lineTo(x, wy + this.waveAt(x))
    }
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)'
    ctx.lineWidth = 3
    ctx.stroke()
    // 副波：更轻的第二条
    ctx.beginPath()
    ctx.moveTo(cam.x - 20, wy + 10 + this.waveAt(cam.x - 20 + 60) * 0.6)
    for (let x = cam.x; x <= cam.x + viewW + 20; x += step) {
      ctx.lineTo(x, wy + 10 + this.waveAt(x + 60) * 0.6)
    }
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
    ctx.lineWidth = 2
    ctx.stroke()
  }

  private waveAt(x: number): number {
    return Math.sin(x * 0.008 + this.time * 1.7) * 7 + Math.sin(x * 0.021 - this.time * 2.4) * 3
  }

  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ): void {
    const rr = Math.min(r, w / 2, h / 2)
    ctx.beginPath()
    ctx.moveTo(x + rr, y)
    ctx.arcTo(x + w, y, x + w, y + h, rr)
    ctx.arcTo(x + w, y + h, x, y + h, rr)
    ctx.arcTo(x, y + h, x, y, rr)
    ctx.arcTo(x, y, x + w, y, rr)
    ctx.closePath()
  }
}

function rgbStr(c: [number, number, number] | number[]): string {
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`
}
