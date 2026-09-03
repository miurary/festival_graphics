/**
 * Headless preflight for a logo SVG.
 *
 *   node scripts/verify-svg.mjs public/ninalogo_v1.svg
 *
 * Answers the parts of the Phase 1 checklist that do not need eyes: path
 * count, role resolution, contour winding, whether the holes are genuine
 * voids, degenerate geometry, and triangle counts per role.
 *
 * The hole test is the interesting one. Rather than trusting the loader's
 * hole detection, it samples points that lie inside each hole contour and
 * asserts that no front-cap triangle covers them — the same thing you check
 * by orbiting behind the mark, done numerically.
 *
 * Intended to be run against each of the ~40 logos before they are wired up.
 */

import { readFileSync } from 'node:fs'
import { argv, env } from 'node:process'
import { JSDOM } from 'jsdom'
import * as THREE from 'three'

globalThis.DOMParser = new JSDOM().window.DOMParser

const { SVGLoader } = await import('three/examples/jsm/loaders/SVGLoader.js')

const file = argv[2] ?? 'public/ninalogo_v1.svg'
const CURVE_SEGMENTS = Number(env.CURVE_SEGMENTS ?? 12)
const SAMPLES_PER_AXIS = 60

const ROLES = ['plate', 'bracket', 'bar']
const roleOf = (id) => ROLES.find((r) => id === r || id.startsWith(`${r}-`)) ?? 'unknown'

// --- helpers ---------------------------------------------------------------

const signedArea = (pts) => {
  let a = 0
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += (pts[j].x + pts[i].x) * (pts[j].y - pts[i].y)
  }
  return a / 2
}

const pointInPolygon = (x, y, pts) => {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x
    const yi = pts[i].y
    const xj = pts[j].x
    const yj = pts[j].y
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

const pointInTriangle = (px, py, ax, ay, bx, by, cx, cy) => {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by)
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy)
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay)
  const neg = d1 < 0 || d2 < 0 || d3 < 0
  const pos = d1 > 0 || d2 > 0 || d3 > 0
  return !(neg && pos)
}

/**
 * Coincident points (curve joins that sample to the same coordinate) are
 * counted separately from the shortest genuine segment — mixing them just
 * reports floating-point noise.
 */
const segmentStats = (pts) => {
  let min = Infinity
  let coincident = 0
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
    if (d < 1e-9) coincident += 1
    else if (d < min) min = d
  }
  return { min, coincident }
}

// --- parse -----------------------------------------------------------------

const svg = readFileSync(file, 'utf8')
const parsed = new SVGLoader().parse(svg)
const paths = parsed.paths

console.log(`\n${file}`)
console.log(`viewBox: ${parsed.xml.getAttribute('viewBox')}`)
console.log(`paths:   ${paths.length}\n`)

const rows = []
const findings = []
let totalTris = 0
const bounds = new THREE.Box3()

for (const [i, path] of paths.entries()) {
  const id = path.userData?.node?.getAttribute('id') ?? `path-${i}`
  const role = roleOf(id)
  const fill = path.userData?.style?.fill ?? null
  if (role === 'unknown') findings.push(`${id}: id matches no known role`)

  const shapes = path.toShapes()

  // --- winding + segment debris
  //
  // The absolute sign is not meaningful (it flips with Y-axis direction, and
  // mirrored copies of a piece wind opposite to their twins). What has to hold
  // is that a hole winds *opposite* to the contour it is cut from.
  let holes = 0
  let shortest = Infinity
  let coincident = 0
  const windings = []
  for (const shape of shapes) {
    const outer = shape.getPoints(CURVE_SEGMENTS)
    const outerSign = Math.sign(signedArea(outer))
    windings.push(outerSign > 0 ? 'ccw' : 'cw')
    const os = segmentStats(outer)
    shortest = Math.min(shortest, os.min)
    coincident += os.coincident

    for (const hole of shape.holes) {
      holes += 1
      const hp = hole.getPoints(CURVE_SEGMENTS)
      if (Math.sign(signedArea(hp)) === outerSign) {
        findings.push(`${id}: hole winds the same way as its outer contour — will extrude solid`)
      }
      const hs = segmentStats(hp)
      shortest = Math.min(shortest, hs.min)
      coincident += hs.coincident
    }
  }

  // --- extrude
  const geometry = new THREE.ExtrudeGeometry(shapes, {
    depth: 10,
    curveSegments: CURVE_SEGMENTS,
    bevelEnabled: false,
  })
  const pos = geometry.getAttribute('position')
  const tris = pos.count / 3
  totalTris += tris
  bounds.union(new THREE.Box3().setFromBufferAttribute(pos))

  // --- degenerate + non-finite geometry
  let degenerate = 0
  let nonFinite = 0
  for (let t = 0; t < pos.count; t += 3) {
    const ax = pos.getX(t)
    const ay = pos.getY(t)
    const az = pos.getZ(t)
    const bx = pos.getX(t + 1)
    const by = pos.getY(t + 1)
    const bz = pos.getZ(t + 1)
    const cx = pos.getX(t + 2)
    const cy = pos.getY(t + 2)
    const cz = pos.getZ(t + 2)
    if (![ax, ay, az, bx, by, bz, cx, cy, cz].every(Number.isFinite)) {
      nonFinite += 1
      continue
    }
    const abx = bx - ax
    const aby = by - ay
    const abz = bz - az
    const acx = cx - ax
    const acy = cy - ay
    const acz = cz - az
    const nx = aby * acz - abz * acy
    const ny = abz * acx - abx * acz
    const nz = abx * acy - aby * acx
    if (Math.hypot(nx, ny, nz) / 2 < 1e-9) degenerate += 1
  }
  if (nonFinite) findings.push(`${id}: ${nonFinite} triangles contain NaN/Infinity`)

  // --- are the holes actually voids?
  const front = []
  for (let t = 0; t < pos.count; t += 3) {
    if (Math.abs(pos.getZ(t) - 10) < 1e-6 && Math.abs(pos.getZ(t + 1) - 10) < 1e-6 && Math.abs(pos.getZ(t + 2) - 10) < 1e-6) {
      front.push([
        pos.getX(t), pos.getY(t),
        pos.getX(t + 1), pos.getY(t + 1),
        pos.getX(t + 2), pos.getY(t + 2),
      ])
    }
  }

  let sampled = 0
  let covered = 0
  for (const shape of shapes) {
    for (const hole of shape.holes) {
      const hp = hole.getPoints(CURVE_SEGMENTS)
      const xs = hp.map((p) => p.x)
      const ys = hp.map((p) => p.y)
      const minX = Math.min(...xs)
      const maxX = Math.max(...xs)
      const minY = Math.min(...ys)
      const maxY = Math.max(...ys)
      for (let sy = 0; sy < SAMPLES_PER_AXIS; sy++) {
        for (let sx = 0; sx < SAMPLES_PER_AXIS; sx++) {
          const x = minX + ((maxX - minX) * (sx + 0.5)) / SAMPLES_PER_AXIS
          const y = minY + ((maxY - minY) * (sy + 0.5)) / SAMPLES_PER_AXIS
          if (!pointInPolygon(x, y, hp)) continue
          sampled += 1
          if (front.some((t) => pointInTriangle(x, y, ...t))) covered += 1
        }
      }
    }
  }
  if (holes > 0 && covered > 0) {
    findings.push(`${id}: ${covered}/${sampled} points inside hole contours are covered by solid geometry`)
  }

  rows.push({
    id,
    role,
    fill,
    wind: windings.join(','),
    holes,
    tris,
    degenerate,
    coincident,
    'shortest seg': Number.isFinite(shortest) ? shortest.toExponential(2) : 'n/a',
    'hole samples': holes ? `${sampled - covered}/${sampled} open` : '-',
  })
}

console.table(rows)

const size = bounds.getSize(new THREE.Vector3())
console.log(`bounds:    ${size.x.toFixed(3)} x ${size.y.toFixed(3)} (svg user units)`)
console.log(`triangles: ${totalTris} total at curveSegments=${CURVE_SEGMENTS}, depth=10, no bevel`)

const byRole = {}
for (const r of rows) byRole[r.role] = (byRole[r.role] ?? 0) + r.tris
console.log(`per role:  ${Object.entries(byRole).map(([k, v]) => `${k}=${v}`).join('  ')}`)

console.log(findings.length ? `\nfindings:\n  ${findings.join('\n  ')}\n` : '\nno findings\n')
process.exit(findings.length ? 1 : 0)
