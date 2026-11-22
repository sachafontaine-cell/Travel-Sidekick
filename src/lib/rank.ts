// Sortable string keys: a new key can always be made between two others, so reordering only
// rewrites the moved item (two phones reordering at once still merge cleanly).
const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz'
const B = DIGITS.length

const val = (k: string, i: number, fallback: number) => (i < k.length ? DIGITS.indexOf(k[i]) : fallback)

/** A key strictly between a and b (a < b). Either may be missing (start or end of the list). */
export function between(a?: string | null, b?: string | null): string {
  const lo = a ?? ''
  const hi = b ?? ''
  let out = ''
  for (let i = 0; ; i++) {
    const l = val(lo, i, 0)
    const h = hi ? val(hi, i, B) : B
    if (h - l > 1) return out + DIGITS[Math.floor((l + h) / 2)]
    // Same digit (or adjacent): keep it and look one level deeper.
    out += DIGITS[l]
    if (h - l === 1) {
      // Anything after lo's digit at this level is below hi; go deeper on lo alone.
      return out + midAbove(lo.slice(i + 1))
    }
  }
}

function midAbove(rest: string): string {
  let out = ''
  for (let i = 0; ; i++) {
    const l = val(rest, i, 0)
    if (B - l > 1) return out + DIGITS[Math.floor((l + B) / 2)]
    out += DIGITS[l]
  }
}

/** n evenly spread keys, for a fresh list. */
export function spread(n: number): string[] {
  return Array.from({ length: n }, (_, i) => {
    let x = Math.floor(((i + 1) * B * B) / (n + 1))
    if (x % B === 0) x += 1 // a key ending in 0 would leave no room before it
    return DIGITS[Math.floor(x / B)] + DIGITS[x % B]
  })
}

export const byRank = <T extends { rank: string }>(a: T, b: T) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0)
