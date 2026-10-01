import { clamp } from '../core/math'
import { Creature, SPECIES } from '../entities/Creature'
import type { SpeciesDef } from '../entities/Creature'
import type { Player } from '../entities/Player'
import type { World } from '../world/World'

interface ZoneRule {
  /** 玩家在该区域时才维持刷新 */
  active: (player: Player, world: World) => boolean
  /** 生成介质采点 */
  medium: 'water' | 'air' | 'land'
  /** 各物种目标数量（群生物按群计）；函数形式按玩家平均能力等级动态调整 */
  entries: Array<{ id: string; groups: number | ((avgLv: number) => number) }>
  /** 水生区域深度带（相对水面线） */
  depthBand?: [number, number]
}

function findSpecies(id: string) {
  const s = SPECIES.find((sp) => sp.id === id)
  if (!s) throw new Error(`未知物种: ${id}`)
  return s
}

const ZONES: ReadonlyArray<ZoneRule> = [
  {
    medium: 'water',
    active: (p, w) => p.y > w.waterY && p.y < w.waterY + 1000,
    depthBand: [60, 950],
    entries: [
      // 小鱼是起步食粮：玩家平均能力等级越高，小鱼群越少直至绝迹
      { id: 'minnow', groups: (avgLv) => (avgLv < 1.2 ? 2 : avgLv < 4 ? 1 : 0) },
      { id: 'herring', groups: 3 },
    ],
  },
  {
    medium: 'water',
    active: (p, w) => p.y >= w.waterY + 900 && p.y < w.waterY + 1900,
    depthBand: [950, 1850],
    entries: [
      { id: 'puffer', groups: 2 },
      { id: 'poisonfish', groups: 2 },
      { id: 'turtle', groups: 1 },
    ],
  },
  {
    medium: 'water',
    active: (p, w) => p.y >= w.waterY + 1800,
    depthBand: [1850, 4100],
    entries: [
      { id: 'lantern', groups: 2 },
      { id: 'eel', groups: 2 },
    ],
  },
  {
    medium: 'water',
    active: (p, w) => p.y > w.waterY && (p.x < 2600 || p.x > w.width - 2600),
    depthBand: [60, 4100],
    entries: [
      { id: 'sailfish', groups: 2 },
      { id: 'shark', groups: 2 },
    ],
  },
  {
    medium: 'air',
    active: (p, w) => p.y < w.waterY,
    entries: [
      { id: 'seagull', groups: 2 },
      { id: 'flyingfish', groups: 2 },
      { id: 'pelican', groups: 1 },
      { id: 'eagle', groups: 1 },
    ],
  },
  {
    medium: 'land',
    active: (p, w) => p.y < w.waterY + 200 && w.regionAt(p.x, p.y) === '岛屿',
    entries: [
      { id: 'crab', groups: 3 },
      { id: 'seal', groups: 2 },
      { id: 'monitor', groups: 1 },
    ],
  },
]

const MAX_CREATURES = 46
const RECYCLE_DIST = 2400

/**
 * 生态刷新：玩家所在区域维持目标密度的生物，
 * 生成在玩家周围屏幕外环带，远离时回收。
 * avgLv 为玩家八项能力平均等级，驱动小鱼等低端食粮的递减。
 */
export class SpawnManager {
  private tickTimer = 0

  update(dt: number, player: Player, world: World, creatures: Creature[], avgLv: number): void {
    this.tickTimer -= dt
    if (this.tickTimer > 0) return
    this.tickTimer = 0.7

    // 回收远离的生物（连同群锚点）
    for (let i = creatures.length - 1; i >= 0; i--) {
      const c = creatures[i]
      if (Math.hypot(c.x - player.x, c.y - player.y) > RECYCLE_DIST) {
        creatures.splice(i, 1)
      }
    }

    // 群锚点缓慢漂移（让鱼群不僵在原地）
    for (const c of creatures) {
      const a = c.groupAnchor
      if (a) {
        a.x += (Math.random() - 0.5) * 60
        a.y += (Math.random() - 0.5) * 40
      }
    }

    if (creatures.length >= MAX_CREATURES) return

    for (const zone of ZONES) {
      if (!zone.active(player, world)) continue
      for (const entry of zone.entries) {
        const species = findSpecies(entry.id)
        const targetGroups = typeof entry.groups === 'function' ? entry.groups(avgLv) : entry.groups
        if (targetGroups <= 0) continue
        // 群生物按"还有成员在场的群数"统计，独居生物按个体数
        let count: number
        if (species.group > 1) {
          const anchors = new Set()
          for (const c of creatures) {
            if (c.species.id === entry.id && c.groupAnchor) anchors.add(c.groupAnchor)
          }
          count = anchors.size
        } else {
          count = creatures.filter((c) => c.species.id === entry.id).length
        }
        if (count >= targetGroups) continue
        this.spawnGroup(species, player, world, creatures)
        if (creatures.length >= MAX_CREATURES) return
      }
    }
  }

  private spawnGroup(
    species: SpeciesDef,
    player: Player,
    world: World,
    creatures: Creature[],
  ): void {
    const home = this.sampleSpawnPos(species, player, world)
    if (!home) return

    if (species.group <= 1) {
      creatures.push(new Creature(species, home.x, home.y))
      return
    }
    // 群：共享锚点
    const anchor = { x: home.x, y: home.y, vx: 0, vy: 0 }
    for (let i = 0; i < species.group; i++) {
      const c = new Creature(
        species,
        home.x + (Math.random() - 0.5) * 260,
        home.y + (Math.random() - 0.5) * 160,
      )
      c.groupAnchor = anchor
      creatures.push(c)
    }
  }

  /** 在玩家屏幕外环带采样符合介质且不卡在岛礁内的生成点 */
  private sampleSpawnPos(
    species: SpeciesDef,
    player: Player,
    world: World,
  ): { x: number; y: number } | null {
    for (let attempt = 0; attempt < 8; attempt++) {
      const ang = Math.random() * Math.PI * 2
      const dist = 850 + Math.random() * 450
      const x = clamp(60, world.width - 60, player.x + Math.cos(ang) * dist)

      if (species.medium === 'water') {
        const [lo, hi] = zoneDepthBand(species.id) ?? [60, 4100]
        const y = clamp(
          world.waterY + lo + 40,
          world.waterY + hi - 40,
          player.y + Math.sin(ang) * dist,
        )
        const pos = { x, y: Math.min(y, world.height - 60) }
        if (!this.insideIsland(pos.x, pos.y, world)) return pos
        continue
      }
      if (species.medium === 'air') {
        const y = clamp(120, world.waterY - 70, player.y + Math.sin(ang) * dist)
        return { x, y }
      }
      // 陆生：找玩家附近岛屿的顶块（天然不会卡）
      const candidates = world.islands.filter(
        (b) => b.y < world.waterY && Math.abs(b.x + b.w / 2 - player.x) < 1800,
      )
      if (candidates.length === 0) return null
      const b = candidates[Math.floor(Math.random() * candidates.length)]
      return { x: b.x + 40 + Math.random() * (b.w - 80), y: b.y - 30 }
    }
    return null
  }

  /** 生成点是否落在任一岛块（外扩 70px）内 */
  private insideIsland(x: number, y: number, world: World): boolean {
    for (const b of world.islands) {
      if (x > b.x - 70 && x < b.x + b.w + 70 && y > b.y - 70 && y < b.y + b.h + 70) return true
    }
    return false
  }
}

function zoneDepthBand(id: string): [number, number] | undefined {
  for (const z of ZONES) {
    if (z.depthBand && z.entries.some((e) => e.id === id)) return z.depthBand
  }
  return undefined
}
