const SAVE_KEY = 'fish.save.v1'

export interface SaveData {
  version: number
  /** 历史最高分 */
  bestScore: number
  /** 累计吃掉的鱼数 */
  totalEaten: number
  /** 累计开局次数 */
  playCount: number
}

function defaultSave(): SaveData {
  return { version: 1, bestScore: 0, totalEaten: 0, playCount: 0 }
}

/**
 * localStorage 存档封装。
 * 读写失败（隐私模式、存储被禁用、配额已满）时静默降级为仅内存档，游戏不崩溃。
 * 后续新增字段只需扩展 SaveData 并在 defaultSave 里给默认值，旧档自动补齐。
 */
export class SaveManager {
  data: SaveData

  constructor() {
    this.data = { ...defaultSave(), ...this.readFromDisk() }
  }

  private readFromDisk(): Partial<SaveData> {
    try {
      const raw = localStorage.getItem(SAVE_KEY)
      if (!raw) return {}
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed !== 'object' || parsed === null) return {}
      return parsed as Partial<SaveData>
    } catch {
      return {}
    }
  }

  write(): void {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.data))
    } catch {
      // 存储不可用时保持内存档即可
    }
  }

  reset(): void {
    this.data = defaultSave()
    this.write()
  }
}
