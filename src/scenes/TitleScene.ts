import type { Game } from '../core/Game'
import type { Scene } from '../core/SceneManager'

export class TitleScene implements Scene {
  readonly name = 'title'
  private game!: Game
  private elapsed = 0

  enter(game: Game): void {
    this.game = game
    this.elapsed = 0
  }

  exit(): void {}

  update(dt: number): void {
    this.elapsed += dt
    if (this.game.input.confirmJustPressed()) {
      this.game.scenes.change('world')
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    const { width, height } = this.game
    const grad = ctx.createLinearGradient(0, 0, 0, height)
    grad.addColorStop(0, '#0b4f79')
    grad.addColorStop(1, '#04263f')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, width, height)

    ctx.textAlign = 'center'
    ctx.fillStyle = '#eaf6ff'
    ctx.font = 'bold 56px system-ui, sans-serif'
    ctx.fillText('大鱼吃小鱼', width / 2, height * 0.28)

    ctx.font = '22px system-ui, sans-serif'
    ctx.fillStyle = 'rgba(234, 246, 255, 0.85)'
    ctx.fillText('开放世界 · 吞噬进化', width / 2, height * 0.28 + 48)

    ctx.font = '15px system-ui, sans-serif'
    ctx.fillStyle = 'rgba(234, 246, 255, 0.6)'
    ctx.fillText('电脑：WASD 移动 · 空格/鼠标 撕咬 · Q/E/R 释放技能 · G 键调试', width / 2, height * 0.58)
    ctx.fillText('手机：横屏游玩（点按自动全屏）· 左半屏摇杆 · 右侧攻击 · 技能栏按钮', width / 2, height * 0.58 + 26)
    ctx.fillText('击败生物吃肉进化——吃翼肉长翼，吃肢肉长腿，各走各的进化路线', width / 2, height * 0.58 + 52)

    if (Math.sin(this.elapsed * 4) > -0.2) {
      ctx.fillStyle = '#7fd8ff'
      ctx.font = 'bold 26px system-ui, sans-serif'
      ctx.fillText('点按任意处开始探索', width / 2, height * 0.8)
    }
  }
}
