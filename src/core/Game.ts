import { InputManager } from './Input'
import { SaveManager } from './Storage'
import { SceneManager } from './SceneManager'
import { TitleScene } from '../scenes/TitleScene'
import { WorldScene } from '../scenes/WorldScene'

/**
 * 游戏主对象：负责画布尺寸、主循环和全局系统（输入/存档/场景）。
 * 具体玩法逻辑放在各个 Scene 中，Game 本身不关心游戏内容。
 */
export class Game {
  readonly ctx: CanvasRenderingContext2D
  readonly input: InputManager
  readonly saves: SaveManager
  readonly scenes: SceneManager

  /** 逻辑尺寸（CSS 像素），随窗口变化；游戏对象直接使用该坐标系 */
  width = 0
  height = 0

  private rafId = 0
  private lastTime = 0
  private running = false

  constructor(readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('无法创建 2D 渲染上下文')
    this.ctx = ctx

    this.input = new InputManager(canvas)
    this.saves = new SaveManager()
    this.scenes = new SceneManager(this)

    this.scenes.register(new TitleScene())
    this.scenes.register(new WorldScene())
    this.scenes.change('title')

    window.addEventListener('resize', () => this.resize())
    window.addEventListener('orientationchange', () => this.resize())
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
