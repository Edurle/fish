import { SKILL_BUTTON, type InputManager } from '../core/Input'
import { SKILL_DEFS, type SkillKind } from '../entities/Skill'

/** 屏幕空间绘制：浮动摇杆（触摸时）+ 常驻攻击钮 + 技能钮 */
export function drawControls(
  ctx: CanvasRenderingContext2D,
  input: InputManager,
  viewW: number,
  viewH: number,
  skill?: { kind: SkillKind | null; cd: number },
): void {
  const joy = input.joystick
  if (joy.active) {
    // 基座
    ctx.beginPath()
    ctx.arc(joy.startX, joy.startY, 74, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'
    ctx.lineWidth = 3
    ctx.stroke()
    // 手柄：限制在基座内
    const dx = joy.x - joy.startX
    const dy = joy.y - joy.startY
    const len = Math.hypot(dx, dy)
    const maxR = 52
    const k = len > maxR ? maxR / len : 1
    ctx.beginPath()
    ctx.arc(joy.startX + dx * k, joy.startY + dy * k, 30, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)'
    ctx.fill()
  }

  // 攻击钮（右下角）
  const ax = viewW - 92
  const ay = viewH - 96
  const attacking = input.isAttackHeld()
  ctx.beginPath()
  ctx.arc(ax, ay, attacking ? 46 : 50, 0, Math.PI * 2)
  ctx.fillStyle = attacking ? 'rgba(255, 140, 66, 0.75)' : 'rgba(255, 140, 66, 0.35)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(255, 210, 160, 0.8)'
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 20px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('咬', ax, ay + 1)

  // 技能钮（攻击钮上方）
  const sx = viewW - SKILL_BUTTON.offsetX
  const sy = viewH - SKILL_BUTTON.offsetY
  const r = SKILL_BUTTON.r
  const kind = skill?.kind ?? null
  const def = kind ? SKILL_DEFS[kind] : null
  const cdRatio = def ? Math.min(1, (skill?.cd ?? 0) / def.cooldown) : 0
  ctx.beginPath()
  ctx.arc(sx, sy, r, 0, Math.PI * 2)
  ctx.fillStyle = def && cdRatio <= 0 ? `${def.color}66` : 'rgba(255, 255, 255, 0.1)'
  ctx.fill()
  ctx.strokeStyle = def && cdRatio <= 0 ? def.color : 'rgba(255, 255, 255, 0.35)'
  ctx.lineWidth = 3
  ctx.stroke()
  // 冷却扇形遮罩（顺时针恢复）
  if (cdRatio > 0) {
    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.arc(sx, sy, r - 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * cdRatio)
    ctx.closePath()
    ctx.fillStyle = 'rgba(6, 18, 31, 0.6)'
    ctx.fill()
  }
  ctx.fillStyle = def && cdRatio <= 0 ? '#fff' : 'rgba(255, 255, 255, 0.5)'
  ctx.font = 'bold 15px system-ui, sans-serif'
  ctx.fillText(kind ? SKILL_DEFS[kind].name : '技', sx, sy + 1)
  ctx.textBaseline = 'alphabetic'
}
