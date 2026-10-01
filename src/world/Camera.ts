import { clamp } from '../core/math'
import type { World } from './World'

/** 跟随玩家的平滑相机，限制在世界边界内 */
export class Camera {
  x = 0
  y = 0

  constructor(private readonly world: World) {}

  update(dt: number, targetX: number, targetY: number, viewW: number, viewH: number): void {
    const targetCamX = clamp(0, Math.max(0, this.world.width - viewW), targetX - viewW / 2)
    const targetCamY = clamp(0, Math.max(0, this.world.height - viewH), targetY - viewH / 2)
    // 指数平滑：帧率无关
    const k = 1 - Math.pow(0.001, dt)
    this.x += (targetCamX - this.x) * k
    this.y += (targetCamY - this.y) * k
  }

  /** 出生/复活时直接对准目标，不做平滑飞行 */
  snap(targetX: number, targetY: number, viewW: number, viewH: number): void {
    this.x = clamp(0, Math.max(0, this.world.width - viewW), targetX - viewW / 2)
    this.y = clamp(0, Math.max(0, this.world.height - viewH), targetY - viewH / 2)
  }
}
