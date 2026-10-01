/**
 * 生物与玩家的程序化外形绘制。
 * 所有绘制都在局部坐标（头朝 +x）进行，朝向翻转由调用方 scale(facing,1) 完成。
 */

export interface DrawArgs {
  /** 体半径 px */
  s: number
  /** 动画时间 */
  t: number
  /** 游速系数 0..1，调制摆动频率 */
  k: number
  /** 张嘴 0..1（攻击动画） */
  mouth: number
  /** 河豚鼓胀 0..1 */
  puff: number
  /** 受击闪白 */
  hurt: boolean
  /** 电鳗充能进度 0..1（0 = 未充能） */
  charge: number
  /** 电鳗放电中 */
  discharge: boolean
}

/** 受击时全部颜色退化为闪白 */
function pal(a: DrawArgs): (c: string) => string {
  return (c: string) => (a.hurt ? '#f4f8fa' : c)
}

/** 身体上下渐变（局部坐标 -s..s） */
function bodyGrad(ctx: CanvasRenderingContext2D, a: DrawArgs, top: string, bottom: string): CanvasGradient {
  const g = ctx.createLinearGradient(0, -a.s, 0, a.s)
  const p = pal(a)
  g.addColorStop(0, p(top))
  g.addColorStop(1, p(bottom))
  return g
}

/** 尾根游动波动量 */
function waveAt(a: DrawArgs): number {
  return Math.sin(a.t * (5 + 8 * a.k)) * a.s * 0.13
}

// ———————————————————— 通用部件 ————————————————————

/** 贝塞尔鱼身轮廓：背弧 + 尾根 + 腹弧；尾根随 wave 上下摆 */
function fishBodyPath(ctx: CanvasRenderingContext2D, s: number, wave: number, len = 1, fat = 1): void {
  ctx.beginPath()
  ctx.moveTo(s * 0.98 * len, -s * 0.02)
  ctx.quadraticCurveTo(s * 0.3 * len, -s * 0.66 * fat, -s * 0.5 * len, -s * 0.26 * fat + wave * 0.4)
  ctx.quadraticCurveTo(-s * 0.95 * len, -s * 0.08 + wave, -s * 0.88 * len, wave)
  ctx.quadraticCurveTo(-s * 0.95 * len, s * 0.08 + wave, -s * 0.5 * len, s * 0.26 * fat + wave * 0.4)
  ctx.quadraticCurveTo(s * 0.3 * len, s * 0.66 * fat, s * 0.98 * len, s * 0.02)
  ctx.closePath()
}

/** 叉形尾（小鱼/鲱鱼/飞鱼） */
function forkTail(ctx: CanvasRenderingContext2D, s: number, wave: number, color: string, len = 1): void {
  ctx.save()
  ctx.translate(-s * 0.82, wave)
  ctx.rotate((wave / s) * 1.7)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(s * 0.06, 0)
  ctx.quadraticCurveTo(-s * 0.45 * len, -s * 0.12, -s * 0.72 * len, -s * 0.52)
  ctx.quadraticCurveTo(-s * 0.38 * len, 0, -s * 0.72 * len, s * 0.52)
  ctx.quadraticCurveTo(-s * 0.45 * len, s * 0.12, s * 0.06, 0)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

/** 月牙尾（鲨鱼等高速鱼） */
function crescentTail(ctx: CanvasRenderingContext2D, s: number, wave: number, color: string): void {
  ctx.save()
  ctx.translate(-s * 0.88, wave)
  ctx.rotate((wave / s) * 1.2)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(s * 0.1, 0)
  ctx.quadraticCurveTo(-s * 0.4, -s * 0.2, -s * 0.85, -s * 0.72)
  ctx.quadraticCurveTo(-s * 0.35, -s * 0.12, -s * 0.28, 0)
  ctx.quadraticCurveTo(-s * 0.35, s * 0.12, -s * 0.85, s * 0.72)
  ctx.quadraticCurveTo(-s * 0.4, s * 0.2, s * 0.1, 0)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

/** 扇形尾（慢速鱼/海豹尾鳍） */
function fanTail(ctx: CanvasRenderingContext2D, s: number, wave: number, color: string): void {
  ctx.save()
  ctx.translate(-s * 0.85, wave)
  ctx.rotate((wave / s) * 1.1)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.quadraticCurveTo(-s * 0.7, -s * 0.5, -s * 0.75, -s * 0.18)
  ctx.quadraticCurveTo(-s * 0.55, 0, -s * 0.75, s * 0.18)
  ctx.quadraticCurveTo(-s * 0.7, s * 0.5, 0, 0)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

type DorsalType = 'pointed' | 'sail' | 'low' | 'spiny'

/** 背鳍 */
function dorsalFin(ctx: CanvasRenderingContext2D, s: number, type: DorsalType, color: string, wave = 0): void {
  ctx.fillStyle = color
  ctx.beginPath()
  if (type === 'pointed') {
    ctx.moveTo(-s * 0.1, -s * 0.52 + wave * 0.4)
    ctx.quadraticCurveTo(s * 0.05, -s * 1.0, s * 0.32, -s * 0.48)
  } else if (type === 'sail') {
    ctx.moveTo(-s * 0.3, -s * 0.5 + wave * 0.4)
    ctx.quadraticCurveTo(-s * 0.05, -s * 1.1, s * 0.3, -s * 0.46)
  } else if (type === 'low') {
    ctx.moveTo(-s * 0.15, -s * 0.54 + wave * 0.4)
    ctx.quadraticCurveTo(s * 0.05, -s * 0.78, s * 0.3, -s * 0.5)
  } else {
    ctx.moveTo(-s * 0.35, -s * 0.48 + wave * 0.4)
    for (let i = 0; i < 4; i++) {
      const x0 = -s * 0.35 + (i * s * 0.18)
      ctx.lineTo(x0 + s * 0.08, -s * 0.72)
      ctx.lineTo(x0 + s * 0.18, -s * 0.5)
    }
  }
  ctx.closePath()
  ctx.fill()
}

/** 胸鳍：身体中下一片摆动小鳍 */
function pectoralFin(ctx: CanvasRenderingContext2D, s: number, t: number, color: string, k: number, sizeK = 1): void {
  ctx.save()
  ctx.translate(s * 0.12, s * 0.18)
  ctx.rotate(0.5 + Math.sin(t * (4 + 6 * k)) * 0.28)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.ellipse(-s * 0.22 * sizeK, 0, s * 0.3 * sizeK, s * 0.13 * sizeK, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/** 眼睛（带高光；angry 时加眉线） */
function eye(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, angry = false): void {
  ctx.fillStyle = '#f6f9fb'
  ctx.beginPath()
  ctx.ellipse(x, y, r, r * 1.1, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#141d26'
  ctx.beginPath()
  ctx.arc(x + r * 0.22, y, r * 0.55, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.beginPath()
  ctx.arc(x + r * 0.05, y - r * 0.3, r * 0.2, 0, Math.PI * 2)
  ctx.fill()
  if (angry) {
    ctx.strokeStyle = '#141d26'
    ctx.lineWidth = r * 0.35
    ctx.beginPath()
    ctx.moveTo(x - r * 0.9, y - r * 1.2)
    ctx.lineTo(x + r * 0.8, y - r * 0.6)
    ctx.stroke()
  }
}

/** 鳃线 */
function gillSlits(ctx: CanvasRenderingContext2D, s: number, n: number, color: string): void {
  ctx.strokeStyle = color
  ctx.lineWidth = Math.max(1.2, s * 0.045)
  ctx.lineCap = 'round'
  for (let i = 0; i < n; i++) {
    const x = s * (0.34 - i * 0.11)
    ctx.beginPath()
    ctx.moveTo(x, -s * 0.2)
    ctx.quadraticCurveTo(x - s * 0.08, 0, x, s * 0.2)
    ctx.stroke()
  }
}

/** 张嘴：口腔 + 上下锯齿牙（gapeK 放大嘴部，咬合力档位用） */
function openMouth(ctx: CanvasRenderingContext2D, s: number, open: number, teeth = 5, gapeK = 1): void {
  if (open <= 0.02) return
  const gape = s * 0.5 * open * gapeK
  ctx.fillStyle = '#5c1f14'
  ctx.beginPath()
  ctx.moveTo(s * 0.96, 0)
  ctx.lineTo(s * 0.3, -gape * 0.5 - s * 0.02)
  ctx.lineTo(s * 0.3, gape * 0.5 + s * 0.02)
  ctx.closePath()
  ctx.fill()
  // 牙
  ctx.fillStyle = '#f4f7f8'
  for (let i = 0; i < teeth; i++) {
    const tx = s * (0.86 - i * 0.11)
    const th = gape * 0.34 * (1 - i * 0.08)
    ctx.beginPath()
    ctx.moveTo(tx, -gape * 0.42)
    ctx.lineTo(tx - s * 0.045, -gape * 0.42 + th)
    ctx.lineTo(tx - s * 0.09, -gape * 0.42)
    ctx.closePath()
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(tx, gape * 0.42)
    ctx.lineTo(tx - s * 0.045, gape * 0.42 - th * 0.8)
    ctx.lineTo(tx - s * 0.09, gape * 0.42)
    ctx.closePath()
    ctx.fill()
  }
}

/** 竖条纹（需已 clip 身体） */
function stripes(ctx: CanvasRenderingContext2D, s: number, color: string, n = 3, alpha = 0.5): void {
  ctx.fillStyle = color
  ctx.globalAlpha *= alpha
  for (let i = 0; i < n; i++) {
    const x = s * (0.55 - i * 0.42)
    ctx.beginPath()
    ctx.moveTo(x, -s * 0.55)
    ctx.quadraticCurveTo(x - s * 0.12, 0, x, s * 0.55)
    ctx.lineTo(x - s * 0.16, s * 0.55)
    ctx.quadraticCurveTo(x - s * 0.28, 0, x - s * 0.16, -s * 0.55)
    ctx.closePath()
    ctx.fill()
  }
  ctx.globalAlpha /= alpha
}

/** 圆点花纹（需已 clip 身体） */
function dots(ctx: CanvasRenderingContext2D, s: number, color: string, n = 6, seed = 1): void {
  ctx.fillStyle = color
  for (let i = 0; i < n; i++) {
    const ang = (i * 137.5 * seed) % 360
    const rr = s * (0.25 + ((i * seed * 53) % 40) / 100)
    const px = Math.cos((ang * Math.PI) / 180) * s * 0.6
    const py = Math.sin((ang * Math.PI) / 180) * rr
    ctx.beginPath()
    ctx.arc(px, py, s * 0.09, 0, Math.PI * 2)
    ctx.fill()
  }
}

// ———————————————————— 水生物种 ————————————————————

function drawMinnow(ctx: CanvasRenderingContext2D, a: DrawArgs): void {
  const p = pal(a)
  const w = waveAt(a)
  forkTail(ctx, a.s, w, p('#7fb8d4'))
  dorsalFin(ctx, a.s, 'low', p('#7fb8d4'), w)
  fishBodyPath(ctx, a.s, w)
  ctx.fillStyle = bodyGrad(ctx, a, '#9fd4e8', '#eef8fc')
  ctx.fill()
  // 侧亮线 + 条纹
  ctx.save()
  fishBodyPath(ctx, a.s, w)
  ctx.clip()
  stripes(ctx, a.s, p('#5e93b5'), 2, 0.35)
  ctx.strokeStyle = p('#e6f6ff')
  ctx.lineWidth = a.s * 0.1
  ctx.beginPath()
  ctx.moveTo(a.s * 0.7, a.s * 0.1)
  ctx.quadraticCurveTo(0, a.s * 0.22, -a.s * 0.6, a.s * 0.1 + w * 0.4)
  ctx.stroke()
  ctx.restore()
  pectoralFin(ctx, a.s, a.t, p('#bfe2f0'), a.k, 0.8)
  gillSlits(ctx, a.s, 1, p('#5e93b5'))
  eye(ctx, a.s * 0.55, -a.s * 0.12, a.s * 0.2)
}

function drawHerring(ctx: CanvasRenderingContext2D, a: DrawArgs): void {
  const p = pal(a)
  const w = waveAt(a)
  forkTail(ctx, a.s, w, p('#8fa8b5'), 1.15)
  dorsalFin(ctx, a.s, 'low', p('#8fa8b5'), w)
  fishBodyPath(ctx, a.s, w, 1.12, 0.82)
  ctx.fillStyle = bodyGrad(ctx, a, '#7f9fb0', '#f2f6f8')
  ctx.fill()
  ctx.save()
  fishBodyPath(ctx, a.s, w, 1.12, 0.82)
  ctx.clip()
  stripes(ctx, a.s * 1.1, p('#5f7d90'), 3, 0.25)
  ctx.restore()
  pectoralFin(ctx, a.s, a.t, p('#c5d6de'), a.k)
  gillSlits(ctx, a.s, 1, p('#5f7d90'))
  eye(ctx, a.s * 0.62, -a.s * 0.1, a.s * 0.17)
}

function drawPuffer(ctx: CanvasRenderingContext2D, a: DrawArgs): void {
  const p = pal(a)
  const s = a.s * (1 + a.puff * 0.55)
  // 刺（鼓胀时更长）
  const spikeLen = s * (0.16 + a.puff * 0.5)
  ctx.strokeStyle = p('#b99a4e')
  ctx.lineWidth = s * 0.09
  ctx.lineCap = 'round'
  for (let i = 0; i < 14; i++) {
    const ang = (i / 14) * Math.PI * 2 + a.t * 0.15
    ctx.beginPath()
    ctx.moveTo(Math.cos(ang) * s * 0.92, Math.sin(ang) * s * 0.92)
    ctx.lineTo(Math.cos(ang) * (s + spikeLen), Math.sin(ang) * (s + spikeLen))
    ctx.stroke()
  }
  fanTail(ctx, s * 0.9, Math.sin(a.t * 4) * s * 0.06, p('#c9ad62'))
  // 圆身
  ctx.fillStyle = bodyGrad(ctx, { ...a, s }, '#dcc06e', '#f7eecb')
  ctx.beginPath()
  ctx.arc(0, 0, s, 0, Math.PI * 2)
  ctx.fill()
  // 斑点
  ctx.save()
  ctx.beginPath()
  ctx.arc(0, 0, s, 0, Math.PI * 2)
  ctx.clip()
  dots(ctx, s, p('#a3823c'), 6, 3)
  ctx.restore()
  // 高频小胸鳍
  pectoralFin(ctx, s, a.t * 3, p('#e8d494'), 1, 0.9)
  // 嘟嘴
  ctx.fillStyle = p('#b99a4e')
  ctx.beginPath()
  ctx.ellipse(s * 0.92, s * 0.05, s * 0.14, s * 0.1, 0, 0, Math.PI * 2)
  ctx.fill()
  eye(ctx, s * 0.5, -s * 0.32, s * 0.2)
}

function drawPoisonfish(ctx: CanvasRenderingContext2D, a: DrawArgs): void {
  const p = pal(a)
  const w = waveAt(a)
  forkTail(ctx, a.s, w, p('#7c52b8'))
  dorsalFin(ctx, a.s, 'sail', p('#7c52b8'), w)
  fishBodyPath(ctx, a.s, w, 0.95, 1.05)
  ctx.fillStyle = bodyGrad(ctx, a, '#8a5fc9', '#c9a8ec')
  ctx.fill()
  ctx.save()
  fishBodyPath(ctx, a.s, w, 0.95, 1.05)
  ctx.clip()
  // 霓虹警戒斑
  ctx.fillStyle = p('#55e0ff')
  for (let i = 0; i < 5; i++) {
    const px = a.s * (0.55 - i * 0.3)
    const py = a.s * ((i % 2 === 0 ? -0.22 : 0.24))
    ctx.beginPath()
    ctx.arc(px, py, a.s * 0.11, 0, Math.PI * 2)
    ctx.fill()
  }
  stripes(ctx, a.s, p('#e8d060'), 2, 0.3)
  ctx.restore()
  // 大扇胸鳍
  pectoralFin(ctx, a.s, a.t * 0.8, p('#b48ae0'), a.k, 1.4)
  gillSlits(ctx, a.s, 1, p('#5e3a94'))
  if (a.mouth > 0.02) openMouth(ctx, a.s, a.mouth, 3)
  else {
    ctx.strokeStyle = p('#5e3a94')
    ctx.lineWidth = a.s * 0.05
    ctx.beginPath()
    ctx.moveTo(a.s * 0.9, a.s * 0.08)
    ctx.quadraticCurveTo(a.s * 0.7, a.s * 0.16, a.s * 0.55, a.s * 0.12)
    ctx.stroke()
  }
  eye(ctx, a.s * 0.55, -a.s * 0.14, a.s * 0.18)
}

function drawTurtle(ctx: CanvasRenderingContext2D, a: DrawArgs): void {
  const p = pal(a)
  const s = a.s
  // 后鳍 + 前鳍（划水相位差）
  ctx.fillStyle = p('#8fae7c')
  for (const side of [-1, 1]) {
    ctx.save()
    ctx.translate(-s * 0.55, side * s * 0.55)
    ctx.rotate(side * (0.45 + Math.sin(a.t * 3) * 0.3))
    ctx.beginPath()
    ctx.ellipse(0, 0, s * 0.32, s * 0.13, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    ctx.save()
    ctx.translate(s * 0.35, side * s * 0.6)
    ctx.rotate(side * (0.5 + Math.sin(a.t * 3 + 1.2) * 0.35))
    ctx.beginPath()
    ctx.ellipse(0, 0, s * 0.42, s * 0.16, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  // 小尾
  ctx.beginPath()
  ctx.moveTo(-s * 0.95, 0)
  ctx.lineTo(-s * 1.2, -s * 0.1)
  ctx.lineTo(-s * 1.2, s * 0.1)
  ctx.closePath()
  ctx.fill()
  // 头 + 颈
  ctx.beginPath()
  ctx.ellipse(s * 1.0, -s * 0.02, s * 0.3, s * 0.22, 0, 0, Math.PI * 2)
  ctx.fill()
  eye(ctx, s * 1.12, -s * 0.12, s * 0.09)
  // 壳
  ctx.fillStyle = bodyGrad(ctx, a, '#5e8b4f', '#43613a')
  ctx.beginPath()
  ctx.ellipse(-s * 0.05, 0, s, s * 0.74, 0, 0, Math.PI * 2)
  ctx.fill()
  // 壳缘 + 盾纹
  ctx.strokeStyle = p('#2f4a29')
  ctx.lineWidth = Math.max(1.5, s * 0.06)
  ctx.beginPath()
  ctx.ellipse(-s * 0.05, 0, s * 0.88, s * 0.62, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.lineWidth = Math.max(1, s * 0.035)
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath()
    ctx.moveTo(i * s * 0.4, -s * 0.6)
    ctx.lineTo(i * s * 0.36, s * 0.6)
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.moveTo(-s * 0.75, -s * 0.08)
  ctx.quadraticCurveTo(-s * 0.05, -s * 0.3, s * 0.6, -s * 0.08)
  ctx.stroke()
}

function drawLantern(ctx: CanvasRenderingContext2D, a: DrawArgs): void {
  const p = pal(a)
  const s = a.s
  const w = waveAt(a)
  fanTail(ctx, s, w, p('#232c4d'))
  dorsalFin(ctx, s, 'low', p('#232c4d'), w)
  // 大头身
  fishBodyPath(ctx, s, w, 1.0, 1.1)
  ctx.fillStyle = bodyGrad(ctx, a, '#33406b', '#171e33')
  ctx.fill()
  ctx.save()
  fishBodyPath(ctx, s, w, 1.0, 1.1)
  ctx.clip()
  ctx.strokeStyle = p('#4d5c8f')
  ctx.lineWidth = s * 0.06
  ctx.beginPath()
  ctx.moveTo(s * 0.6, -s * 0.3)
  ctx.quadraticCurveTo(0, -s * 0.05, -s * 0.6, -s * 0.3 + w * 0.5)
  ctx.stroke()
  ctx.restore()
  pectoralFin(ctx, s, a.t, p('#2c375e'), a.k, 1.1)
  // 常开的大嘴 + 獠牙
  const mouth = Math.max(0.3, a.mouth)
  openMouth(ctx, s, mouth, 4)
  eye(ctx, s * 0.48, -s * 0.3, s * 0.14)
  // 灯笼触角
  const glow = 0.65 + 0.35 * Math.sin(a.t * 3)
  ctx.strokeStyle = p('#4d5c8f')
  ctx.lineWidth = s * 0.07
  ctx.beginPath()
  ctx.moveTo(s * 0.45, -s * 0.55)
  ctx.quadraticCurveTo(s * 0.9, -s * 1.25, s * 1.25, -s * 0.85)
  ctx.stroke()
  const lx = s * 1.25
  const ly = -s * 0.85
  const halo = ctx.createRadialGradient(lx, ly, 1, lx, ly, s * 0.5)
  halo.addColorStop(0, `rgba(255, 238, 150, ${a.hurt ? 0.9 : 0.85 * glow})`)
  halo.addColorStop(1, 'rgba(255, 238, 150, 0)')
  ctx.fillStyle = halo
  ctx.beginPath()
  ctx.arc(lx, ly, s * 0.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = a.hurt ? '#f4f8fa' : '#ffee96'
  ctx.beginPath()
  ctx.arc(lx, ly, s * 0.16, 0, Math.PI * 2)
  ctx.fill()
}

function drawEel(ctx: CanvasRenderingContext2D, a: DrawArgs): void {
  const p = pal(a)
  const s = a.s
  const seg = 5
  const phase = a.t * 4.2
  const midY = (u: number): number => Math.sin(phase + u * 3.4) * s * 0.3 * (0.3 + u * 0.7)
  // 身体：三段描边由粗到细
  const bodyColor = a.charge > 0 ? '#8a9a4e' : '#6b7d52'
  for (let segI = seg - 1; segI >= 0; segI--) {
    const u0 = segI / seg
    const u1 = (segI + 1) / seg
    ctx.strokeStyle = p(u0 < 0.3 ? '#7d905e' : bodyColor)
    ctx.lineWidth = s * (0.5 - u0 * 0.32)
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(s * (1.1 - u0 * 2.9), midY(u0))
    ctx.quadraticCurveTo(
      s * (1.1 - (u0 + u1) / 2 * 2.9),
      midY((u0 + u1) / 2),
      s * (1.1 - u1 * 2.9),
      midY(u1),
    )
    ctx.stroke()
  }
  // 背鳍波
  ctx.strokeStyle = p('#49563a')
  ctx.lineWidth = s * 0.1
  ctx.beginPath()
  for (let u = 0; u <= 1; u += 0.08) {
    const x = s * (1.0 - u * 2.7)
    const y = midY(u) - s * (0.28 - u * 0.14)
    if (u === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
  // 头
  ctx.fillStyle = p('#7d905e')
  ctx.beginPath()
  ctx.ellipse(s * 1.0, midY(0) * 0.3, s * 0.34, s * 0.26, 0, 0, Math.PI * 2)
  ctx.fill()
  eye(ctx, s * 1.1, midY(0) * 0.3 - s * 0.12, s * 0.11)
  // 电弧
  if (a.charge > 0 || a.discharge) {
    const bolts = a.discharge ? 4 : 2
    const alpha = a.discharge ? 0.55 + 0.45 * Math.sin(a.t * 42) : 0.25 + a.charge * 0.3
    ctx.strokeStyle = `rgba(240, 208, 64, ${alpha})`
    ctx.lineWidth = 2
    for (let b = 0; b < bolts; b++) {
      ctx.beginPath()
      let bx = s * 0.9
      let by = 0
      ctx.moveTo(bx, by)
      for (let i = 0; i < 5; i++) {
        bx -= s * 0.55
        by = midY(((s * 1.1 - bx) / (s * 2.9)) | 0) + (Math.random() - 0.5) * s * 0.7
        ctx.lineTo(bx, by)
      }
      ctx.stroke()
    }
  }
}

function drawShark(ctx: CanvasRenderingContext2D, a: DrawArgs): void {
  const p = pal(a)
  const s = a.s * 1.08
  const w = waveAt(a)
  // 尾 + 背鳍 + 第二背鳍
  crescentTail(ctx, s, w, p('#7d93a6'))
  dorsalFin(ctx, s, 'pointed', p('#7d93a6'), w)
  ctx.fillStyle = p('#7d93a6')
  ctx.beginPath()
  ctx.moveTo(-s * 0.55, -s * 0.3 + w * 0.4)
  ctx.quadraticCurveTo(-s * 0.45, -s * 0.52, -s * 0.25, -s * 0.28)
  ctx.closePath()
  ctx.fill()
  // 梭形身体
  fishBodyPath(ctx, s, w, 1.05, 0.9)
  ctx.fillStyle = bodyGrad(ctx, { ...a, s }, '#8ba3b5', '#e9eff3')
  ctx.fill()
  // 鳃
  gillSlits(ctx, s, 4, p('#6b8093'))
  // 后掠大胸鳍
  ctx.save()
  ctx.translate(s * 0.05, s * 0.3)
  ctx.rotate(0.7 + Math.sin(a.t * (3 + a.k * 4)) * 0.1)
  ctx.fillStyle = p('#7d93a6')
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.quadraticCurveTo(-s * 0.35, s * 0.5, -s * 0.75, s * 0.72)
  ctx.quadraticCurveTo(-s * 0.3, s * 0.32, -s * 0.1, s * 0.05)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
  // 攻击张嘴
  if (a.mouth > 0.02) openMouth(ctx, s, a.mouth * 1.2, 6)
  else {
    ctx.strokeStyle = p('#41525f')
    ctx.lineWidth = s * 0.05
    ctx.beginPath()
    ctx.moveTo(s * 1.0, s * 0.1)
    ctx.quadraticCurveTo(s * 0.75, s * 0.18, s * 0.55, s * 0.14)
    ctx.stroke()
  }
  eye(ctx, s * 0.72, -s * 0.22, s * 0.11, true)
}

function drawSailfish(ctx: CanvasRenderingContext2D, a: DrawArgs): void {
  const p = pal(a)
  const s = a.s
  const w = waveAt(a)
  // 大帆背鳍
  ctx.fillStyle = p('#3a6390')
  ctx.beginPath()
  ctx.moveTo(-s * 0.75, -s * 0.3 + w * 0.4)
  ctx.quadraticCurveTo(-s * 0.15, -s * 1.4, s * 0.3, -s * 0.35)
  ctx.closePath()
  ctx.fill()
  forkTail(ctx, s, w, p('#3a6390'), 1.25)
  // 细长流线身
  fishBodyPath(ctx, s, w, 1.15, 0.72)
  ctx.fillStyle = bodyGrad(ctx, a, '#4a7ba8', '#dce8f2')
  ctx.fill()
  ctx.save()
  fishBodyPath(ctx, s, w, 1.15, 0.72)
  ctx.clip()
  stripes(ctx, s * 1.1, p('#33587c'), 3, 0.35)
  ctx.restore()
  // 长尖吻（bill）
  ctx.strokeStyle = p('#3a6390')
  ctx.lineWidth = s * 0.1
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(s * 0.85, 0)
  ctx.lineTo(s * 1.75, -s * 0.03)
  ctx.stroke()
  pectoralFin(ctx, s, a.t * 1.5, p('#9dbcd6'), a.k, 0.9)
  eye(ctx, s * 0.68, -s * 0.1, s * 0.14)
}

// ———————————————————— 空中物种 ————————————————————

/** 两段翼：内翼 + 羽尖，flap 为拍动量 */
function birdWing(
  ctx: CanvasRenderingContext2D,
  s: number,
  flap: number,
  color: string,
  tipColor: string,
  span = 1.6,
  fingers = 3,
): void {
  ctx.save()
  ctx.rotate(-0.2 - flap * 0.55)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(0, -s * 0.05)
  ctx.quadraticCurveTo(-s * 0.5 * span, -s * 0.35, -s * 1.0 * span, -s * 0.28)
  ctx.quadraticCurveTo(-s * 0.45 * span, s * 0.1, -s * 0.05, s * 0.1)
  ctx.closePath()
  ctx.fill()
  // 羽指
  ctx.fillStyle = tipColor
  for (let i = 0; i < fingers; i++) {
    const fy = -s * 0.26 + i * s * 0.14
    ctx.beginPath()
    ctx.moveTo(-s * 0.7 * span, fy)
    ctx.quadraticCurveTo(-s * 1.15 * span, fy + s * 0.06, -s * 1.3 * span, fy + s * 0.2)
    ctx.quadraticCurveTo(-s * 1.0 * span, fy + s * 0.1, -s * 0.68 * span, fy + s * 0.08)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
}

function drawSeagull(ctx: CanvasRenderingContext2D, a: DrawArgs): void {
  const p = pal(a)
  const s = a.s
  const flap = Math.sin(a.t * (7 + a.k * 5))
  // 尾扇
  ctx.fillStyle = p('#cfd6da')
  ctx.beginPath()
  ctx.moveTo(-s * 0.6, 0)
  ctx.lineTo(-s * 1.15, -s * 0.2)
  ctx.lineTo(-s * 1.15, s * 0.2)
  ctx.closePath()
  ctx.fill()
  // 身体
  ctx.fillStyle = bodyGrad(ctx, a, '#cfd6da', '#f7fafb')
  fishBodyPath(ctx, s, 0, 0.9, 0.8)
  ctx.fill()
  // 双翼
  birdWing(ctx, s, flap, p('#e6ebee'), p('#c3ccd2'), 1.5, 3)
  ctx.save()
  ctx.scale(1, -1)
  birdWing(ctx, s, -flap, p('#e6ebee'), p('#c3ccd2'), 1.5, 3)
  ctx.restore()
  // 黄喙带钩
  ctx.fillStyle = p('#e8a23f')
  ctx.beginPath()
  ctx.moveTo(s * 0.82, -s * 0.06)
  ctx.lineTo(s * 1.35 * (1 + a.mouth * 0.05), s * 0.05)
  ctx.lineTo(s * 0.82, s * 0.14)
  ctx.closePath()
  ctx.fill()
  eye(ctx, s * 0.6, -s * 0.14, s * 0.13)
}

function drawFlyingfish(ctx: CanvasRenderingContext2D, a: DrawArgs): void {
  const p = pal(a)
  const s = a.s
  const tremor = Math.sin(a.t * 3.2) * 0.04
  // 两片巨大胸翼（滑翔微颤）
  for (const side of [-1, 1]) {
    ctx.save()
    ctx.translate(s * 0.25, side * s * 0.15)
    ctx.rotate(side * (0.55 + tremor) + 0.15)
    const g = ctx.createLinearGradient(0, -s * 0.2, -s * 1.6, s * 0.4)
    g.addColorStop(0, a.hurt ? '#f4f8fa' : 'rgba(93, 176, 205, 0.95)')
    g.addColorStop(1, a.hurt ? '#f4f8fa' : 'rgba(150, 214, 235, 0.65)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.quadraticCurveTo(-s * 0.8, side * s * 0.4, -s * 1.7, side * s * 0.5)
    ctx.quadraticCurveTo(-s * 0.9, side * s * 0.05, 0, 0)
    ctx.closePath()
    ctx.fill()
    // 翼纹
    ctx.strokeStyle = p('rgba(60, 120, 145, 0.5)')
    ctx.lineWidth = s * 0.05
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath()
      ctx.moveTo(-s * 0.15, side * s * 0.02)
      ctx.lineTo(-s * (1.2 - i * 0.25), side * (s * 0.42 - i * s * 0.08))
      ctx.stroke()
    }
    ctx.restore()
  }
  // 细长身体
  fishBodyPath(ctx, s, 0, 1.1, 0.7)
  ctx.fillStyle = bodyGrad(ctx, a, '#58a8c9', '#e9f5f9')
  ctx.fill()
  ctx.save()
  fishBodyPath(ctx, s, 0, 1.1, 0.7)
  ctx.clip()
  stripes(ctx, s, p('#3a7d9c'), 3, 0.3)
  ctx.restore()
  forkTail(ctx, s, 0, p('#58a8c9'), 1.3)
  dorsalFin(ctx, s, 'low', p('#58a8c9'))
  eye(ctx, s * 0.62, -s * 0.1, s * 0.16)
}

function drawPelican(ctx: CanvasRenderingContext2D, a: DrawArgs): void {
  const p = pal(a)
  const s = a.s
  const flap = Math.sin(a.t * (6 + a.k * 4))
  // 尾
  ctx.fillStyle = p('#d8dde0')
  ctx.beginPath()
  ctx.moveTo(-s * 0.7, -s * 0.05)
  ctx.lineTo(-s * 1.15, -s * 0.28)
  ctx.lineTo(-s * 1.05, s * 0.1)
  ctx.closePath()
  ctx.fill()
  // 胖身
  ctx.fillStyle = bodyGrad(ctx, a, '#d3d9dc', '#fafcfc')
  ctx.beginPath()
  ctx.ellipse(-s * 0.15, 0, s * 0.85, s * 0.6, 0, 0, Math.PI * 2)
  ctx.fill()
  // 双翼
  birdWing(ctx, s * 1.1, flap, p('#e2e7ea'), p('#c3ccd2'), 1.5, 4)
  ctx.save()
  ctx.scale(1, -1)
  birdWing(ctx, s * 1.1, -flap, p('#e2e7ea'), p('#c3ccd2'), 1.5, 4)
  ctx.restore()
  // 颈 + 头
  ctx.strokeStyle = p('#f2f5f6')
  ctx.lineWidth = s * 0.22
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(s * 0.45, -s * 0.25)
  ctx.quadraticCurveTo(s * 0.8, -s * 0.75, s * 1.05, -s * 0.45)
  ctx.stroke()
  ctx.fillStyle = p('#f2f5f6')
  ctx.beginPath()
  ctx.ellipse(s * 1.1, -s * 0.42, s * 0.22, s * 0.18, 0, 0, Math.PI * 2)
  ctx.fill()
  eye(ctx, s * 1.18, -s * 0.52, s * 0.1)
  // 大橙喙 + 喉袋（攻击张嘴时鼓大）
  const bagK = 1 + a.mouth * 0.8
  ctx.fillStyle = p('#e8933f')
  ctx.beginPath()
  ctx.moveTo(s * 1.05, -s * 0.4)
  ctx.lineTo(s * 1.85, -s * 0.28)
  ctx.lineTo(s * 1.05, -s * 0.2)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = p('#f2b56a')
  ctx.beginPath()
  ctx.moveTo(s * 1.08, -s * 0.24)
  ctx.quadraticCurveTo(s * 1.5, s * 0.42 * bagK, s * 1.8, -s * 0.26)
  ctx.closePath()
  ctx.fill()
}

function drawEagle(ctx: CanvasRenderingContext2D, a: DrawArgs): void {
  const p = pal(a)
  const s = a.s
  const flap = Math.sin(a.t * (5 + a.k * 4))
  // 大展翼（上深下浅 + 5 羽指）
  birdWing(ctx, s * 1.35, flap, p('#7a5c2e'), p('#54401f'), 1.7, 5)
  ctx.save()
  ctx.scale(1, -1)
  birdWing(ctx, s * 1.35, -flap, p('#7a5c2e'), p('#54401f'), 1.7, 5)
  ctx.restore()
  // 白尾羽
  ctx.fillStyle = p('#e8e2d4')
  ctx.beginPath()
  ctx.moveTo(-s * 0.6, -s * 0.1)
  ctx.lineTo(-s * 1.35, -s * 0.32)
  ctx.lineTo(-s * 1.3, s * 0.12)
  ctx.closePath()
  ctx.fill()
  // 身体
  ctx.fillStyle = bodyGrad(ctx, a, '#8a6a33', '#c9a35c')
  fishBodyPath(ctx, s, 0, 1.0, 0.75)
  ctx.fill()
  // 弯钩喙
  ctx.fillStyle = p('#f0b429')
  ctx.beginPath()
  ctx.moveTo(s * 0.8, -s * 0.18)
  ctx.quadraticCurveTo(s * 1.3, -s * 0.16, s * 1.25, s * 0.14)
  ctx.quadraticCurveTo(s * 1.32, s * 0.02, s * 1.1, s * 0.0)
  ctx.quadraticCurveTo(s * 0.95, s * 0.02, s * 0.8, s * 0.08)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = p('#3d2f14')
  ctx.lineWidth = s * 0.05
  ctx.beginPath()
  ctx.moveTo(s * 0.85, -s * 0.16)
  ctx.quadraticCurveTo(s * 1.3, -s * 0.16, s * 1.25, s * 0.14)
  ctx.stroke()
  eye(ctx, s * 0.62, -s * 0.22, s * 0.13, true)
}

// ———————————————————— 陆生物种 ————————————————————

function drawCrab(ctx: CanvasRenderingContext2D, a: DrawArgs): void {
  const p = pal(a)
  const s = a.s
  // 8 步腿（两节，行走摆动）
  ctx.strokeStyle = p('#b8543a')
  ctx.lineWidth = s * 0.13
  ctx.lineCap = 'round'
  for (let i = 0; i < 4; i++) {
    const swing = Math.sin(a.t * (4 + a.k * 6) + i * 1.6) * s * 0.18
    for (const side of [-1, 1]) {
      const lx = -s * 0.55 + i * s * 0.38
      ctx.beginPath()
      ctx.moveTo(lx, side * s * 0.3)
      ctx.lineTo(lx + swing, side * s * 0.72)
      ctx.lineTo(lx + swing + s * 0.1, side * s * 0.95)
      ctx.stroke()
    }
  }
  // 双钳（攻击开合）
  const clawGap = 0.25 + a.mouth * 0.7
  for (const side of [-1, 1]) {
    const cx = s * 0.95
    const cy = side * s * 0.55
    ctx.strokeStyle = p('#d9704a')
    ctx.lineWidth = s * 0.2
    ctx.beginPath()
    ctx.moveTo(s * 0.5, side * s * 0.3)
    ctx.lineTo(cx, cy)
    ctx.stroke()
    ctx.fillStyle = p('#d9704a')
    ctx.beginPath()
    ctx.ellipse(cx + s * 0.18, cy, s * 0.28, s * 0.2, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = p('#b8543a')
    ctx.beginPath()
    ctx.moveTo(cx + s * 0.3, cy - side * s * 0.06)
    ctx.lineTo(cx + s * (0.55 + clawGap * 0.15), cy - side * (s * 0.22 + clawGap * s * 0.15))
    ctx.lineTo(cx + s * 0.5, cy)
    ctx.closePath()
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(cx + s * 0.3, cy + side * s * 0.06)
    ctx.lineTo(cx + s * (0.55 + clawGap * 0.15), cy + side * (s * 0.22 + clawGap * s * 0.15))
    ctx.lineTo(cx + s * 0.5, cy)
    ctx.closePath()
    ctx.fill()
  }
  // 壳
  ctx.fillStyle = bodyGrad(ctx, a, '#d9704a', '#b8543a')
  ctx.beginPath()
  ctx.ellipse(0, 0, s, s * 0.72, 0, 0, Math.PI * 2)
  ctx.fill()
  // 壳缘点列 + 壳纹
  ctx.fillStyle = p('#f2d0be')
  for (let i = 0; i < 7; i++) {
    const ang = Math.PI * (0.15 + (i / 6) * 0.7)
    ctx.beginPath()
    ctx.arc(Math.cos(ang) * s * 0.92, -Math.sin(ang) * s * 0.62, s * 0.05, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.strokeStyle = p('#96422c')
  ctx.lineWidth = Math.max(1.5, s * 0.06)
  ctx.beginPath()
  ctx.moveTo(-s * 0.55, -s * 0.28)
  ctx.quadraticCurveTo(0, -s * 0.5, s * 0.55, -s * 0.28)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(-s * 0.4, 0)
  ctx.quadraticCurveTo(0, -s * 0.18, s * 0.4, 0)
  ctx.stroke()
  // 眼柄
  ctx.strokeStyle = p('#96422c')
  ctx.lineWidth = s * 0.09
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(s * 0.35, side * s * 0.22)
    ctx.lineTo(s * 0.5, side * s * 0.55)
    ctx.stroke()
    eye(ctx, s * 0.52, side * s * 0.58, s * 0.12)
  }
}

function drawSeal(ctx: CanvasRenderingContext2D, a: DrawArgs): void {
  const p = pal(a)
  const s = a.s
  const w = Math.sin(a.t * (3 + a.k * 3)) * s * 0.06
  // 尾鳍（两瓣）
  ctx.fillStyle = p('#8d8073')
  ctx.beginPath()
  ctx.moveTo(-s * 0.85, w)
  ctx.quadraticCurveTo(-s * 1.5, -s * 0.5 + w, -s * 1.55, -s * 0.1 + w)
  ctx.quadraticCurveTo(-s * 1.2, w * 0.5, -s * 1.45, s * 0.35 + w)
  ctx.quadraticCurveTo(-s * 1.1, s * 0.15, -s * 0.85, w)
  ctx.closePath()
  ctx.fill()
  // 腹鳍
  ctx.save()
  ctx.translate(-s * 0.25, s * 0.42)
  ctx.rotate(0.4 + Math.sin(a.t * 2.5) * 0.2)
  ctx.fillStyle = p('#a89b8c')
  ctx.beginPath()
  ctx.ellipse(0, s * 0.1, s * 0.3, s * 0.13, 0.3, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  // 纺锤身
  fishBodyPath(ctx, s, w, 1.05, 0.9)
  ctx.fillStyle = bodyGrad(ctx, a, '#a89b8c', '#d8cfc2')
  ctx.fill()
  ctx.save()
  fishBodyPath(ctx, s, w, 1.05, 0.9)
  ctx.clip()
  dots(ctx, s, p('#6e6459'), 5, 7)
  ctx.restore()
  // 圆头 + 吻 + 小耳 + 胡须
  ctx.fillStyle = p('#b5a897')
  ctx.beginPath()
  ctx.ellipse(s * 0.85, -s * 0.05, s * 0.32, s * 0.27, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(s * 0.6, -s * 0.38, s * 0.09, s * 0.12, 0.4, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = p('#4a423a')
  ctx.beginPath()
  ctx.ellipse(s * 1.12, s * 0.06, s * 0.05, s * 0.04, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(80,70,60,0.8)'
  ctx.lineWidth = Math.max(1, s * 0.03)
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath()
    ctx.moveTo(s * 1.05, s * 0.1 + i * s * 0.06)
    ctx.lineTo(s * 1.5, s * 0.12 + i * s * 0.14)
    ctx.stroke()
  }
  // 大水汪汪眼
  ctx.fillStyle = '#f6f9fb'
  ctx.beginPath()
  ctx.ellipse(s * 0.88, -s * 0.16, s * 0.15, s * 0.17, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#1c1512'
  ctx.beginPath()
  ctx.arc(s * 0.92, -s * 0.14, s * 0.1, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.95)'
  ctx.beginPath()
  ctx.arc(s * 0.88, -s * 0.2, s * 0.035, 0, Math.PI * 2)
  ctx.fill()
}

function drawMonitor(ctx: CanvasRenderingContext2D, a: DrawArgs): void {
  const p = pal(a)
  const s = a.s
  const phase = a.t * (4 + a.k * 5)
  const midY = (u: number): number => Math.sin(phase + u * 2.2) * s * 0.16 * (0.4 + u)
  // 长尾
  ctx.strokeStyle = p('#41552f')
  ctx.lineWidth = s * 0.22
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-s * 0.6, midY(0.35))
  ctx.quadraticCurveTo(-s * 1.5, midY(0.75), -s * 2.1, midY(1))
  ctx.stroke()
  // 四腿（两节行走）
  ctx.strokeStyle = p('#5f7a4a')
  ctx.lineWidth = s * 0.16
  for (let i = 0; i < 2; i++) {
    const swing = Math.sin(phase * 1.4 + i * Math.PI) * s * 0.22
    const lx = i === 0 ? s * 0.45 : -s * 0.4
    for (const side of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(lx, side * s * 0.3)
      ctx.lineTo(lx + swing, side * s * 0.72)
      ctx.lineTo(lx + swing + s * 0.12, side * s * 0.92)
      ctx.stroke()
    }
  }
  // 身体
  ctx.strokeStyle = p('#5f7a4a')
  ctx.lineWidth = s * 0.52
  ctx.beginPath()
  ctx.moveTo(s * 0.55, midY(0.1))
  ctx.quadraticCurveTo(0, midY(0.3), -s * 0.62, midY(0.4))
  ctx.stroke()
  // 背脊小棘
  ctx.fillStyle = p('#c9b45a')
  for (let i = 0; i < 6; i++) {
    const u = 0.12 + i * 0.1
    const x = s * (0.5 - u * 1.1)
    const y = midY(u) - s * 0.28
    ctx.beginPath()
    ctx.moveTo(x - s * 0.05, y)
    ctx.lineTo(x, y - s * 0.16)
    ctx.lineTo(x + s * 0.05, y)
    ctx.closePath()
    ctx.fill()
  }
  // 头（楔形）+ 吐信
  ctx.fillStyle = p('#5f7a4a')
  ctx.beginPath()
  ctx.moveTo(s * 0.5, midY(0.1) - s * 0.16)
  ctx.lineTo(s * 1.15, midY(0.08))
  ctx.lineTo(s * 0.5, midY(0.1) + s * 0.16)
  ctx.closePath()
  ctx.fill()
  const tongue = Math.sin(a.t * 2) > 0.55 ? 1 : 0
  if (tongue) {
    ctx.strokeStyle = p('#e2564a')
    ctx.lineWidth = s * 0.05
    ctx.beginPath()
    ctx.moveTo(s * 1.1, midY(0.08))
    ctx.lineTo(s * 1.5, midY(0.08) - s * 0.06)
    ctx.stroke()
  }
  eye(ctx, s * 0.75, midY(0.1) - s * 0.08, s * 0.1, true)
}

// ———————————————————— 分发 ————————————————————

/** 按物种 id 绘制专属外形 */
export function drawSpecies(ctx: CanvasRenderingContext2D, id: string, a: DrawArgs): void {
  switch (id) {
    case 'minnow':
      drawMinnow(ctx, a)
      break
    case 'herring':
      drawHerring(ctx, a)
      break
    case 'puffer':
      drawPuffer(ctx, a)
      break
    case 'poisonfish':
      drawPoisonfish(ctx, a)
      break
    case 'turtle':
      drawTurtle(ctx, a)
      break
    case 'lantern':
      drawLantern(ctx, a)
      break
    case 'eel':
      drawEel(ctx, a)
      break
    case 'sailfish':
      drawSailfish(ctx, a)
      break
    case 'shark':
      drawShark(ctx, a)
      break
    case 'seagull':
      drawSeagull(ctx, a)
      break
    case 'flyingfish':
      drawFlyingfish(ctx, a)
      break
    case 'pelican':
      drawPelican(ctx, a)
      break
    case 'eagle':
      drawEagle(ctx, a)
      break
    case 'crab':
      drawCrab(ctx, a)
      break
    case 'seal':
      drawSeal(ctx, a)
      break
    case 'monitor':
      drawMonitor(ctx, a)
      break
    default:
      drawMinnow(ctx, a)
  }
}

/** 玩家 8 部位的形态档位（0-3），由能力等级映射 */
export interface PlayerTiers {
  bite: number
  tail: number
  armor: number
  vigor: number
  venom: number
  shock: number
  wing: number
  limb: number
}

/**
 * 玩家翼（胸鳍演化线）：t1 鳍延展（大胸鳍+放射鳍条）→ t2 鳍膜翼化（主翼骨+末端羽化）→ t3 完全翼。
 * far = 远侧片：暗化 + 角度更平（侧视透视），画在身体之前由身体遮挡根部。
 */
function drawPlayerWing(ctx: CanvasRenderingContext2D, s: number, t: number, tier: number, far: boolean): void {
  const flap = Math.sin(t * 9 + (far ? 0.35 : 0))
  const sizeK = [0, 0.85, 1.25, 1.7][tier] ?? 1
  const rays = [0, 5, 7, 9][tier] ?? 0
  ctx.save()
  if (far) ctx.globalAlpha *= 0.55
  // 从胸鳍位置（身体中上部）向后上方展开；远侧角度略平制造纵深
  ctx.translate(s * 0.08, -s * 0.18)
  ctx.rotate((far ? -0.42 : -0.62) + flap * 0.34)

  // 主翼骨（t2 起明显）：从根到翼尖的粗弧骨
  if (tier >= 2) {
    ctx.strokeStyle = far ? '#9c4f1c' : '#c86a2e'
    ctx.lineWidth = s * (0.06 + 0.035 * tier)
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.quadraticCurveTo(-s * 0.65 * sizeK, -s * 0.18, -s * 1.4 * sizeK, -s * 0.5 * sizeK)
    ctx.stroke()
  }

  // 鳍膜：前缘厚实、后缘扇形展开、末端渐透
  const g = ctx.createLinearGradient(0, 0, -s * 1.45 * sizeK, -s * 0.5 * sizeK)
  g.addColorStop(0, far ? 'rgba(214, 138, 70, 0.95)' : 'rgba(255, 190, 120, 0.95)')
  g.addColorStop(0.7, far ? 'rgba(228, 162, 100, 0.75)' : 'rgba(255, 214, 160, 0.8)')
  g.addColorStop(1, 'rgba(255, 232, 196, 0.4)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(s * 0.12, s * 0.02)
  ctx.quadraticCurveTo(-s * 0.75 * sizeK, -s * 0.52 * sizeK, -s * 1.45 * sizeK, -s * 0.48 * sizeK)
  ctx.quadraticCurveTo(-s * 1.15 * sizeK, -s * 0.12, -s * 0.5 * sizeK, s * 0.26)
  ctx.closePath()
  ctx.fill()

  // 放射鳍条：前长后短，t3 末端带羽片
  for (let i = 0; i < rays; i++) {
    const fr = rays > 1 ? i / (rays - 1) : 0.5
    const ang = Math.PI - 0.12 - fr * 0.95 // 从"朝左"向上扇开
    const len = s * sizeK * (1.42 - fr * 0.62)
    const ex = Math.cos(ang) * len
    const ey = -Math.sin(ang) * len
    ctx.strokeStyle = far ? 'rgba(150, 85, 35, 0.6)' : 'rgba(200, 120, 50, 0.55)'
    ctx.lineWidth = s * 0.045
    ctx.beginPath()
    ctx.moveTo(s * 0.05, 0)
    ctx.quadraticCurveTo(ex * 0.5, ey * 0.5 - s * 0.06, ex, ey)
    ctx.stroke()
    if (tier >= 2 && fr < 0.85) {
      // 鳍条末端羽化（演化中的羽片）
      ctx.fillStyle = far ? 'rgba(228, 168, 108, 0.65)' : 'rgba(255, 226, 180, 0.75)'
      ctx.beginPath()
      ctx.ellipse(ex, ey, s * (0.09 + 0.03 * tier), s * 0.05, ang, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()
}

/**
 * 玩家腿（腹鳍演化线）：t1 肉鳍（肉质柄+末端鳍条缘，腔棘鱼式）→ t2 分节肢化（两节+趾垫）→ t3 完全肢（粗壮两节+三爪+髋部鳍膜残余）。
 * far = 远侧对：暗化，画在身体之前由身体遮挡；近侧对画在身体之后。
 */
function drawPlayerLegPair(
  ctx: CanvasRenderingContext2D,
  s: number,
  t: number,
  tier: number,
  walking: boolean,
  far: boolean,
): void {
  const legLen = [0, 0.7, 1.0, 1.35][tier] ?? 1
  const dim = far ? 0.55 : 1
  // 对角步态：前近/后远 同相，前远/后近 反相
  for (const isFront of [true, false]) {
    const phase = walking ? Math.sin(t * 13 + (isFront === far ? 0 : Math.PI)) : 0
    const hipX = isFront ? s * 0.3 : -s * 0.4
    const hipY = s * 0.28
    const kneeX = hipX + phase * s * 0.12
    const kneeY = hipY + legLen * s * 0.4
    const footX = kneeX + phase * s * 0.18
    const footY = hipY + legLen * s * 0.85

    if (tier === 1) {
      // 肉鳍：肉质短柄 + 末端一圈鳍条
      ctx.fillStyle = far ? `rgba(192, 90, 32, ${dim})` : `rgba(224, 123, 57, ${dim})`
      ctx.beginPath()
      ctx.ellipse(hipX + phase * s * 0.06, hipY + legLen * s * 0.25, s * 0.16, s * 0.32, 0.12 * phase, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = far ? `rgba(160, 74, 24, ${dim})` : `rgba(217, 107, 43, ${dim})`
      ctx.lineWidth = s * 0.05
      ctx.lineCap = 'round'
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath()
        ctx.moveTo(hipX + i * s * 0.06, hipY + legLen * s * 0.42)
        ctx.lineTo(hipX + i * s * 0.09 + phase * s * 0.08, hipY + legLen * s * 0.8)
        ctx.stroke()
      }
    } else {
      // 两节肢：大腿粗、小腿细 + 大腿肌块
      ctx.strokeStyle = far ? `rgba(192, 90, 32, ${dim})` : '#d96b2b'
      ctx.lineCap = 'round'
      ctx.lineWidth = s * (0.16 + 0.05 * tier)
      ctx.beginPath()
      ctx.moveTo(hipX, hipY)
      ctx.lineTo(kneeX, kneeY)
      ctx.stroke()
      ctx.lineWidth = s * (0.11 + 0.04 * tier)
      ctx.beginPath()
      ctx.moveTo(kneeX, kneeY)
      ctx.lineTo(footX, footY)
      ctx.stroke()
      ctx.fillStyle = far ? `rgba(204, 102, 40, ${dim})` : '#e07b39'
      ctx.beginPath()
      ctx.ellipse(hipX + phase * s * 0.05, hipY + legLen * s * 0.16, s * (0.15 + 0.04 * tier), s * (0.1 + 0.03 * tier), 0.4 * phase, 0, Math.PI * 2)
      ctx.fill()
      // t3：髋部鳍膜残余（演化痕迹）
      if (tier >= 3) {
        ctx.fillStyle = far ? 'rgba(255, 190, 130, 0.35)' : 'rgba(255, 205, 150, 0.55)'
        ctx.beginPath()
        ctx.moveTo(hipX - s * 0.05, hipY)
        ctx.quadraticCurveTo(hipX - s * 0.2, kneeY * 0.75, kneeX - s * 0.12, kneeY)
        ctx.quadraticCurveTo(hipX + s * 0.06, kneeY * 0.6, hipX + s * 0.1, hipY)
        ctx.closePath()
        ctx.fill()
      }
      // 脚：t2 趾垫 / t3 三爪
      if (tier === 2) {
        ctx.fillStyle = far ? `rgba(170, 80, 28, ${dim})` : '#a35a22'
        ctx.beginPath()
        ctx.ellipse(footX, footY + s * 0.04, s * 0.15, s * 0.09, 0.2 * phase, 0, Math.PI * 2)
        ctx.fill()
      } else {
        ctx.fillStyle = far ? `rgba(138, 74, 31, ${dim})` : '#8a4a1f'
        for (let c = -1; c <= 1; c++) {
          ctx.beginPath()
          ctx.moveTo(footX + c * s * 0.07, footY)
          ctx.lineTo(footX + c * s * 0.13 - s * 0.03, footY + s * (0.15 + 0.07 * tier))
          ctx.lineTo(footX + c * s * 0.07 + s * 0.05, footY + s * 0.01)
          ctx.closePath()
          ctx.fill()
        }
      }
    }
  }
}

/** 玩家颚部：档位放大嘴与牙；高档闭嘴也外露弯牙 */
function drawPlayerJaw(ctx: CanvasRenderingContext2D, s: number, mouth: number, tier: number): void {
  if (mouth > 0.02) {
    openMouth(ctx, s, mouth, 4 + tier * 2, 1 + 0.3 * tier)
    return
  }
  if (tier === 0) return
  ctx.strokeStyle = '#b85a20'
  ctx.lineWidth = s * 0.07
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(s * 0.95, -s * 0.04)
  ctx.quadraticCurveTo(s * (0.55 + 0.12 * tier), s * 0.12, s * 0.35, s * 0.08)
  ctx.stroke()
  // 外露獠牙（overbite）
  const teethN = 1 + tier
  ctx.fillStyle = '#f6f9fb'
  for (let i = 0; i < teethN; i++) {
    const tx = s * (0.86 - i * 0.17)
    const th = s * (0.13 + 0.08 * tier)
    ctx.beginPath()
    ctx.moveTo(tx, s * 0.03)
    ctx.quadraticCurveTo(tx - s * 0.05, s * 0.03 + th * 0.65, tx - s * 0.1, s * 0.03 + th)
    ctx.lineTo(tx - s * 0.15, s * 0.02)
    ctx.closePath()
    ctx.fill()
  }
  if (tier >= 3) {
    // 终形：向下弯的上獠牙一对 + 下颚轮廓
    ctx.strokeStyle = '#a34d18'
    ctx.lineWidth = s * 0.09
    ctx.beginPath()
    ctx.moveTo(s * 0.9, s * 0.02)
    ctx.quadraticCurveTo(s * 0.6, s * 0.24, s * 0.32, s * 0.16)
    ctx.stroke()
    ctx.fillStyle = '#fdfefe'
    for (const [tx, bend] of [
      [s * 0.82, 0.42],
      [s * 0.6, 0.3],
    ] as const) {
      ctx.beginPath()
      ctx.moveTo(tx, s * 0.04)
      ctx.quadraticCurveTo(tx + s * 0.12, s * bend, tx - s * 0.02, s * bend)
      ctx.quadraticCurveTo(tx - s * 0.04, s * bend * 0.4, tx - s * 0.08, s * 0.06)
      ctx.closePath()
      ctx.fill()
    }
  }
}

/** 玩家硬鳞：1 档描边 / 2 档大鳞板 / 3 档头甲 + 背脊骨板 */
function drawPlayerArmor(ctx: CanvasRenderingContext2D, s: number, w: number, tier: number): void {
  if (tier <= 0) return
  ctx.strokeStyle = `rgba(168, 184, 197, ${0.5 + 0.15 * tier})`
  ctx.lineWidth = s * (0.07 + 0.03 * tier)
  fishBodyPath(ctx, s, w)
  ctx.stroke()
  if (tier >= 3) {
    // 头甲：头部后半圈金属甲板 + 铆钉
    ctx.fillStyle = 'rgba(150, 168, 182, 0.9)'
    ctx.beginPath()
    ctx.ellipse(s * 0.42, 0, s * 0.3, s * 0.58, -0.1, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(210, 224, 234, 0.8)'
    ctx.lineWidth = s * 0.05
    ctx.beginPath()
    ctx.ellipse(s * 0.42, 0, s * 0.22, s * 0.5, -0.1, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = '#e8f0f5'
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i / 4) * Math.PI
      ctx.beginPath()
      ctx.arc(s * 0.42 + Math.cos(a) * s * 0.26, Math.sin(a) * s * 0.5, s * 0.045, 0, Math.PI * 2)
      ctx.fill()
    }
    // 背脊骨板
    ctx.fillStyle = 'rgba(150, 168, 182, 0.85)'
    for (let i = 0; i < 3; i++) {
      const bx = -s * 0.5 + i * s * 0.3
      ctx.beginPath()
      ctx.moveTo(bx - s * 0.09, -s * 0.5 + w * 0.4)
      ctx.lineTo(bx, -s * (0.72 - i * 0.03))
      ctx.lineTo(bx + s * 0.09, -s * 0.5 + w * 0.4)
      ctx.closePath()
      ctx.fill()
    }
  }
}

/** 玩家毒棘：1 档背棘 / 2 档加长+发光珠 / 3 档棘冠 + 滴毒 */
function drawPlayerSpikes(ctx: CanvasRenderingContext2D, s: number, t: number, tier: number): void {
  if (tier <= 0) return
  const n = [0, 3, 5, 7][tier] ?? 0
  const h = s * (0.28 + 0.16 * tier)
  for (let i = 0; i < n; i++) {
    const bx = -s * 0.55 + (n > 1 ? (i / (n - 1)) * s * 1.1 : s * 0.3)
    ctx.fillStyle = `rgba(169, 95, 214, ${0.75 + 0.08 * tier})`
    ctx.beginPath()
    ctx.moveTo(bx - s * 0.07, -s * 0.48)
    ctx.lineTo(bx, -s * 0.48 - h * (i === Math.floor(n / 2) ? 1.25 : 1))
    ctx.lineTo(bx + s * 0.07, -s * 0.48)
    ctx.closePath()
    ctx.fill()
    if (tier >= 2) {
      ctx.fillStyle = `rgba(210, 150, 255, ${0.5 + 0.3 * Math.sin(t * 6 + i)})`
      ctx.beginPath()
      ctx.arc(bx, -s * 0.48 - h * 1.1, s * 0.055, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  if (tier >= 3) {
    // 体侧短棘 + 滴毒
    for (const side of [-1, 1]) {
      for (let i = 0; i < 2; i++) {
        const bx = s * (0.15 - i * 0.45)
        ctx.fillStyle = 'rgba(169, 95, 214, 0.7)'
        ctx.beginPath()
        ctx.moveTo(bx - s * 0.05, side * s * 0.5)
        ctx.lineTo(bx, side * (s * 0.5 + s * 0.28))
        ctx.lineTo(bx + s * 0.05, side * s * 0.5)
        ctx.closePath()
        ctx.fill()
      }
    }
    ctx.fillStyle = 'rgba(190, 120, 250, 0.8)'
    for (let i = 0; i < 2; i++) {
      const ph = (t * 0.7 + i * 0.5) % 1
      ctx.beginPath()
      ctx.arc(-s * 0.3 + i * s * 0.5, -s * 0.9 + ph * s * 0.7, s * 0.05, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

/** 玩家电纹：1 档单侧细纹 / 2 档双侧亮弧 / 3 档体周闪火 + 黄眼 */
function drawPlayerArcs(ctx: CanvasRenderingContext2D, s: number, t: number, tier: number): void {
  if (tier <= 0) return
  ctx.strokeStyle = `rgba(240, 208, 64, ${0.55 + 0.15 * tier})`
  ctx.lineWidth = s * (0.06 + 0.03 * tier)
  ctx.lineJoin = 'miter'
  const zig = (y0: number, amp: number): void => {
    ctx.beginPath()
    let zx = -s * 0.55
    let up = false
    ctx.moveTo(zx, y0)
    while (zx < s * 0.45) {
      zx += s * 0.18
      up = !up
      ctx.lineTo(zx, y0 + (up ? -amp : amp))
    }
    ctx.stroke()
  }
  zig(s * 0.08, s * (0.14 + 0.04 * tier))
  if (tier >= 2) zig(-s * 0.12, s * (0.12 + 0.04 * tier))
  if (tier >= 3) {
    // 体周随机闪火
    for (let i = 0; i < 3; i++) {
      const a = t * 8 + i * 2.4
      const flick = Math.sin(t * 30 + i * 5)
      if (flick < 0) continue
      const sx = Math.cos(a) * s * 1.35
      const sy = Math.sin(a) * s * 0.9
      ctx.strokeStyle = `rgba(255, 236, 120, ${0.5 + 0.5 * flick})`
      ctx.lineWidth = s * 0.06
      ctx.beginPath()
      ctx.moveTo(sx * 0.75, sy * 0.75)
      ctx.lineTo(sx * 0.75 + s * 0.12, sy * 0.75 - s * 0.1)
      ctx.lineTo(sx, sy)
      ctx.stroke()
    }
  }
}

/** 玩家鱼体：8 部位按能力等级分档生长（复用通用部件） */
export function drawPlayerFish(
  ctx: CanvasRenderingContext2D,
  opts: {
    s: number
    t: number
    k: number
    mouth: number
    tiers: PlayerTiers
    hurt?: boolean
    ground?: boolean
  },
): void {
  const { s, t, k } = opts
  const T = opts.tiers
  const w = Math.sin(t * (5 + 8 * k)) * s * 0.13 * (1 + 0.15 * T.tail)

  // 生命力：躯干随档位显著变大（纯视觉，不影响碰撞）
  if (T.vigor > 0) {
    const g = 1 + 0.12 * T.vigor
    ctx.scale(g, g)
  }

  // —— 深度分层（侧视遮挡）：远侧翼/腿先画，之后被身体遮挡 ——
  if (T.wing > 0) drawPlayerWing(ctx, s, t, T.wing, true)
  if (T.limb > 0) drawPlayerLegPair(ctx, s, t, T.limb, opts.ground === true && k > 0.05, true)

  // 尾力：尾柄肌肉块 + 显著加长的尾鳍
  if (T.tail >= 2) {
    ctx.fillStyle = '#e07b39'
    ctx.beginPath()
    ctx.ellipse(-s * 0.55, w * 0.5, s * (0.32 + 0.08 * T.tail), s * (0.24 + 0.06 * T.tail), 0, 0, Math.PI * 2)
    ctx.fill()
  }
  forkTail(ctx, s, w, '#e07b39', 1 + 0.35 * T.tail)

  dorsalFin(ctx, s, 'pointed', '#e07b39', w)

  // 身体
  fishBodyPath(ctx, s, w)
  const grad = ctx.createLinearGradient(0, -s, 0, s)
  grad.addColorStop(0, opts.hurt ? '#f4f8fa' : '#ff8c42')
  grad.addColorStop(1, opts.hurt ? '#f4f8fa' : '#ffc89b')
  ctx.fillStyle = grad
  ctx.fill()
  ctx.save()
  fishBodyPath(ctx, s, w)
  ctx.clip()
  stripes(ctx, s, 'rgba(200, 90, 30, 0.4)', 3, 1)
  // 硬鳞 2 档起：大鳞板列
  if (T.armor >= 2) {
    for (let i = 0; i < 3; i++) {
      const ax = s * (0.35 - i * 0.36)
      ctx.strokeStyle = `rgba(190, 205, 215, ${0.4 + 0.12 * T.armor})`
      ctx.lineWidth = s * 0.09
      ctx.beginPath()
      ctx.arc(ax, 0, s * (0.5 + i * 0.1), -Math.PI * 0.42, Math.PI * 0.42)
      ctx.stroke()
    }
  }
  // 电纹
  if (T.shock > 0) drawPlayerArcs(ctx, s, t, T.shock)
  ctx.restore()

  // 硬鳞描边与头甲
  drawPlayerArmor(ctx, s, w, T.armor)
  // 毒棘（背脊）
  drawPlayerSpikes(ctx, s, t, T.venom)

  // 翼即胸鳍的演化：有翼时不再画原始小胸鳍
  if (T.wing === 0) pectoralFin(ctx, s, t, '#ffb37a', k)
  gillSlits(ctx, s, 2, 'rgba(180, 80, 25, 0.6)')

  // —— 近侧翼/腿画在身体之上（侧视遮挡的前层）——
  if (T.limb > 0) drawPlayerLegPair(ctx, s, t, T.limb, opts.ground === true && k > 0.05, false)
  if (T.wing > 0) drawPlayerWing(ctx, s, t, T.wing, false)

  // 嘴（咬合力）
  drawPlayerJaw(ctx, s, opts.mouth, T.bite)
  eye(ctx, s * 0.52, -s * 0.14, s * 0.19)
  // 电击终形：黄眼光
  if (T.shock >= 3) {
    const glow = 0.4 + 0.3 * Math.sin(t * 8)
    ctx.fillStyle = `rgba(255, 236, 120, ${glow})`
    ctx.beginPath()
    ctx.arc(s * 0.52, -s * 0.14, s * 0.3, 0, Math.PI * 2)
    ctx.fill()
  }
}
