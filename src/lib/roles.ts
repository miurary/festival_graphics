/**
 * Role tagging for logo SVGs.
 *
 * A single SVG drives different extrusion settings per piece. Which piece is
 * which comes from the path's `id` where one exists, and falls back to its
 * fill colour. Both are per-path, so we get per-object handles rather than
 * per-group ones.
 * 
 * Note: this is currently only for the single POC logo.
 * Roles may need to be redefined later to be reuseable between logos.
 */

export const ROLES = ['plate', 'bracket', 'bar'] as const
export type Role = (typeof ROLES)[number]

export interface ExtrudeConfig {
  depth: number
  curveSegments: number
  bevelEnabled: boolean
  bevelThickness: number
  bevelSize: number
  bevelOffset: number
  bevelSegments: number
}

/**
 * The deliberately ugly first render. Bevels and high curve resolution hide
 * shape problems, so both start off. Turn them up from the debug panel only
 * once the outlines are confirmed.
 */
export const UGLY: ExtrudeConfig = {
  depth: 10,
  curveSegments: 4,
  bevelEnabled: false,
  bevelThickness: 0,
  bevelSize: 0,
  bevelOffset: 0,
  bevelSegments: 1,
}

export function defaultConfig(): Record<Role, ExtrudeConfig> {
  return { plate: { ...UGLY }, bracket: { ...UGLY }, bar: { ...UGLY } }
}

/** Fallback lookup, keyed by normalised 6-digit hex. */
const FILL_TO_ROLE: Record<string, Role> = {
  '0000ff': 'plate',
  'ff0000': 'bracket',
  '00ff00': 'bar',
}

/**
 * Inkscape serialises the same colour as `#00f`, `#0000ff` or `rgb(0,0,255)`
 * depending on version and export settings, so everything is folded down to
 * one canonical 6-digit form before it is matched against.
 */
export function normaliseFill(fill: string | undefined | null): string | null {
  if (!fill) return null
  const s = fill.trim().toLowerCase()
  if (s === 'none' || s === 'transparent') return null

  const short = /^#([0-9a-f]{3})$/.exec(s)
  if (short) {
    return short[1]
      .split('')
      .map((ch) => ch + ch)
      .join('')
  }

  const long = /^#([0-9a-f]{6})$/.exec(s)
  if (long) return long[1]

  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(s)
  if (rgb) {
    return [rgb[1], rgb[2], rgb[3]]
      .map((n) =>
        Math.min(255, Math.max(0, Math.round(Number(n))))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  }

  return null
}

/**
 * Structural shape of the bit of `SVGLoader`'s ShapePath we care about, so
 * this module does not have to import the loader (and stays testable).
 */
export interface RoleSource {
  userData?: {
    node?: { getAttribute?(name: string): string | null }
    style?: { fill?: string }
  }
}

export interface Identity {
  id: string
  role: Role | null
  fill: string | null
  via: 'id' | 'fill' | null
}

export function identify(path: RoleSource, index: number): Identity {
  const rawId = path.userData?.node?.getAttribute?.('id') ?? null
  const id = rawId || `path-${index}`
  const fill = normaliseFill(path.userData?.style?.fill)

  // `plate`, `bracket-l`, `bar-r-top` -> plate, bracket, bar
  const fromId = rawId
    ? (ROLES.find((r) => rawId === r || rawId.startsWith(`${r}-`)) ?? null)
    : null
  if (fromId) return { id, role: fromId, fill, via: 'id' }

  const fromFill = fill ? (FILL_TO_ROLE[fill] ?? null) : null
  if (fromFill) return { id, role: fromFill, fill, via: 'fill' }

  return { id, role: null, fill, via: null }
}