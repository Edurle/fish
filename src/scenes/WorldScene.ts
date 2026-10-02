import type { Game } from '../core/Game'
import type { Scene } from '../core/SceneManager'
import type { InputManager } from '../core/Input'
import { clamp } from '../core/math'
import { Player } from '../entities/Player'
import { Creature, ELITE_NAMES, SPECIES } from '../entities/Creature'
import { MeatChunk } from '../entities/MeatChunk'
import { Boss, BOSS_DEFS } from '../entities/Boss'
import { Relic } from '../entities/Relic'
import { Shard } from '../entities/Shard'
import {
  createDisaster,
  DISASTER_KINDS,
  DISASTER_LABELS,
  type Disaster,
  type DisasterContext,
  type DisasterKind,
} from '../entities/Disaster'
import {
  BOSS_SKILLS,
  CHEST_SKILLS,
  Chest,
  ELITE_SKILLS,
  SKILL_DEFS,
  SkillBook,
  type SkillKind,
} from '../entities/Skill'
import { drawControls } from '../render/ControlView'
import { WorldRenderer } from '../render/WorldRenderer'
import {
  ABILITY_INFO,
  ABILITY_KINDS,
  computeEffects,
  createAbilities,
  createRelicInventory,
  expToNext,
  gainExp,
  HABITAT_LABELS,
  RELIC_COST,
  RELIC_HABITATS,
  RELIC_NAMES,
  type Abilities,
  type AbilityKind,
  type RelicHabitat,
  type RelicInventory,
} from '../systems/Abilities'
import { SpawnManager } from '../systems/SpawnManager'
import { Camera } from '../world/Camera'
import { World } from '../world/World'

interface FloatText {
  x: number
  y: number
  text: string
  color: string
  t: number
}

/**
 * 开放世界主场景：
 * 2a 世界/相机/三态物理/操作 + 2b 生物生态、撕咬战斗、掉肉吃肉。
 */
export class WorldScene implements Scene {
  readonly name = 'world'
  private game!: Game
  private world!: World
  private camera!: Camera
  private player!: Player
  private renderer!: WorldRenderer
  private spawner = new SpawnManager()
  private creatures: Creature[] = []
  private meats: MeatChunk[] = []
  private floatTexts: FloatText[] = []
  private meatCollected: Partial<Record<AbilityKind, number>> = {}
  private kills = 0
  /** 八项能力状态（等级+经验），吃肉成长 */
  private abilities: Abilities = createAbilities()
  /** 碎片库存（万能经验，可分配给任意能力） */
  private shardCount = 0
  /** 圣物库存（能力突破钥匙） */
  private relics: RelicInventory = createRelicInventory()
  /** 场上活跃圣物（一次一个） */
  private activeRelic: Relic | null = null
  /** 圣物刷新倒计时 */
  private relicTimer = 12
  private bosses: Boss[] = []
  private shards: Shard[] = []
  /** 活跃自然灾害（一次一场） */
  private disasters: Disaster[] = []
  /** 灾害刷新倒计时 */
  private disasterTimer = 25
  /** 灾害预警横幅 */
  private disasterWarnText = ''
  private disasterWarnTimer = 0
  /** 精英怪刷新倒计时 */
  private eliteTimer = 40
  /** 场上宝箱（一次一个） */
  private chest: Chest | null = null
  private chestTimer = 30
  /** 场上技能书（精英/Boss 掉落） */
  private skillBooks: SkillBook[] = []
  /** 技能释放特效环 */
  private skillFx: Array<{ x: number; y: number; r: number; t: number; color: string }> = []
  /** 玩家技能持续区域（毒域） */
  private skillFields: Array<{ kind: 'venom'; x: number; y: number; r: number; t: number }> = []
  /** 海啸弹道 */
  private tsunamiWaves: Array<{ x: number; y: number; vx: number; vy: number; t: number }> = []
  /** HUD 能力行的点击区域（碎片分配） */
  private abilityRows: Array<{ kind: AbilityKind; y0: number; y1: number }> = []
  /** 震屏 */
  private shakeTimer = 0
  private shakeAmp = 0
  private message = ''
  private messageTimer = 0
  /** 死亡状态：结算展示中，任意确认输入重开一局 */
  private dead = false
  private deathElapsed = 0
  private deathStats = { kills: 0, avgLv: 0 }

  enter(game: Game): void {
    this.game = game
    this.world = new World(20260928)
    this.camera = new Camera(this.world)
    this.player = new Player(this.world)
    this.renderer = new WorldRenderer(this.world)
    this.spawner = new SpawnManager()
    this.creatures = []
    this.meats = []
    this.floatTexts = []
    this.meatCollected = {}
    this.kills = 0
    this.abilities = createAbilities()
    this.player.applyEffects(computeEffects(this.abilities))
    this.shardCount = 0
    this.shards = []
    this.relics = createRelicInventory()
    this.activeRelic = null
    this.relicTimer = 12
    this.shakeTimer = 0
    this.dead = false
    this.deathElapsed = 0
    this.disasters = []
    this.disasterTimer = 25
    this.disasterWarnText = ''
    this.disasterWarnTimer = 0
    this.eliteTimer = 40
    this.chest = null
    this.chestTimer = 30
    this.skillBooks = []
    this.skillFx = []
    this.skillFields = []
    this.tsunamiWaves = []
    for (const s of this.player.skills) {
      s.kind = null
      s.cd = 0
      s.active = 0
    }
    this.player.shieldValue = 0
    this.bosses = BOSS_DEFS.map((def) => new Boss(def, this.avgAbilityLv()))
    this.camera.snap(this.player.x, this.player.y, game.width, game.height)
    this.showMessage('吃肉进化 · 收集圣物突破瓶颈 · 挑战 Boss')
  }

  exit(): void {}

  /** 供调试与自动化测试读取的状态快照 */
  get debugState(): Record<string, unknown> {
    return {
      x: Math.round(this.player.x),
      y: Math.round(this.player.y),
      state: this.player.state,
      hp: Math.round(this.player.hp),
      poisoned: this.player.poisoned,
      paralyzed: this.player.paralyzed,
      region: this.world.regionAt(this.player.x, this.player.y),
      creatures: this.creatures.length,
      species: this.creatures.map((c) => c.species.id),
      meats: this.meats.length,
      meatCollected: { ...this.meatCollected },
      kills: this.kills,
      shards: this.shardCount,
      shardDrops: this.shards.length,
      relics: { ...this.relics },
      activeRelic: this.activeRelic
        ? {
            kind: this.activeRelic.kind,
            x: Math.round(this.activeRelic.x),
            y: Math.round(this.activeRelic.y),
            remain: Math.round(this.activeRelic.remain),
          }
        : null,
      relicTimer: Math.max(0, Math.round(this.relicTimer)),
      dead: this.dead,
      deathElapsed: Math.round(this.deathElapsed * 10) / 10,
      disasters: this.disasters.map((d) => ({
        kind: d.kind,
        label: d.label,
        x: Math.round(d.x),
        y: Math.round(d.y),
        remain: Math.round(d.remain),
        expired: d.expired,
      })),
      disasterTimer: Math.max(0, Math.round(this.disasterTimer)),
      elite: (() => {
        const e = this.creatures.find((c) => c.elite)
        return e
          ? {
              name: ELITE_NAMES[e.species.id] ?? e.species.name,
              hp: Math.round(e.hp),
              maxHp: e.maxHp,
              x: Math.round(e.x),
              y: Math.round(e.y),
            }
          : null
      })(),
      eliteTimer: Math.max(0, Math.round(this.eliteTimer)),
      skill: this.player.skills.map((s) => ({
        kind: s.kind,
        cd: Math.round(s.cd * 10) / 10,
        active: Math.round(s.active * 10) / 10,
      })),
      chest: this.chest
        ? { x: Math.round(this.chest.x), y: Math.round(this.chest.y), remain: Math.round(this.chest.remain) }
        : null,
      chestTimer: Math.max(0, Math.round(this.chestTimer)),
      skillBooks: this.skillBooks.map((b) => b.kind),
      bosses: this.bosses.map((b) => ({
        id: b.def.id,
        state: b.state,
        hp: Math.round(b.hp),
        maxHp: b.maxHp,
        dist: Math.round(Math.hypot(b.x - this.player.x, b.y - this.player.y)),
      })),
      abilities: Object.fromEntries(
        ABILITY_KINDS.map((k) => [k, { lv: this.abilities[k].lv, exp: this.abilities[k].exp }]),
      ),
      camera: { x: Math.round(this.camera.x), y: Math.round(this.camera.y) },
    }
  }

  update(dt: number): void {
    const game = this.game

    // 死亡结算：世界定格，尸体缓沉，1 秒后任意确认重开（防死亡瞬间误触）
    if (this.dead) {
      this.deathElapsed += dt
      this.player.y = Math.min(this.world.height - 30, this.player.y + 26 * dt)
      this.updateFloatTexts(dt)
      this.messageTimer = Math.max(0, this.messageTimer - dt)
      if (this.deathElapsed > 1 && game.input.confirmJustPressed()) {
        game.scenes.change('world')
      }
      return
    }

    this.handleDebugFormKeys(game.input)
    this.handleShardInput(game.input)
    this.handleSkillInput(game.input)

    this.player.update(dt, game.input)
    this.spawner.update(dt, this.player, this.world, this.creatures, this.avgAbilityLv())

    const ctx = {
      world: this.world,
      player: this.player,
      playerBitNearby: this.player.justBit,
      floatText: (x: number, y: number, text: string, color: string) => this.addFloatText(x, y, text, color),
    }
    for (const c of this.creatures) c.update(dt, ctx)

    // Boss：战斗与技能
    for (const b of this.bosses) {
      b.update(dt, {
        world: this.world,
        player: this.player,
        summon: (id, x, y) => this.summonCreature(id, x, y),
        shake: (strength) => this.doShake(strength),
        message: (text) => this.showMessage(text),
        floatText: (x, y, text, color) => this.addFloatText(x, y, text, color),
      })
      if (b.state === 'active' && !b.alive) this.killBoss(b)
    }

    // 圣物：限时刷新、到期消失、接触拾取
    this.updateRelics(dt)

    // 碎片漂浮与收集
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const sh = this.shards[i]
      sh.update(dt, this.world)
      if (sh.expired) {
        this.shards.splice(i, 1)
        continue
      }
      if (Math.hypot(sh.x - this.player.x, sh.y - this.player.y) < this.player.size + 16) {
        this.shards.splice(i, 1)
        this.shardCount++
        this.addFloatText(sh.x, sh.y - 12, '+碎片', '#9ff0e2')
      }
    }

    // 灾害与精英调度：先于战斗结算，被灾害杀死的生物当帧掉肉
    this.updateDisasters(dt)
    this.updateEliteSpawn(dt)
    this.updateChests(dt)
    this.updateSkillBooks(dt)
    this.updateSkillFields(dt)
    this.updateMagnet()
    for (let i = this.skillFx.length - 1; i >= 0; i--) {
      const fx = this.skillFx[i]
      fx.t -= dt
      if (fx.t <= 0) this.skillFx.splice(i, 1)
    }

    this.resolveCombat()
    this.updateMeats(dt)
    this.updateFloatTexts(dt)

    if (this.player.hp <= 0) {
      // 死亡：进入结算，进度随重开清零（roguelike 局内制）
      this.dead = true
      this.deathElapsed = 0
      this.deathStats = {
        kills: this.kills,
        avgLv: Math.round(this.avgAbilityLv() * 10) / 10,
      }
      this.doShake(0.9)
      this.showMessage('力竭而亡……')
    }

    this.camera.update(dt, this.player.x, this.player.y, game.width, game.height)
    this.renderer.update(dt, this.player.x, this.player.y, this.player.y > this.world.waterY)
    this.messageTimer = Math.max(0, this.messageTimer - dt)
    this.shakeTimer = Math.max(0, this.shakeTimer - dt)
  }

  /** 圣物刷新调度与拾取 */
  private updateRelics(dt: number): void {
    if (this.activeRelic) {
      const r = this.activeRelic
      r.update(dt, this.world)
      if (r.expired) {
        this.activeRelic = null
        this.relicTimer = 40 + Math.random() * 20
        this.showMessage(`${RELIC_NAMES[r.kind]}的光芒消散了……`)
        return
      }
      if (r.tryPickup(this.player.x, this.player.y)) {
        this.relics[r.kind]++
        this.spawnShards(r.x, r.y, 2)
        this.addFloatText(r.x, r.y - 40, `${RELIC_NAMES[r.kind]}！`, ABILITY_INFO[r.kind].color)
        this.showMessage(`获得圣物【${RELIC_NAMES[r.kind]}】+2 碎片`)
        this.activeRelic = null
        this.relicTimer = 40 + Math.random() * 20
        this.autoBreakthrough()
      }
      return
    }
    this.relicTimer -= dt
    if (this.relicTimer <= 0) this.spawnRelic()
  }

  /** 在随机能力的对应栖息区域采样一个圣物 */
  private spawnRelic(): void {
    const kind = ABILITY_KINDS[Math.floor(Math.random() * ABILITY_KINDS.length)]
    const habitats = RELIC_HABITATS[kind]
    const habitat = habitats[Math.floor(Math.random() * habitats.length)]
    const w = this.world
    let x = 0
    let y = 0
    switch (habitat as RelicHabitat) {
      case 'shallow':
        x = 200 + Math.random() * (w.width - 400)
        y = w.waterY + 150 + Math.random() * 700
        break
      case 'reef':
        x = 200 + Math.random() * (w.width - 400)
        y = w.waterY + 950 + Math.random() * 800
        break
      case 'deep':
        x = 400 + Math.random() * (w.width - 800)
        y = w.waterY + 1900 + Math.random() * 2100
        break
      case 'ocean':
        x = Math.random() < 0.5 ? 300 + Math.random() * 2000 : w.width - 2300 + Math.random() * 2000
        y = w.waterY + 200 + Math.random() * 3300
        break
      case 'sky': {
        x = 200 + Math.random() * (w.width - 400)
        y = 350 + Math.random() * 1500
        // 未成翼（不能飞）时按当前跃空能力刷新在可拾取低空（跃高 + 拾取半径 + 余量）
        if (this.player.wingLv < 7) {
          const leapH = (this.player.effects.leapVy ** 2) / 3000
          y = w.waterY - 18 - Math.random() * (leapH + 20)
        }
        break
      }
      case 'island': {
        const tops = w.islands.filter((b) => b.y < w.waterY)
        const b = tops[Math.floor(Math.random() * tops.length)]
        x = b.x + 60 + Math.random() * (b.w - 120)
        y = b.y - 60
        break
      }
    }
    // 水域点若落入岛礁，改放海底附近
    if (y > w.waterY) {
      let inIsland = false
      for (const b of w.islands) {
        if (x > b.x - 50 && x < b.x + b.w + 50 && y > b.y - 50 && y < b.y + b.h + 50) {
          inIsland = true
          break
        }
      }
      if (inIsland) y = w.height - 260
    }
    this.activeRelic = new Relic(kind, x, y)
    this.showMessage(`【${RELIC_NAMES[kind]}】在${HABITAT_LABELS[habitat as RelicHabitat]}浮现！`)
  }

  /** 玩家八项能力平均等级：驱动 Boss 强度与低端食粮递减 */
  private avgAbilityLv(): number {
    return ABILITY_KINDS.reduce((sum, k) => sum + this.abilities[k].lv, 0) / ABILITY_KINDS.length
  }

  /** 宝箱调度：场上无宝箱时倒计时，水域随机刷新，接触开启获得技能 */
  private updateChests(dt: number): void {
    if (this.chest) {
      this.chest.update(dt, this.world)
      if (this.chest.expired) {
        this.chest = null
        this.chestTimer = 60 + Math.random() * 30
        return
      }
      if (this.chest.tryOpen(this.player.x, this.player.y)) {
        const kind = CHEST_SKILLS[Math.floor(Math.random() * CHEST_SKILLS.length)]
        this.grantSkill(kind, `宝箱开启`)
        this.chest = null
        this.chestTimer = 60 + Math.random() * 30
      }
      return
    }
    this.chestTimer -= dt
    if (this.chestTimer <= 0) this.spawnChest()
  }

  private spawnChest(): void {
    const w = this.world
    const x = 300 + Math.random() * (w.width - 600)
    let y = w.waterY + 150 + Math.random() * (w.height - w.waterY - 400)
    // 落岛则改放海底附近
    for (const b of w.islands) {
      if (x > b.x - 50 && x < b.x + b.w + 50 && y > b.y - 50 && y < b.y + b.h + 50) {
        y = w.height - 260
        break
      }
    }
    this.chest = new Chest(x, y)
    this.showMessage('海床上浮现了一只宝箱……')
  }

  /** 技能书：精英/Boss 掉落漂浮，接触习得 */
  private updateSkillBooks(dt: number): void {
    const p = this.player
    for (let i = this.skillBooks.length - 1; i >= 0; i--) {
      const bk = this.skillBooks[i]
      bk.update(dt, this.world)
      if (bk.expired) {
        this.skillBooks.splice(i, 1)
        continue
      }
      if (Math.hypot(bk.x - p.x, bk.y - p.y) < p.size + 22) {
        this.grantSkill(bk.kind, '拾取技能书')
        this.skillBooks.splice(i, 1)
      }
    }
  }

  /** 授予技能：填入第一个空槽，满栏时淘汰最旧的槽位 */
  private grantSkill(kind: SkillKind, source: string): void {
    const def = SKILL_DEFS[kind]
    let slot = this.player.skills.find((s) => s.kind === null)
    let replacedNote = ''
    if (!slot) {
      const dropped = this.player.skills.shift()
      replacedNote = dropped?.kind ? `（顶替【${SKILL_DEFS[dropped.kind].name}】）` : ''
      this.player.skills.push({ kind: null, cd: 0, active: 0 })
      slot = this.player.skills[2]
    }
    slot.kind = kind
    slot.cd = 0
    slot.active = 0
    this.addFloatText(this.player.x, this.player.y - 46, `【${def.name}】`, def.color)
    this.showMessage(`${source}：习得技能【${def.name}】${replacedNote}——${def.desc}（Q/E/R 或技能栏释放）`)
  }

  /** 技能释放输入：按槽位触发 */
  private handleSkillInput(input: InputManager): void {
    const slot = input.skillSlotPressed()
    if (slot !== null) this.useSkill(slot)
  }

  private useSkill(slotIndex: number): void {
    const p = this.player
    const slot = p.skills[slotIndex]
    const kind = slot?.kind
    if (!slot || !kind || slot.cd > 0 || p.hp <= 0) return
    const def = SKILL_DEFS[kind]
    slot.cd = def.cooldown
    switch (kind) {
      case 'surge':
        slot.active = 4
        this.addFloatText(p.x, p.y - 40, '疾速！', def.color)
        break
      case 'heal': {
        const amount = p.maxHp * 0.45
        p.hp = Math.min(p.maxHp, p.hp + amount)
        this.addFloatText(p.x, p.y - 40, `+${Math.round(amount)}`, def.color)
        break
      }
      case 'invuln':
        slot.active = 2.5
        this.addFloatText(p.x, p.y - 40, '金身！', def.color)
        break
      case 'stealth':
        slot.active = 3.5
        this.addFloatText(p.x, p.y - 40, '隐身！', def.color)
        break
      case 'shield':
        p.shieldValue = 90
        slot.active = 12
        this.addFloatText(p.x, p.y - 40, '水盾！', def.color)
        break
      case 'magnet':
        slot.active = 6
        this.addFloatText(p.x, p.y - 40, '磁力！', def.color)
        break
      case 'shockwave':
        this.skillBurst(280, 45, def.color, false, false)
        break
      case 'voltburst':
        this.skillBurst(320, 15, def.color, true, false)
        break
      case 'venomfield':
        this.skillFields.push({ kind: 'venom', x: p.x, y: p.y, r: 170, t: 8 })
        this.addFloatText(p.x, p.y - 40, '毒域！', def.color)
        break
      case 'frostbite':
        this.skillBurst(340, 10, def.color, false, true)
        break
      case 'bloodlust':
        slot.active = 8
        this.addFloatText(p.x, p.y - 40, '血刃！', def.color)
        break
      case 'arcane':
        this.skillBurst(380, 60, def.color, true, false)
        break
      case 'devour': {
        // 处决周围残血猎物并吸血
        this.skillFx.push({ x: p.x, y: p.y, r: 230, t: 0.5, color: def.color })
        let eaten = 0
        for (let i = this.creatures.length - 1; i >= 0; i--) {
          const c = this.creatures[i]
          if (!c.alive) continue
          const d = Math.hypot(c.x - p.x, c.y - p.y)
          if (d < 220 && c.hp < c.maxHp * 0.35) {
            c.hp = 0
            eaten++
          }
        }
        if (eaten > 0) {
          p.hp = Math.min(p.maxHp, p.hp + eaten * 3)
          this.addFloatText(p.x, p.y - 40, `吞噬×${eaten}！`, def.color)
          this.doShake(0.4)
        } else {
          this.addFloatText(p.x, p.y - 40, '无残血猎物', '#9aa7b0')
        }
        break
      }
      case 'tsunami':
        this.tsunamiWaves.push({
          x: p.x,
          y: p.y,
          vx: p.facing * 700,
          vy: 0,
          t: 0.85,
        })
        this.doShake(0.35)
        break
    }
  }

  /** 范围技能：伤害 + 击退 +（可选）麻痹/冰缓，波及生物与活跃 Boss */
  private skillBurst(
    radius: number,
    dmg: number,
    color: string,
    paralyze: boolean,
    slow: boolean,
  ): void {
    const p = this.player
    this.skillFx.push({ x: p.x, y: p.y, r: radius, t: 0.5, color })
    this.doShake(0.5)
    for (const c of this.creatures) {
      if (!c.alive) continue
      const d = Math.hypot(c.x - p.x, c.y - p.y)
      if (d < radius) {
        c.hurt(dmg, p.x, p.y)
        if (paralyze) c.applyParalysis(2.2)
        if (slow) c.applySlow(4)
        const k = Math.max(1, d)
        c.vx += ((c.x - p.x) / k) * 420
        c.vy += ((c.y - p.y) / k) * 420
      }
    }
    for (const b of this.bosses) {
      if (b.state !== 'active') continue
      const d = Math.hypot(b.x - p.x, b.y - p.y)
      if (d < radius + b.radius * 0.5) {
        b.hurt(dmg, p.x, p.y)
        if (paralyze) b.applyParalysis(1)
      }
    }
  }

  /** 玩家技能持续区域（毒域）与海啸弹道的推进与判定 */
  private updateSkillFields(dt: number): void {
    // 毒域：持续伤害与中毒（只伤敌方）
    for (let i = this.skillFields.length - 1; i >= 0; i--) {
      const f = this.skillFields[i]
      f.t -= dt
      if (f.t <= 0) {
        this.skillFields.splice(i, 1)
        continue
      }
      for (const c of this.creatures) {
        if (!c.alive) continue
        if (Math.hypot(c.x - f.x, c.y - f.y) < f.r) {
          c.hurtEnvironment(12 * dt)
          c.applyPoison(1.5)
        }
      }
    }
    // 海啸：穿透推进，路径伤害与击退
    for (let i = this.tsunamiWaves.length - 1; i >= 0; i--) {
      const w = this.tsunamiWaves[i]
      w.t -= dt
      w.x += w.vx * dt
      w.y += w.vy * dt
      if (w.t <= 0) {
        this.tsunamiWaves.splice(i, 1)
        continue
      }
      for (const c of this.creatures) {
        if (!c.alive) continue
        if (Math.hypot(c.x - w.x, c.y - w.y) < 95) {
          if (c.hurt(50, w.x - w.vx * 0.1, w.y) > 0) {
            c.vx += w.vx * 0.9
            c.vy += (c.y - w.y) * 4
          }
        }
      }
      for (const b of this.bosses) {
        if (b.state !== 'active') continue
        if (Math.hypot(b.x - w.x, b.y - w.y) < 95 + b.radius * 0.4) b.hurt(50, w.x, w.y)
      }
    }
  }

  /** 磁力：吸取附近的肉/碎片/技能书 */
  private updateMagnet(): void {
    const p = this.player
    if (!p.magnetActive) return
    const pull = (items: Array<{ x: number; y: number }>, speed = 480): void => {
      for (const it of items) {
        const d = Math.hypot(it.x - p.x, it.y - p.y)
        if (d < 400 && d > 1) {
          it.x += ((p.x - it.x) / d) * speed * 0.016
          it.y += ((p.y - it.y) / d) * speed * 0.016
        }
      }
    }
    pull(this.meats)
    pull(this.shards)
    pull(this.skillBooks)
  }

  /** 灾害调度：场上无灾害时倒计时，随机一种在玩家附近触发 */
  private updateDisasters(dt: number): void {
    this.disasterWarnTimer = Math.max(0, this.disasterWarnTimer - dt)
    if (this.disasters.length > 0) {
      const ctx = this.disasterCtx()
      for (const d of this.disasters) d.update(dt, ctx)
      for (let i = this.disasters.length - 1; i >= 0; i--) {
        if (this.disasters[i].expired) this.disasters.splice(i, 1)
      }
      this.disasterTimer = 30
      return
    }
    this.disasterTimer -= dt
    if (this.disasterTimer <= 0) {
      this.spawnDisaster()
      this.disasterTimer = 55 + Math.random() * 35
    }
  }

  private spawnDisaster(kind?: DisasterKind): void {
    const w = this.world
    const k = kind ?? DISASTER_KINDS[Math.floor(Math.random() * DISASTER_KINDS.length)]
    const d = createDisaster(k, this.player.x, this.player.y, w)
    this.disasters.push(d)
    this.disasterWarnText = `⚠ 灾害临近：${DISASTER_LABELS[k]}`
    this.disasterWarnTimer = 4
    this.doShake(0.3)
  }

  /** 灾害伤害回调上下文（生物伤害走 hurt，死亡由 resolveCombat 清理） */
  private disasterCtx(): DisasterContext {
    return {
      world: this.world,
      player: this.player,
      creatures: this.creatures,
      hurtCreature: (c, dmg, fx, fy) => c.hurt(dmg, fx, fy),
      hurtCreatureContinuous: (c, dmg) => c.hurtEnvironment(dmg),
      hurtPlayer: (dmg, fx, fy) => {
        if (this.player.hp > 0) this.player.hurt(dmg, fx, fy)
      },
      hurtPlayerContinuous: (dmg) => {
        if (this.player.hp > 0) this.player.hurtEnvironment(dmg)
      },
      shake: (strength) => this.doShake(strength),
      floatText: (x, y, text, color) => this.addFloatText(x, y, text, color),
    }
  }

  /** 精英调度：场上无精英时倒计时，按玩家区域生成对应精英 */
  private updateEliteSpawn(dt: number): void {
    const hasElite = this.creatures.some((c) => c.elite)
    if (hasElite) {
      this.eliteTimer = 25
      return
    }
    this.eliteTimer -= dt
    if (this.eliteTimer <= 0) {
      this.spawnElite()
      this.eliteTimer = 45 + Math.random() * 30
    }
  }

  private spawnElite(): void {
    const w = this.world
    const p = this.player
    // 按玩家所在区域选择精英池
    let pool: string[]
    if (p.y < w.waterY) {
      pool = ['eagle']
    } else if (w.regionAt(p.x, p.y) === '岛屿') {
      pool = ['monitor']
    } else if (p.y > w.waterY + 1800) {
      pool = ['lantern', 'eel']
    } else if (p.x < 2600 || p.x > w.width - 2600) {
      pool = ['shark']
    } else {
      pool = ['puffer', 'poisonfish', 'turtle']
    }
    const id = pool[Math.floor(Math.random() * pool.length)]
    const species = SPECIES.find((s) => s.id === id)
    if (!species) return

    // 屏幕外环带采样；水生按物种习性取深度，空中取巡航高度，陆生贴岛顶
    for (let attempt = 0; attempt < 10; attempt++) {
      const ang = Math.random() * Math.PI * 2
      const dist = 900 + Math.random() * 500
      const x = clamp(120, w.width - 120, p.x + Math.cos(ang) * dist)
      if (species.medium === 'water') {
        const y = clamp(w.waterY + 120, w.height - 120, p.y + Math.sin(ang) * dist)
        let inIsland = false
        for (const b of w.islands) {
          if (x > b.x - 70 && x < b.x + b.w + 70 && y > b.y - 70 && y < b.y + b.h + 70) {
            inIsland = true
            break
          }
        }
        if (!inIsland) {
          this.creatures.push(new Creature(species, x, y, true))
          this.showMessage(`精英【${ELITE_NAMES[id]}】在附近水域现身！`)
          return
        }
      } else if (species.medium === 'air') {
        const y = clamp(200, w.waterY - 120, w.waterY - 260 - Math.random() * 500)
        this.creatures.push(new Creature(species, x, y, true))
        this.showMessage(`精英【${ELITE_NAMES[id]}】盘旋在天际！`)
        return
      } else {
        const tops = w.islands.filter(
          (b) => b.y < w.waterY && Math.abs(b.x + b.w / 2 - x) < 900,
        )
        if (tops.length > 0) {
          const b = tops[Math.floor(Math.random() * tops.length)]
          this.creatures.push(new Creature(species, b.x + b.w / 2, b.y - 30, true))
          this.showMessage(`精英【${ELITE_NAMES[id]}】占据了岛屿！`)
          return
        }
      }
    }
  }


  private autoBreakthrough(): void {
    let upgraded = ''
    for (const kind of ABILITY_KINDS) {
      const r = gainExp(this.abilities, kind, 0, this.relics)
      if (r.leveledUp) {
        upgraded = `${ABILITY_INFO[kind].label} Lv${r.newLv}`
        this.addFloatText(this.player.x, this.player.y - 52, `突破！${upgraded}`, '#ffe9a0')
      }
    }
    if (upgraded) {
      this.player.applyEffects(computeEffects(this.abilities))
      this.showMessage(`圣物突破：${upgraded}！`)
    }
  }

  /** 该能力当前是否卡在突破级（经验满但缺圣物）；返回所需圣物数，0 = 未卡 */
  private blockedRelicNeed(kind: AbilityKind): number {
    const st = this.abilities[kind]
    const need = RELIC_COST[st.lv + 1] ?? 0
    if (need === 0) return 0
    return st.exp >= expToNext(st.lv) && this.relics[kind] < need ? need : 0
  }

  /** 碎片分配：键盘 1-8 或点击 HUD 能力行；点击面板不触发咬击 */
  private handleShardInput(input: InputManager): void {
    if (this.shardCount <= 0) return
    // 键盘 1-8
    for (let i = 0; i < ABILITY_KINDS.length; i++) {
      if (input.isJustPressed(`Digit${i + 1}`)) {
        this.allocateShard(ABILITY_KINDS[i])
        return
      }
    }
    // 点击能力面板区域
    if (input.attackJustPressed() && input.lastPointerDown.x < 210) {
      const y = input.lastPointerDown.y
      for (const row of this.abilityRows) {
        if (y >= row.y0 && y <= row.y1) {
          input.clearAttackJustPressed()
          this.allocateShard(row.kind)
          return
        }
      }
    }
  }

  private allocateShard(kind: AbilityKind): void {
    if (this.shardCount <= 0) return
    this.shardCount--
    const r = gainExp(this.abilities, kind, 3, this.relics)
    this.player.applyEffects(computeEffects(this.abilities))
    const info = ABILITY_INFO[kind]
    this.addFloatText(this.player.x, this.player.y - 36, `碎片 → ${info.label}`, '#9ff0e2')
    if (r.leveledUp) this.levelUpMessage(kind, r.newLv)
  }

  private spawnShards(x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++) {
      this.shards.push(new Shard(x, y))
    }
  }

  private summonCreature(id: string, x: number, y: number): void {
    const def = SPECIES.find((s) => s.id === id)
    if (def) this.creatures.push(new Creature(def, x, y))
  }

  private doShake(strength: number): void {
    this.shakeTimer = Math.max(this.shakeTimer, 0.4)
    this.shakeAmp = Math.max(this.shakeAmp, 14 * strength)
  }

  private killBoss(b: Boss): void {
    b.state = 'dead'
    b.respawnTimer = 180
    this.kills++
    const { meat, shards } = b.dropCounts()
    for (let i = 0; i < meat; i++) {
      this.meats.push(
        new MeatChunk(
          b.x + (Math.random() - 0.5) * b.size * 2.2,
          b.y + (Math.random() - 0.5) * b.size,
          b.def.meatType,
        ),
      )
    }
    this.spawnShards(b.x, b.y - 20, shards)
    const bossSkill = BOSS_SKILLS[Math.floor(Math.random() * BOSS_SKILLS.length)]
    this.skillBooks.push(new SkillBook(b.x, b.y - 10, bossSkill))
    this.showMessage(`击败了${b.def.name}！获得大量肉、${shards} 枚碎片与技能书`)
    this.doShake(0.8)
  }

  /** 玩家咬击命中 + 生物接触攻击 + 电鳗放电 */
  private resolveCombat(): void {
    const p = this.player

    if (p.justBit) {
      p.justBit = false
      // 嘴部判定点：面朝方向前方；生物与 Boss 中取最近目标
      const mouthX = p.x + p.facing * p.biteRange * 0.6
      const mouthY = p.y
      let bestCreature: Creature | null = null
      let bestBoss: Boss | null = null
      let bestDist = Infinity
      for (const c of this.creatures) {
        const d = Math.hypot(c.x - mouthX, c.y - mouthY)
        if (d < p.biteRange + c.radius && d < bestDist) {
          bestCreature = c
          bestDist = d
        }
      }
      for (const b of this.bosses) {
        if (b.state !== 'active') continue
        const d = Math.hypot(b.x - mouthX, b.y - mouthY)
        if (d < p.biteRange + b.radius && d < bestDist) {
          bestBoss = b
          bestCreature = null
          bestDist = d
        }
      }
      const applyExtras = (target: Creature | Boss): void => {
        if (p.effects.venomDps > 0) target.applyPoison(4)
        if (p.effects.shockChance > 0 && Math.random() < p.effects.shockChance) {
          target.applyParalysis(1.2)
          this.addFloatText(target.x, target.y - target.radius - 18, '麻痹！', '#f0d040')
        }
      }
      if (bestCreature) {
        const dmg = bestCreature.hurt(p.biteDamage, p.x, p.y)
        this.addFloatText(bestCreature.x, bestCreature.y - bestCreature.size, `-${dmg}`, '#ffd166')
        applyExtras(bestCreature)
        // 血刃：咬中吸血
        if (p.bloodlustActive) p.hp = Math.min(p.maxHp, p.hp + 4)
        if (!bestCreature.alive) this.killCreature(bestCreature)
      } else if (bestBoss) {
        const dmg = bestBoss.hurt(p.biteDamage, p.x, p.y)
        this.addFloatText(bestBoss.x, bestBoss.y - bestBoss.size - 20, `-${dmg}`, '#ffd166')
        applyExtras(bestBoss)
        if (p.bloodlustActive) p.hp = Math.min(p.maxHp, p.hp + 4)
        if (!bestBoss.alive) this.killBoss(bestBoss)
      }
    }

    for (const c of this.creatures) {
      const dist = Math.hypot(c.x - p.x, c.y - p.y)
      // 接触攻击
      if (dist < c.radius + p.size * 0.85) {
        c.tryAttackPlayer(p)
        if (p.hp <= 0) return
      }
      // 电鳗放电麻痹（水中靠近即中招）
      if (c.discharging && dist < c.size + 110) {
        p.applyParalysis(0.9)
      }
    }

    // 中毒/麻痹期间死亡的生物同样掉肉
    for (let i = this.creatures.length - 1; i >= 0; i--) {
      if (!this.creatures[i].alive) this.killCreature(this.creatures[i])
    }
  }

  private killCreature(c: Creature): void {
    const idx = this.creatures.indexOf(c)
    if (idx >= 0) this.creatures.splice(idx, 1)
    this.kills++
    const n = c.meatDrops()
    for (let i = 0; i < n; i++) {
      this.meats.push(
        new MeatChunk(
          c.x + (Math.random() - 0.5) * c.size * 2,
          c.y + (Math.random() - 0.5) * c.size,
          c.species.meatType,
        ),
      )
    }
    if (c.elite) {
      const eliteName = ELITE_NAMES[c.species.id] ?? `精英${c.species.name}`
      this.spawnShards(c.x, c.y, 2)
      const bookKind = ELITE_SKILLS[Math.floor(Math.random() * ELITE_SKILLS.length)]
      this.skillBooks.push(new SkillBook(c.x, c.y, bookKind))
      this.showMessage(`击败了精英【${eliteName}】！+2 碎片，掉落技能书`)
      this.doShake(0.5)
      this.addFloatText(c.x, c.y - c.size - 12, `${eliteName}！`, '#ffd25a')
      return
    }
    this.addFloatText(c.x, c.y - c.size - 12, `${c.species.name}！`, ABILITY_INFO[c.species.meatType].color)
  }

  /** 升级提示（翼的解锁里程碑单独文案） */
  private levelUpMessage(kind: AbilityKind, newLv: number): void {
    const info = ABILITY_INFO[kind]
    if (kind === 'wing' && newLv === 7) {
      this.showMessage('翼 Lv7：鳍化成翼，可以飞了（尚显迟缓）')
    } else if (kind === 'wing' && newLv === 10) {
      this.showMessage('翼 Lv10：翼成完全体，翱翔天际！')
    } else {
      this.showMessage(`${info.label} 进化到 Lv${newLv}`)
    }
  }

  private updateMeats(dt: number): void {
    const p = this.player

    // 觅食目标：260 内有掉落肉的敌怪会被吸引（一帧延迟无感）
    for (const c of this.creatures) {
      c.foodTarget = null
      let bd = 260
      for (const m of this.meats) {
        const d = Math.hypot(m.x - c.x, m.y - c.y)
        if (d < bd) {
          bd = d
          c.foodTarget = m
        }
      }
    }

    for (let i = this.meats.length - 1; i >= 0; i--) {
      const m = this.meats[i]
      m.update(dt, this.world)
      if (m.expired) {
        this.meats.splice(i, 1)
        continue
      }
      if (Math.hypot(m.x - p.x, m.y - p.y) < p.size + 14) {
        this.meats.splice(i, 1)
        const prev = this.meatCollected[m.kind] ?? 0
        this.meatCollected[m.kind] = prev + 1
        const info = ABILITY_INFO[m.kind]
        this.addFloatText(m.x, m.y - 10, `+${info.label}肉`, info.color)
        // 吃肉涨能力经验，升级即刷新玩家数值
        const r = gainExp(this.abilities, m.kind, 1, this.relics)
        if (r.leveledUp) {
          this.player.applyEffects(computeEffects(this.abilities))
          this.addFloatText(m.x, m.y - 30, `${info.label} Lv${r.newLv}！`, info.color)
          this.levelUpMessage(m.kind, r.newLv)
        }
        continue
      }
      // 敌怪抢食：接触即吃掉回血
      let eaten = false
      for (const c of this.creatures) {
        if (!c.alive) continue
        if (Math.hypot(m.x - c.x, m.y - c.y) < c.radius + 12) {
          c.heal(c.maxHp * 0.25)
          eaten = true
          break
        }
      }
      // 活跃 Boss 吞噬附近肉块少量回血
      if (!eaten) {
        for (const b of this.bosses) {
          if (b.state !== 'active') continue
          if (Math.hypot(m.x - b.x, m.y - b.y) < b.radius + 12) {
            b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.06)
            eaten = true
            break
          }
        }
      }
      if (eaten) this.meats.splice(i, 1)
    }
  }

  private updateFloatTexts(dt: number): void {
    for (let i = this.floatTexts.length - 1; i >= 0; i--) {
      const f = this.floatTexts[i]
      f.t -= dt
      f.y -= 34 * dt
      if (f.t <= 0) this.floatTexts.splice(i, 1)
    }
  }

  private addFloatText(x: number, y: number, text: string, color: string): void {
    this.floatTexts.push({ x, y, text, color, t: 1 })
    if (this.floatTexts.length > 30) this.floatTexts.shift()
  }

  private handleDebugFormKeys(input: InputManager): void {
    // G：调试——每项能力 +5 经验（快速验证升级与部位变化）
    if (input.isJustPressed('KeyG')) {
      let lastLv = ''
      for (const kind of ABILITY_KINDS) {
        const r = gainExp(this.abilities, kind, 5, this.relics)
        if (r.leveledUp) lastLv = `${ABILITY_INFO[kind].label} Lv${r.newLv}`
      }
      this.player.applyEffects(computeEffects(this.abilities))
      if (lastLv) this.showMessage(`调试：${lastLv}`)
    }
    // H：调试——手动触发随机灾害（验证灾害链路）
    if (input.isJustPressed('KeyH')) this.spawnDisaster()
  }

  private showMessage(text: string): void {
    this.message = text
    this.messageTimer = 2.6
  }

  render(ctx: CanvasRenderingContext2D): void {
    const game = this.game
    const { width, height } = game

    ctx.save()
    // 震屏偏移
    if (this.shakeTimer > 0) {
      const amp = this.shakeAmp * (this.shakeTimer / 0.4)
      ctx.translate((Math.random() - 0.5) * amp, (Math.random() - 0.5) * amp)
    }
    ctx.translate(-Math.round(this.camera.x), -Math.round(this.camera.y))
    this.renderer.renderBack(ctx, this.camera, width, height)
    // 灾害地形层（火山丘/热泉口）垫在实体之下
    for (const d of this.disasters) d.renderBack(ctx)
    if (this.chest) this.chest.render(ctx)
    if (this.activeRelic) this.activeRelic.render(ctx)
    for (const m of this.meats) m.render(ctx)
    for (const c of this.creatures) c.render(ctx)
    for (const b of this.bosses) b.render(ctx)
    this.player.render(ctx)
    for (const sh of this.shards) sh.render(ctx)
    for (const bk of this.skillBooks) bk.render(ctx)
    // 灾害前景层（羽流/岩浆弹/陨石/龙卷风）盖在实体之上
    for (const d of this.disasters) d.renderFront(ctx)
    // 技能释放特效环
    for (const fx of this.skillFx) {
      const k = 1 - fx.t / 0.5
      ctx.strokeStyle = fx.color
      ctx.globalAlpha = 1 - k
      ctx.lineWidth = 8 * (1 - k) + 2
      ctx.beginPath()
      ctx.arc(fx.x, fx.y, fx.r * (0.25 + k * 0.85), 0, Math.PI * 2)
      ctx.stroke()
      ctx.globalAlpha = 1
    }
    // 玩家毒域（紫雾）
    for (const f of this.skillFields) {
      const a = Math.min(0.4, f.t / 8 + 0.12)
      const grad = ctx.createRadialGradient(f.x, f.y, f.r * 0.2, f.x, f.y, f.r)
      grad.addColorStop(0, `rgba(155, 106, 214, ${a})`)
      grad.addColorStop(1, 'rgba(155, 106, 214, 0)')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2)
      ctx.fill()
    }
    // 海啸弹道（弧形水刃）
    for (const w of this.tsunamiWaves) {
      const dir = Math.sign(w.vx)
      ctx.save()
      ctx.translate(w.x, w.y)
      ctx.scale(dir, 1)
      const alpha = Math.min(1, w.t / 0.3)
      ctx.globalAlpha = alpha
      const grad = ctx.createLinearGradient(-80, 0, 40, 0)
      grad.addColorStop(0, 'rgba(90, 184, 216, 0)')
      grad.addColorStop(1, 'rgba(90, 184, 216, 0.75)')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.moveTo(40, -46)
      ctx.quadraticCurveTo(-30, -70, -85, -18)
      ctx.quadraticCurveTo(-40, 0, -85, 18)
      ctx.quadraticCurveTo(-30, 70, 40, 46)
      ctx.quadraticCurveTo(10, 0, 40, -46)
      ctx.closePath()
      ctx.fill()
      // 水花
      ctx.fillStyle = 'rgba(220, 240, 250, 0.7)'
      for (let i = 0; i < 4; i++) {
        ctx.beginPath()
        ctx.arc(-20 - i * 16, Math.sin(w.t * 20 + i * 2) * 30, 4 + i, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
      ctx.globalAlpha = 1
    }
    this.renderer.renderFront(ctx, this.camera, width, height)
    this.drawFloatTexts(ctx)
    ctx.restore()

    if (this.dead) {
      ctx.save()
      ctx.translate(game.safeArea.left, game.safeArea.top)
      this.drawDeathOverlay(ctx, game)
      ctx.restore()
      return
    }
    ctx.save()
    ctx.translate(game.safeArea.left, game.safeArea.top)
    this.drawHud(ctx, game)
    ctx.restore()
    ctx.save()
    ctx.translate(game.safeArea.left, 0)
    drawControls(
      ctx,
      game.input,
      game.width - game.safeArea.left - game.safeArea.right,
      game.height,
      this.player.skills,
    )
    ctx.restore()
  }

  /** 死亡结算遮罩：本局战绩 + 重开提示 */
  private drawDeathOverlay(ctx: CanvasRenderingContext2D, game: Game): void {
    const a = Math.min(0.78, this.deathElapsed / 1.2)
    ctx.fillStyle = `rgba(4, 10, 18, ${a})`
    ctx.fillRect(0, 0, game.width, game.height)
    if (this.deathElapsed < 0.4) return
    const cx = game.width / 2
    const cy = game.height * 0.38
    ctx.textAlign = 'center'
    ctx.fillStyle = '#ff8866'
    ctx.font = 'bold 44px system-ui, sans-serif'
    ctx.fillText('力竭而亡', cx, cy)
    ctx.fillStyle = 'rgba(234, 246, 255, 0.85)'
    ctx.font = '18px system-ui, sans-serif'
    ctx.fillText(
      `本局击杀 ${this.deathStats.kills} · 平均能力等级 ${this.deathStats.avgLv}`,
      cx,
      cy + 46,
    )
    ctx.fillStyle = 'rgba(234, 246, 255, 0.55)'
    ctx.font = '14px system-ui, sans-serif'
    ctx.fillText('重开将清空本局全部进化进度', cx, cy + 74)
    if (this.deathElapsed > 1 && Math.sin(this.deathElapsed * 4) > -0.2) {
      ctx.fillStyle = '#7fd8ff'
      ctx.font = 'bold 22px system-ui, sans-serif'
      ctx.fillText('点按任意处 · 重新开始', cx, cy + 130)
    }
    ctx.textAlign = 'left'
  }

  private drawFloatTexts(ctx: CanvasRenderingContext2D): void {
    ctx.textAlign = 'center'
    ctx.font = 'bold 15px system-ui, sans-serif'
    for (const f of this.floatTexts) {
      ctx.globalAlpha = clamp(0, 1, f.t)
      ctx.fillStyle = f.color
      ctx.fillText(f.text, f.x, f.y)
    }
    ctx.globalAlpha = 1
    ctx.textAlign = 'left'
  }

  private drawHud(ctx: CanvasRenderingContext2D, game: Game): void {
    // HP 条
    ctx.fillStyle = 'rgba(6, 18, 31, 0.55)'
    ctx.beginPath()
    ctx.roundRect(16, 16, 190, 18, 9)
    ctx.fill()
    const hpRatio = Math.max(0, this.player.hp / this.player.maxHp)
    ctx.fillStyle = hpRatio > 0.4 ? '#5fce6a' : '#e2564a'
    ctx.beginPath()
    ctx.roundRect(16, 16, Math.max(10, 190 * hpRatio), 18, 9)
    ctx.fill()
    ctx.fillStyle = '#eaf6ff'
    ctx.font = 'bold 13px system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(`HP ${Math.max(0, Math.ceil(this.player.hp))}`, 26, 26)
    ctx.textBaseline = 'alphabetic'

    // 技能栏概览（HP 条右侧，键盘玩家参考；手机有实体技能钮）
    const owned = this.player.skills.filter((s) => s.kind)
    if (owned.length > 0) {
      ctx.font = 'bold 13px system-ui, sans-serif'
      ctx.textAlign = 'left'
      let sx = 218
      const keyBySlot = ['Q', 'E', 'R']
      this.player.skills.forEach((s, i) => {
        if (!s.kind) return
        const def = SKILL_DEFS[s.kind]
        const cd = Math.ceil(s.cd)
        ctx.fillStyle = def.color
        const label = `${def.name}${cd > 0 ? `${cd}s` : keyBySlot[i]}`
        ctx.fillText(label, sx, 26)
        sx += ctx.measureText(label).width + 14
      })
    }

    // 区域与状态
    const region = this.world.regionAt(this.player.x, this.player.y)
    ctx.font = 'bold 16px system-ui, sans-serif'
    ctx.fillStyle = 'rgba(234, 246, 255, 0.9)'
    ctx.fillText(region, 16, 58)
    ctx.font = '13px system-ui, sans-serif'
    ctx.fillStyle = 'rgba(234, 246, 255, 0.55)'
    ctx.fillText(
      `${this.player.state} · 击杀 ${this.kills} · 伤害 ${Math.round(this.player.biteDamage)}`,
      16,
      78,
    )

    // 能力面板：等级、经验微条、圣物库存与突破卡点；行区域记录供碎片分配点击
    let ay = 100
    this.abilityRows = []
    ctx.font = 'bold 12px system-ui, sans-serif'
    for (const kind of ABILITY_KINDS) {
      const st = this.abilities[kind]
      if (st.lv === 0 && st.exp === 0) continue
      const info = ABILITY_INFO[kind]
      this.abilityRows.push({ kind, y0: ay - 13, y1: ay + 4 })
      ctx.fillStyle = info.color
      ctx.fillText(`${info.label} Lv${st.lv}`, 16, ay)
      const need = expToNext(st.lv)
      if (need > 0) {
        const bw = 72
        ctx.fillStyle = 'rgba(255, 255, 255, 0.18)'
        ctx.fillRect(96, ay - 9, bw, 5)
        ctx.fillStyle = info.color
        ctx.fillRect(96, ay - 9, bw * Math.min(1, st.exp / need), 5)
      }
      const blocked = this.blockedRelicNeed(kind)
      if (blocked > 0) {
        ctx.fillStyle = '#ff8866'
        ctx.fillText(`需圣物×${blocked}`, 174, ay)
      } else if (this.relics[kind] > 0) {
        ctx.fillStyle = 'rgba(255, 233, 160, 0.9)'
        ctx.fillText(`圣${this.relics[kind]}`, 174, ay)
      }
      ay += 17
    }

    // 碎片库存（可分配提示）
    if (this.shardCount > 0) {
      ctx.save()
      ctx.translate(20, ay + 8)
      ctx.fillStyle = '#9ff0e2'
      ctx.beginPath()
      ctx.moveTo(0, -6)
      ctx.lineTo(4, 0)
      ctx.lineTo(0, 6)
      ctx.lineTo(-4, 0)
      ctx.closePath()
      ctx.fill()
      ctx.font = 'bold 13px system-ui, sans-serif'
      ctx.fillText(`碎片 ×${this.shardCount}`, 12, 5)
      ctx.font = '11px system-ui, sans-serif'
      ctx.fillStyle = 'rgba(159, 240, 226, 0.75)'
      ctx.fillText('按 1-8 或点击能力投入', 12, 20)
      ctx.restore()
    }

    // 激活 Boss 血条（顶部中央）
    const activeBoss = this.bosses.find((b) => b.state === 'active')
    if (activeBoss) {
      const bw = 360
      const bx = (game.width - bw) / 2
      ctx.fillStyle = 'rgba(6, 18, 31, 0.6)'
      ctx.beginPath()
      ctx.roundRect(bx, 12, bw, 16, 8)
      ctx.fill()
      const ratio = Math.max(0, activeBoss.hp / activeBoss.maxHp)
      ctx.fillStyle = ratio > 0.35 ? '#d9564a' : '#ff8566'
      ctx.beginPath()
      ctx.roundRect(bx, 12, Math.max(12, bw * ratio), 16, 8)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 12px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(`${activeBoss.def.name}  ${Math.ceil(activeBoss.hp)}/${activeBoss.maxHp}`, game.width / 2, 24)
      ctx.textAlign = 'left'
    }

    // 圣物方向指引：屏内浮动标记 / 屏外边缘箭头 + 距离与剩余时间
    if (this.activeRelic) {
      const r = this.activeRelic
      const info = ABILITY_INFO[r.kind]
      const sx = r.x - this.camera.x
      const sy = r.y - this.camera.y
      const margin = 44
      const dist = Math.round(Math.hypot(r.x - this.player.x, r.y - this.player.y) / 10)
      const label = `${RELIC_NAMES[r.kind]} ${dist}m ${Math.ceil(r.remain)}s`
      const inView = sx > margin && sx < game.width - margin && sy > margin && sy < game.height - margin
      ctx.save()
      if (inView) {
        // 屏内：圣物上方浮动下指箭头
        const bobY = sy - 74 + Math.sin(performance.now() / 300) * 5
        ctx.fillStyle = 'rgba(255, 233, 160, 0.95)'
        ctx.beginPath()
        ctx.moveTo(sx - 9, bobY)
        ctx.lineTo(sx + 9, bobY)
        ctx.lineTo(sx, bobY + 14)
        ctx.closePath()
        ctx.fill()
        ctx.font = 'bold 13px system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(label, sx, bobY - 8)
      } else {
        // 屏外：屏幕边缘箭头
        const ang = Math.atan2(sy - game.height / 2, sx - game.width / 2)
        const ex = clamp(margin, game.width - margin, sx)
        const ey = clamp(margin, game.height - margin, sy)
        ctx.translate(ex, ey)
        ctx.rotate(ang)
        ctx.fillStyle = 'rgba(255, 233, 160, 0.95)'
        ctx.beginPath()
        ctx.moveTo(16, 0)
        ctx.lineTo(-8, -11)
        ctx.lineTo(-8, 11)
        ctx.closePath()
        ctx.fill()
        ctx.rotate(-ang)
        ctx.font = 'bold 13px system-ui, sans-serif'
        ctx.fillStyle = info.color
        ctx.textAlign = ex < game.width / 2 ? 'left' : 'right'
        ctx.fillText(label, ex < game.width / 2 ? 24 : -24, ey + (ey < game.height / 2 ? 18 : -12))
      }
      ctx.restore()
      ctx.textAlign = 'left'
    }

    // 灾害预警横幅（触发后数秒内）
    if (this.disasterWarnTimer > 0) {
      const alpha = Math.min(1, this.disasterWarnTimer / 0.8)
      const pulse = 0.7 + 0.3 * Math.sin(performance.now() / 140)
      ctx.textAlign = 'center'
      ctx.font = 'bold 18px system-ui, sans-serif'
      ctx.fillStyle = `rgba(255, 96, 72, ${alpha * pulse})`
      ctx.fillText(this.disasterWarnText, game.width / 2, 96)
      ctx.textAlign = 'left'
    }

    // 威胁指引：屏外灾害、精英与 Boss 的边缘箭头（红色系，区别于圣物金色）
    const threat: Array<{ x: number; y: number; label: string; dim?: boolean }> = []
    for (const d of this.disasters) {
      const dist = Math.round(Math.hypot(d.x - this.player.x, d.y - this.player.y) / 10)
      threat.push({
        x: d.x,
        y: d.y,
        label: `⚠ ${d.label} ${dist}m ${Math.ceil(d.remain)}s`,
      })
    }
    const elite = this.creatures.find((c) => c.elite)
    if (elite) {
      const dist = Math.round(Math.hypot(elite.x - this.player.x, elite.y - this.player.y) / 10)
      threat.push({
        x: elite.x,
        y: elite.y,
        label: `✦ 精英·${ELITE_NAMES[elite.species.id] ?? elite.species.name} ${dist}m`,
      })
    }
    for (const b of this.bosses) {
      if (b.state === 'dead') continue
      const dist = Math.round(Math.hypot(b.x - this.player.x, b.y - this.player.y) / 10)
      threat.push({
        x: b.x,
        y: b.y,
        label: `${b.state === 'active' ? '⚔' : '沉睡'} ${b.def.name} ${dist}m`,
        dim: b.state === 'dormant',
      })
    }
    for (const t of threat) {
      const sx = t.x - this.camera.x
      const sy = t.y - this.camera.y
      const margin = 44
      if (sx > margin && sx < game.width - margin && sy > margin && sy < game.height - margin) continue
      const ang = Math.atan2(sy - game.height / 2, sx - game.width / 2)
      const ex = clamp(margin, game.width - margin, sx)
      const ey = clamp(margin, game.height - margin, sy)
      ctx.save()
      ctx.translate(ex, ey)
      ctx.rotate(ang)
      ctx.globalAlpha = t.dim ? 0.55 : 1
      ctx.fillStyle = 'rgba(255, 108, 84, 0.95)'
      ctx.beginPath()
      ctx.moveTo(20, 0)
      ctx.lineTo(-10, -13)
      ctx.lineTo(-4, 0)
      ctx.lineTo(-10, 13)
      ctx.closePath()
      ctx.fill()
      ctx.rotate(-ang)
      // 标签带底色提升可读性
      ctx.font = 'bold 13px system-ui, sans-serif'
      ctx.textAlign = ex < game.width / 2 ? 'left' : 'right'
      const lx = ex < game.width / 2 ? 26 : -26
      const ly = ey + (ey < game.height / 2 ? 16 : -10)
      const tw = ctx.measureText(t.label).width
      ctx.fillStyle = 'rgba(6, 18, 31, 0.55)'
      ctx.fillRect(
        ex < game.width / 2 ? lx - 4 : lx - tw - 4,
        ly - 12,
        tw + 8,
        17,
      )
      ctx.fillStyle = 'rgba(255, 138, 112, 0.98)'
      ctx.fillText(t.label, lx, ly)
      ctx.restore()
    }
    ctx.textAlign = 'left'

    // 提示消息
    if (this.messageTimer > 0) {
      const alpha = Math.min(1, this.messageTimer / 0.5)
      ctx.textAlign = 'center'
      ctx.font = 'bold 20px system-ui, sans-serif'
      ctx.fillStyle = `rgba(255, 220, 150, ${alpha})`
      ctx.fillText(this.message, game.width / 2, 64)
    }
    ctx.textAlign = 'left'
  }
}
