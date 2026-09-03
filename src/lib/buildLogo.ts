import * as THREE from 'three'
import { SVGLoader, type SVGResult } from 'three/examples/jsm/loaders/SVGLoader.js'
import { identify, type ExtrudeConfig, type Role } from './roles'

/** One parsed `<path>`, as `SVGLoader` hands it back. */
export type SvgPath = SVGResult['paths'][number]

const svgLoader = new SVGLoader()

export interface Piece {
  id: string
  role: Role
  /** How the role was decided — useful when a redrawn SVG loses its ids. */
  via: 'id' | 'fill' | 'fallback'
  fill: string | null
  mesh: THREE.Mesh
  shapes: number
  holes: number
  triangles: number
}

export interface LoadResult {
  paths: SvgPath[]
  /** viewBox of the source document, for sanity-checking the parsed bounds. */
  viewBox: string | null
}

export async function loadSvg(url: string): Promise<LoadResult> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status} ${res.statusText}`)
  const parsed = svgLoader.parse(await res.text())
  // @types/three declares `xml` as XMLDocument, but SVGLoader assigns
  // `xml.documentElement` — it is the <svg> element at runtime.
  const svgEl = parsed.xml as unknown as Element | undefined
  return {
    paths: parsed.paths,
    viewBox: svgEl?.getAttribute('viewBox') ?? null,
  }
}

export interface BuildOptions {
  config: Record<Role, ExtrudeConfig>
  material: (role: Role, id: string) => THREE.Material | THREE.Material[]
  /** Role given to any path that matches neither an id nor a known fill. */
  fallbackRole?: Role
}

export function buildPieces(paths: SvgPath[], opts: BuildOptions): Piece[] {
  const fallback = opts.fallbackRole ?? 'plate'

  return paths.map((path, i) => {
    const { id, role: resolved, fill, via } = identify(path, i)
    const role = resolved ?? fallback
    if (!resolved) {
      console.warn(
        `[logo] "${id}" matched no role by id or fill (fill=${fill ?? 'n/a'}); using "${role}"`,
      )
    }

    // Hole detection lives here: toShapes reads contour winding and the path's
    // fill-rule to decide which subpaths are holes in which shape.
    // (SVGLoader.createShapes, as in the handoff, is deprecated since r185 and
    // now just warns and forwards to this.)
    const shapes = path.toShapes()
    const cfg = opts.config[role]

    const geometry = new THREE.ExtrudeGeometry(shapes, {
      depth: cfg.depth,
      curveSegments: cfg.curveSegments,
      bevelEnabled: cfg.bevelEnabled,
      bevelThickness: cfg.bevelThickness,
      bevelSize: cfg.bevelSize,
      bevelOffset: cfg.bevelOffset,
      bevelSegments: cfg.bevelEnabled ? Math.max(1, cfg.bevelSegments) : 0,
    })

    const mesh = new THREE.Mesh(geometry, opts.material(role, id))
    mesh.name = id
    mesh.userData = { role, id }

    const position = geometry.getAttribute('position')
    return {
      id,
      role,
      via: resolved ? (via as 'id' | 'fill') : 'fallback',
      fill,
      mesh,
      shapes: shapes.length,
      holes: shapes.reduce((n, s) => n + s.holes.length, 0),
      triangles: (geometry.index ? geometry.index.count : position.count) / 3,
    }
  })
}

export interface Framed {
  /** Add this to the scene. Carries the Y-flip and the uniform scale. */
  root: THREE.Group
  /** Holds the meshes. Offset once, so relative piece positions survive. */
  content: THREE.Group
  /** Bounding box size in raw SVG user units. */
  size: THREE.Vector3
  /** Bounding box centre in raw SVG user units. */
  center: THREE.Vector3
  scale: number
}

/**
 * Puts the parsed artwork where a camera at the origin can see it.
 *
 * Three fixes, in one place:
 *  - the SVG origin is the document's top-left, not the artwork's centre, so
 *    the content group is offset by the bounding-box centre. Doing it at the
 *    group level rather than per-mesh keeps the pieces in register.
 *  - SVG's Y axis points down and three's points up, so root is flipped on Y.
 *  - SVG user units are arbitrary, so root is scaled to a known world width.
 */
export function frame(pieces: Piece[], targetWidth: number): Framed {
  const content = new THREE.Group()
  content.name = 'logo-content'
  for (const p of pieces) content.add(p.mesh)

  const box = new THREE.Box3().setFromObject(content)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  content.position.copy(center).negate()

  const scale = size.x > 0 ? targetWidth / size.x : 1
  const root = new THREE.Group()
  root.name = 'logo-root'
  root.add(content)
  root.scale.set(scale, -scale, scale)

  return { root, content, size, center, scale }
}

/**
 * Materials are pooled by the caller and reused across rebuilds, so only the
 * geometry is disposed here.
 */
export function disposePieces(pieces: Piece[]): void {
  for (const p of pieces) {
    p.mesh.geometry.dispose()
    p.mesh.removeFromParent()
  }
}
