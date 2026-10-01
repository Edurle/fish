import type { Game } from './Game'

/** 切换场景时可携带的参数，如 gameOver 场景需要本局分数 */
export type SceneParams = Record<string, unknown>

/** 场景 = 一段独立的游戏状态（标题、对局、结算……），由 SceneManager 调度 */
export interface Scene {
  readonly name: string
  enter(game: Game, params?: SceneParams): void
  exit(): void
  update(dt: number): void
  render(ctx: CanvasRenderingContext2D): void
}

export class SceneManager {
  private readonly scenes = new Map<string, Scene>()
  private current: Scene | null = null

  constructor(private readonly game: Game) {}

  register(scene: Scene): void {
    this.scenes.set(scene.name, scene)
  }

  get currentScene(): Scene | null {
    return this.current
  }

  change(name: string, params?: SceneParams): void {
    this.current?.exit()
    const next = this.scenes.get(name)
    if (!next) throw new Error(`未注册的场景: ${name}`)
    this.current = next
    next.enter(this.game, params)
  }

  update(dt: number): void {
    this.current?.update(dt)
  }

  render(): void {
    if (this.current) this.current.render(this.game.ctx)
  }
}
