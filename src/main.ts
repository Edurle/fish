import './styles.css'
import { Game } from './core/Game'

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null
if (!canvas) throw new Error('找不到 #game-canvas 元素')

const game = new Game(canvas)
game.start()

// 暴露到全局便于控制台调试（如 (window).__fishGame.stop()）
;(window as unknown as Record<string, unknown>).__fishGame = game
