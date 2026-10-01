import type { IslandBlock } from './World'

export interface CircleCollisionResult {
  /** 碰撞法线 x */
  nx: number
  /** 碰撞法线 y */
  ny: number
  /** 玩家是否落在块顶（可站立） */
  landed: boolean
}

/**
 * 圆 vs 岛块 AABB 集合：把圆推出所有重叠块。
 * 返回最后一次推出的法线与是否站上块顶；无碰撞返回 null。
 */
export function resolveCircleVsBlocks(
  x: number,
  y: number,
  r: number,
  blocks: readonly IslandBlock[],
  onPush?: (nx: number, ny: number) => void,
): { x: number; y: number } & Partial<CircleCollisionResult> {
  let px = x
  let py = y
  let landed = false
  let lastNx = 0
  let lastNy = 0
  for (const b of blocks) {
    if (px + r < b.x || px - r > b.x + b.w) continue
    if (py + r < b.y || py - r > b.y + b.h) continue

    const cx = Math.max(b.x, Math.min(b.x + b.w, px))
    const cy = Math.max(b.y, Math.min(b.y + b.h, py))
    const dx = px - cx
    const dy = py - cy
    const distSq = dx * dx + dy * dy
    if (distSq >= r * r) continue

    let nx: number
    let ny: number
    let depth: number
    if (distSq > 1e-6) {
      const dist = Math.sqrt(distSq)
      nx = dx / dist
      ny = dy / dist
      depth = r - dist
    } else {
      const left = px - b.x
      const right = b.x + b.w - px
      const top = py - b.y
      const bottom = b.y + b.h - py
      const minPen = Math.min(left, right, top, bottom)
      if (minPen === top) {
        nx = 0
        ny = -1
        depth = top + r
      } else if (minPen === bottom) {
        nx = 0
        ny = 1
        depth = bottom + r
      } else if (minPen === left) {
        nx = -1
        ny = 0
        depth = left + r
      } else {
        nx = 1
        ny = 0
        depth = right + r
      }
    }

    px += nx * depth
    py += ny * depth
    lastNx = nx
    lastNy = ny
    if (ny < -0.5) landed = true
    onPush?.(nx, ny)
  }
  if (px === x && py === y) return { x, y }
  return { x: px, y: py, nx: lastNx, ny: lastNy, landed }
}

/** 指定 x 处水面上方最高的岛屿块顶 y；没有岛屿则返回 null */
export function groundTopAt(blocks: readonly IslandBlock[], x: number, waterY: number): number | null {
  let top: number | null = null
  for (const b of blocks) {
    if (b.y >= waterY) continue
    if (x >= b.x && x <= b.x + b.w) {
      if (top === null || b.y < top) top = b.y
    }
  }
  return top
}

/** 线段是否与任一岛块相交（Liang-Barsky），供生物视线检测 */
export function segmentHitsBlocks(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  blocks: readonly IslandBlock[],
): boolean {
  const dx = x2 - x1
  const dy = y2 - y1
  for (const b of blocks) {
    let t0 = 0
    let t1 = 1
    let outside = false
    const edges: ReadonlyArray<readonly [number, number]> = [
      [-dx, x1 - b.x],
      [dx, b.x + b.w - x1],
      [-dy, y1 - b.y],
      [dy, b.y + b.h - y1],
    ]
    for (const [p, q] of edges) {
      if (p === 0) {
        if (q < 0) {
          outside = true
          break
        }
        continue
      }
      const r = q / p
      if (p < 0) {
        if (r > t1) {
          outside = true
          break
        }
        if (r > t0) t0 = r
      } else {
        if (r < t0) {
          outside = true
          break
        }
        if (r < t1) t1 = r
      }
    }
    if (!outside) return true
  }
  return false
}
