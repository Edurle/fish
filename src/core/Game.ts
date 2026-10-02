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
    window.addEventListener('orientationchange', () => this.scheduleResize())
    // iOS 地址栏收展与旋转时 visualViewport 才是真实可见区
    window.visualViewport?.addEventListener('resize', () => this.resize())
    // 安全区探针：读取 env(safe-area-inset-*)（viewport-fit=cover + standalone 模式生效）
    this.safeProbe = document.createElement('div')
    this.safeProbe.style.cssText =
      'position:fixed;top:0;left:0;right:0;width:100vw;height:env(safe-area-inset-top,0px);padding-left:env(safe-area-inset-left,0px);padding-right:env(safe-area-inset-right,0px);visibility:hidden;pointer-events:none'
    document.body.appendChild(this.safeProbe)
    // 触摸设备：任意首次点按进入全屏（须在用户手势事件内同步请求；横竖屏均可游玩）
    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch' && !document.fullscreenElement) {
        void document.documentElement.requestFullscreen?.().catch(() => {})
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

  /** 旋转后 iOS 的视口尺寸更新有延迟：稍后复测一次 */
  private scheduleResize(): void {
    this.resize()
    for (const delay of [150, 400, 900]) {
      window.setTimeout(() => this.resize(), delay)
    }
  }

  /** 按设备像素比设置画布，保证高分屏/手机上渲染清晰 */
  private resize(): void {
    const dpr = window.devicePixelRatio || 1
    // visualViewport 为真实可见区（不含 Safari 地址栏/工具条），避免拉伸与按钮出屏
    const vv = window.visualViewport
    this.width = Math.round(vv?.width ?? window.innerWidth)
    this.height = Math.round(vv?.height ?? window.innerHeight)
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
    this.input.endFrame()
    this.rafId = requestAnimationFrame(this.loop)
  }
}
