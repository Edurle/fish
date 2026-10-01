export function clamp(min: number, max: number, v: number): number {
  return v < min ? min : v > max ? max : v
}
