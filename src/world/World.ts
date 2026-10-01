import { mulberry32 } from '../core/rng'

/** 岛屿陆地块：AABB，多个块堆叠成岛（顶块露出水面，底盘在水下） */
export interface IslandBlock {
  x: number
  y: number
  w: number
  h: number
}

export interface Cloud {
  x: number
  y: number
  scale: number
}


/**
 * 侧视开放世界：
 * y < waterY 为天空，y > waterY 为水体；岛屿跨在水面线上。
 * 世界由 seed 确定性生成（2d 起随存档持久化 seed）。
 */
export class World {
  readonly width: number
  readonly height: number
  readonly waterY: number
  readonly islands: IslandBlock[] = []
  readonly clouds: Cloud[] = []
  readonly spawnX: number
  readonly spawnY: number

  constructor(readonly seed: number, width = 16000, waterY = 2400, waterDepth = 4200) {
    this.width = width
    this.waterY = waterY
    this.height = waterY + waterDepth
    this.spawnX = width / 2
    this.spawnY = waterY + 520
    this.generate()
  }

  private generate(): void {
    const rnd = mulberry32(this.seed)

    // 岛屿：均布 + 抖动，避开出生点附近
    const count = 6
    for (let i = 0; i < count; i++) {
      const cx = ((i + 0.5) / count) * this.width + (rnd() - 0.5) * 1200
      if (Math.abs(cx - this.spawnX) < 1300) continue

      const topW = 480 + rnd() * 560
      const topH = 170 + rnd() * 240
      // 顶块：露出水面，底边略没入水中
      this.islands.push({
        x: cx - topW / 2,
        y: this.waterY - topH,
        w: topW,
        h: topH + 50,
      })
      // 两层水下底盘，逐层加宽形成锥形岛基
      const baseW1 = topW + 420 + rnd() * 260
      this.islands.push({
        x: cx - baseW1 / 2,
        y: this.waterY + 110,
        w: baseW1,
        h: 260 + rnd() * 180,
      })
      const baseW2 = baseW1 + 380 + rnd() * 220
      this.islands.push({
        x: cx - baseW2 / 2,
        y: this.waterY + 400,
        w: baseW2,
        h: 230 + rnd() * 160,
      })
    }

    // 云：高空装饰
    for (let i = 0; i < 22; i++) {
      this.clouds.push({
        x: rnd() * this.width,
        y: 140 + rnd() * 1500,
        scale: 0.6 + rnd() * 0.9,
      })
    }
  }


  /** 玩家所处的区域名（HUD 展示 + 后续生态分区） */
  regionAt(x: number, y: number): string {
    if (y < this.waterY) {
      // 在岛屿顶块上方附近算作岛屿区域
      for (const b of this.islands) {
        if (b.y < this.waterY && Math.abs(x - (b.x + b.w / 2)) < b.w / 2 + 220 && y < b.y + 40) {
          return '岛屿'
        }
      }
      return '天空'
    }
    const deep = y > this.waterY + 1400
    const ocean = x < 2600 || x > this.width - 2600
    if (deep) return ocean ? '远洋深渊' : '深海'
    return ocean ? '远洋浅海' : '浅海'
  }
}
