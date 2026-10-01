export interface JoystickState {
  active: boolean
  /** 按下时的锚点（屏幕 CSS 像素），供摇杆视图绘制基座 */
  startX: number
  startY: number
  /** 当前触点位置 */
  x: number
  y: number
  /** 归一化方向向量，长度 0~1，含死区处理 */
  vx: number
  vy: number
}

const JOYSTICK_RADIUS = 90
const JOYSTICK_DEAD_ZONE = 0.16
/** 屏幕左 55% 为摇杆区，其余为攻击区（触屏）；鼠标按下一律视为攻击 */
const JOYSTICK_AREA = 0.55

/** 技能按钮：屏幕右下（相对攻击钮上方），ControlView 绘制与触摸判定共用 */
export const SKILL_BUTTON = { offsetX: 92, offsetY: 186, r: 34 }

/**
 * 统一输入：
 * - 电脑：键盘移动 + 鼠标点按/空格攻击
 * - 手机：左半屏浮动摇杆（按哪出哪）+ 右侧任意触点攻击
 * 输出统一为移动向量与攻击信号，玩法层不感知具体设备。
 */
export class InputManager {
  private keys = new Set<string>()
  private justPressedKeys = new Set<string>()
  private joystickTouchId: number | null = null
  private readonly joystickState: JoystickState = {
    active: false,
    startX: 0,
    startY: 0,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
  }
  private attackPointerIds = new Set<number>()
  private mouseAttackDown = false
  private attackJustPressedFlag = false
  private skillJustPressedFlag = false
  /** 最近一次按下的屏幕坐标（供 HUD 面板点击判定） */
  readonly lastPointerDown = { x: 0, y: 0 }

  constructor(canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault()
      }
      this.keys.add(e.code)
      if (!e.repeat) this.justPressedKeys.add(e.code)
    })
    window.addEventListener('keyup', (e) => this.keys.delete(e.code))
    window.addEventListener('blur', () => {
      this.keys.clear()
      this.joystickTouchId = null
      this.joystickState.active = false
      this.joystickState.vx = 0
      this.joystickState.vy = 0
      this.attackPointerIds.clear()
      this.mouseAttackDown = false
    })

    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId)
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      this.lastPointerDown.x = x
      this.lastPointerDown.y = y
      // 技能按钮区（攻击钮上方）：只触发技能，不记攻击/摇杆
      const sbx = canvas.clientWidth - SKILL_BUTTON.offsetX
      const sby = canvas.clientHeight - SKILL_BUTTON.offsetY
      if (Math.hypot(x - sbx, y - sby) < SKILL_BUTTON.r + 12) {
        this.skillJustPressedFlag = true
        return
      }
      if (
        e.pointerType !== 'mouse' &&
        x < canvas.clientWidth * JOYSTICK_AREA &&
        this.joystickTouchId === null
      ) {
        // 触屏左区：成为摇杆
        this.joystickTouchId = e.pointerId
        this.joystickState.active = true
        this.joystickState.startX = x
        this.joystickState.startY = e.clientY - rect.top
        this.joystickState.x = this.joystickState.startX
        this.joystickState.y = this.joystickState.startY
        this.joystickState.vx = 0
        this.joystickState.vy = 0
      } else {
        // 鼠标一律攻击；触屏右区也是攻击
        this.attackPointerIds.add(e.pointerId)
        if (e.pointerType === 'mouse') this.mouseAttackDown = true
        this.attackJustPressedFlag = true
      }
    })
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.joystickTouchId) return
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      this.joystickState.x = x
      this.joystickState.y = y
      let vx = (x - this.joystickState.startX) / JOYSTICK_RADIUS
      let vy = (y - this.joystickState.startY) / JOYSTICK_RADIUS
      const len = Math.hypot(vx, vy)
      if (len > 1) {
        vx /= len
        vy /= len
      }
      this.joystickState.vx = vx
      this.joystickState.vy = vy
    })
    const release = (e: PointerEvent): void => {
      if (e.pointerId === this.joystickTouchId) {
        this.joystickTouchId = null
        this.joystickState.active = false
        this.joystickState.vx = 0
        this.joystickState.vy = 0
      } else {
        this.attackPointerIds.delete(e.pointerId)
        if (e.pointerType === 'mouse') this.mouseAttackDown = false
      }
    }
    canvas.addEventListener('pointerup', release)
    canvas.addEventListener('pointercancel', release)
    canvas.addEventListener('contextmenu', (e) => e.preventDefault())
  }

  get joystick(): Readonly<JoystickState> {
    return this.joystickState
  }

  isDown(code: string): boolean {
    return this.keys.has(code)
  }

  isJustPressed(code: string): boolean {
    return this.justPressedKeys.has(code)
  }

  /** 合成移动向量：摇杆（过死区）优先，其次键盘 */
  getMoveVector(): { x: number; y: number } {
    const j = this.joystickState
    if (j.active && Math.hypot(j.vx, j.vy) > JOYSTICK_DEAD_ZONE) {
      return { x: j.vx, y: j.vy }
    }
    let x = 0
    let y = 0
    if (this.isDown('KeyA') || this.isDown('ArrowLeft')) x -= 1
    if (this.isDown('KeyD') || this.isDown('ArrowRight')) x += 1
    if (this.isDown('KeyW') || this.isDown('ArrowUp')) y -= 1
    if (this.isDown('KeyS') || this.isDown('ArrowDown')) y += 1
    const len = Math.hypot(x, y)
    if (len > 1) {
      x /= len
      y /= len
    }
    return { x, y }
  }

  isAttackHeld(): boolean {
    return this.attackPointerIds.size > 0 || this.mouseAttackDown
  }

  attackJustPressed(): boolean {
    return this.attackJustPressedFlag || this.justPressedKeys.has('Space')
  }

  /** 技能释放信号：技能按钮或 R 键 */
  skillJustPressed(): boolean {
    return this.skillJustPressedFlag || this.justPressedKeys.has('KeyR')
  }

  /** 场景在点击被 UI（如能力面板）消费时调用，避免同帧触发咬击 */
  clearAttackJustPressed(): void {
    this.attackJustPressedFlag = false
  }

  /** 供 UI 场景使用的"任意确认"信号 */
  confirmJustPressed(): boolean {
    return this.attackJustPressedFlag || this.justPressedKeys.has('Enter') || this.justPressedKeys.has('Space')
  }

  endFrame(): void {
    this.justPressedKeys.clear()
    this.attackJustPressedFlag = false
    this.skillJustPressedFlag = false
  }
}
