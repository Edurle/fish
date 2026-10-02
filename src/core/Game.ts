import { InputManager } from './Input'
import { SceneManager } from './SceneManager'
import { TitleScene } from '../scenes/TitleScene'
import { WorldScene } from '../scenes/WorldScene'

/**
 * 游戏主对象：负责画布尺寸、主循环和全局系统（输入/场景）。
 * 具体玩法逻辑放在各个 Scene 中，Game 本身不关心游戏内容。
 * 纯局内体验：不做持久化存档，死亡由场景自行处理重开。
 */
export class Game {
  readonly ctx: CanvasRenderingContext2D
  readonly input: InputManager
  readonly scenes: SceneManager

  /** 逻辑尺寸（CSS 像素），随窗口变化；游戏对象直接使用该坐标系 */
  width = 0
  height = 0
  /** 刘海/灵动岛安全区（standalone 全屏模式下的 HUD 偏移） */
  readonly safeArea = { top: 0, left: 0, right: 0 }

  private rafId = 0
  private lastTime = 0
  private running = false
  private safeProbe: HTMLDivElement

  constructor(readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('无法创建 2D 渲染上下文')
    this.ctx = ctx

    this.input = new InputManager(canvas)
    this.scenes = new SceneManager(this)

    this.scenes.register(new TitleScene())
    this.scenes.register(new WorldScene())
    this.scenes.change('title')

    window.addEventListener('resize', () => this.resize())
    window.addEventListener('orientationchange', () => this.resize())
    // 安全区探针：读取 env(safe-area-inset-*)（viewport-fit=cover + standalone 模式生效）
    this.safeProbe = document.createElement('div')
    this.safeProbe.style.cssText =
      'position:fixed;top:0;left:0;right:0;width:100vw;height:env(safe-area-inset-top,0px);padding-left:env(safe-area-inset-left,0px);padding-right:env(safe-area-inset-right,0px);visibility:hidden;pointer-events:none'
    document.body.appendChild(this.safeProbe)
    // 触摸设备：任意首次点按进入全屏并尝试锁定横屏（须在用户手势事件内同步请求）
    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch' && !document.fullscreenElement) {
        void document.documentElement.requestFullscreen?.().catch(() => {})
        // 实验性 API：部分浏览器（iOS Safari）不支持锁定，失败即忽略
        const orientation = screen.orientation as ScreenOrientation & {
          lock?: (o: string) => Promise<void>
        }
        orientation.lock?.('landscape').catch(() => {})
      }
    })
    this.resize()
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.lastTime = performance.now()
    this.rafId = requestAnimationFrame(this.loop)
  }

  stop(): void {
    this.running = false
    cancelAnimationFrame(this.rafId)
  }

  /** 按设备像素比设置画布，保证高分屏/手机上渲染清晰 */
  private resize(): void {
    const dpr = window.devicePixelRatio || 1
    this.width = window.innerWidth
    this.height = window.innerHeight
    // 设置 canvas.width 会重置变换矩阵，因此每次都要重设 dpr 缩放
    this.canvas.width = Math.round(this.width * dpr)
    this.canvas.height = Math.round(this.height * dpr)
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const style = getComputedStyle(this.safeProbe)
    this.safeArea.top = parseFloat(style.height) || 0
    this.safeArea.left = parseFloat(style.paddingLeft) || 0
    this.safeArea.right = parseFloat(style.paddingRight) || 0
  }

  private loop = (now: number): void => {
    if (!this.running) return
    // 限制 dt 上限，避免切后台再回来时逻辑跳变
    const dt = Math.min((now - this.lastTime) / 1000, 0.05)
    this.lastTime = now
    this.scenes.update(dt)
    this.scenes.render()
    this.drawPortraitOverlay()
    this.input.endFrame()
    this.rafId = requestAnimationFrame(this.loop)
  }

  /** 触摸设备竖屏时全屏遮罩提示旋转（横屏锁定不被支持的浏览器 fallback） */
  private drawPortraitOverlay(): void {
    const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0
    if (!touch || this.width > this.height * 1.05) return
    const ctx = this.ctx
    ctx.fillStyle = 'rgba(4, 14, 26, 0.94)'
    ctx.fillRect(0, 0, this.width, this.height)
    // 旋转的手机示意
    ctx.save()
    ctx.translate(this.width / 2, this.height * 0.4)
    ctx.rotate(Math.sin(performance.now() / 500) * 0.4 - Math.PI / 2)
    ctx.strokeStyle = '#7fd8ff'
    ctx.lineWidth = 5
    ctx.lineJoin = 'round'
    const w = Math.min(this.width * 0.3, 96)
    ctx.strokeRect(-w / 2, -w * 0.9, w, w * 1.8)
    ctx.fillStyle = '#7fd8ff'
    ctx.beginPath()
    ctx.arc(0, w * 0.66, 6, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    ctx.fillStyle = '#eaf6ff'
    ctx.font = 'bold 22px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('请旋转手机至横屏游玩', this.width / 2, this.height * 0.64)
    ctx.font = '14px system-ui, sans-serif'
    ctx.fillStyle = 'rgba(234, 246, 255, 0.6)'
    ctx.fillText('大鱼吃小鱼 · 开放世界', this.width / 2, this.height * 0.64 + 30)
    ctx.textAlign = 'left'
  }
}
