/**
 * Phase 1 — vanilla three.js debug harness.
 *
 * One file, imperative on purpose. This exists to confirm the extrude is
 * correct before anything declarative sits between us and the geometry.
 * Everything reusable lives in ../lib; this file is the scaffolding around it.
 */

import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import GUI from 'lil-gui'
import { ROLES, UGLY, defaultConfig, type ExtrudeConfig, type Role } from '../lib/roles'
import {
  buildPieces,
  disposePieces,
  frame,
  loadSvg,
  type Framed,
  type Piece,
  type SvgPath,
} from '../lib/buildLogo'

const MARK_URL = '/ninalogo_v1.svg'
const EXPECTED_PATHS = 7

const app = document.getElementById('app') as HTMLDivElement
const hud = document.getElementById('hud') as HTMLDivElement
const errBox = document.getElementById('err') as HTMLPreElement

// --- renderer / scene -------------------------------------------------------

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
app.appendChild(renderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x111318)

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500)
camera.position.set(0, 0, 34)

const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true

scene.add(new THREE.AmbientLight(0xffffff, 0.55))
const key = new THREE.DirectionalLight(0xffffff, 2.4)
key.position.set(5, 7, 9)
scene.add(key)

const grid = new THREE.GridHelper(80, 40, 0x33405a, 0x1e2530)
grid.position.y = -10
const axes = new THREE.AxesHelper(9)
const helpers = new THREE.Group()
helpers.add(grid, axes)
scene.add(helpers)

/**
 * Check 4 in one object: an emissive plane behind the mark. If the eyes and
 * mouth are real voids you see this through them, and it previews the
 * backlighting the whole hole-cut construction exists for.
 */
const backlight = new THREE.Mesh(
  new THREE.PlaneGeometry(120, 60),
  new THREE.MeshBasicMaterial({ color: 0xff2d6f }),
)
backlight.position.z = -18
backlight.visible = false
scene.add(backlight)

// --- materials (pooled: rebuilds swap geometry, never materials) ------------

type MatMode = 'normal' | 'standard' | 'wireframe'

const normalMat = new THREE.MeshNormalMaterial()
const wireMat = new THREE.MeshBasicMaterial({ color: 0x7ee3ff, wireframe: true })
const standardMat: Record<Role, THREE.MeshStandardMaterial> = {
  plate: new THREE.MeshStandardMaterial({ color: 0xe8edf7, metalness: 0.4, roughness: 0.4 }),
  bracket: new THREE.MeshStandardMaterial({ color: 0xff5a5a, metalness: 0.2, roughness: 0.55 }),
  bar: new THREE.MeshStandardMaterial({ color: 0x5affa0, metalness: 0.1, roughness: 0.6 }),
}

function materialFor(role: Role): THREE.Material {
  if (view.material === 'normal') return normalMat
  if (view.material === 'wireframe') return wireMat
  return standardMat[role]
}

// --- state ------------------------------------------------------------------

const view = {
  material: 'normal' as MatMode,
  autoRotate: false,
  backlight: false,
  helpers: true,
  targetWidth: 22,
}

const config = defaultConfig()
/** Mirror object for the "All roles" folder; writes fan out to every role. */
const allRoles: ExtrudeConfig = { ...UGLY }

let paths: SvgPath[] = []
let pieces: Piece[] = []
let framed: Framed | null = null
let viewBox: string | null = null

// --- build ------------------------------------------------------------------

function rebuild() {
  if (framed) {
    scene.remove(framed.root)
    disposePieces(pieces)
  }
  pieces = buildPieces(paths, { config, material: materialFor })
  framed = frame(pieces, view.targetWidth)
  scene.add(framed.root)
  updateHud()
}

let queued = false
function requestRebuild() {
  if (queued) return
  queued = true
  requestAnimationFrame(() => {
    queued = false
    rebuild()
  })
}

const fmt = (v: THREE.Vector3) => `${v.x.toFixed(2)} x ${v.y.toFixed(2)} x ${v.z.toFixed(2)}`

function updateHud() {
  if (!framed) return

  const totals = new Map<Role, { meshes: number; tris: number }>()
  let tris = 0
  for (const p of pieces) {
    const t = totals.get(p.role) ?? { meshes: 0, tris: 0 }
    t.meshes += 1
    t.tris += p.triangles
    totals.set(p.role, t)
    tris += p.triangles
  }

  const perRole = ROLES.filter((r) => totals.has(r))
    .map((r) => {
      const t = totals.get(r)!
      return `  ${r.padEnd(8)} ${String(t.meshes).padStart(2)} mesh  ${String(t.tris).padStart(6)} tri  depth ${config[r].depth}  curveSeg ${config[r].curveSegments}`
    })
    .join('\n')

  const { size, center, scale } = framed
  hud.textContent = [
    `paths parsed   ${paths.length}${paths.length === EXPECTED_PATHS ? '' : `  <- expected ${EXPECTED_PATHS}`}`,
    `meshes         ${pieces.length}`,
    `triangles      ${tris}`,
    perRole,
    `svg viewBox    ${viewBox ?? 'n/a'}`,
    `svg bounds     ${fmt(size)} @ centre ${fmt(center)}`,
    `world scale    ${scale.toFixed(4)}  (target width ${view.targetWidth})`,
  ].join('\n')
}

/** The handoff's verification checklist, with the measured value for each. */
function logChecklist() {
  if (!framed) return
  console.group('Phase 1 verification')

  console.log(
    `1. Orientation — root.scale.y = ${framed.root.scale.y.toFixed(4)} (SVG Y-down -> three Y-up)`,
  )
  console.log(
    `2. Origin      — content offset by ${fmt(framed.content.position)}, applied at group level`,
  )
  console.log(
    `3. Scale       — SVG bounds ${fmt(framed.size)} -> world width ${view.targetWidth} (x${framed.scale.toFixed(4)})`,
  )

  const holed = pieces.filter((p) => p.holes > 0)
  console.log(
    `4. Holes       — ${holed.length ? holed.map((p) => `${p.id}: ${p.holes}`).join(', ') : 'NONE DETECTED'}`,
    holed.length
      ? '(orbit behind the mark and confirm you see through them)'
      : '<- expected 3 on the plate',
  )
  console.log(
    '5. Mouth       — inspect visually for tearing or spikes; watch the console for loader errors',
  )
  console.log(
    `6. Piece count — ${paths.length} paths -> ${pieces.length} meshes${paths.length === EXPECTED_PATHS ? '' : `  <- expected ${EXPECTED_PATHS}`}`,
  )

  console.table(
    pieces.map((p) => ({
      id: p.id,
      role: p.role,
      'role via': p.via,
      fill: p.fill,
      shapes: p.shapes,
      holes: p.holes,
      triangles: p.triangles,
    })),
  )
  console.groupEnd()
}

// --- gui --------------------------------------------------------------------

const gui = new GUI({ title: 'Phase 1 — extrude harness', width: 320 })

const viewFolder = gui.addFolder('View')
viewFolder.add(view, 'material', ['normal', 'standard', 'wireframe']).onChange(requestRebuild)
viewFolder.add(view, 'targetWidth', 4, 60, 1).onChange(requestRebuild)
viewFolder.add(view, 'autoRotate')
viewFolder.add(view, 'backlight').onChange((v: boolean) => (backlight.visible = v))
viewFolder.add(view, 'helpers').onChange((v: boolean) => (helpers.visible = v))
viewFolder.add({ report: logChecklist }, 'report').name('log report to console')

function addExtrudeControls(folder: GUI, target: ExtrudeConfig, onChange: () => void) {
  folder.add(target, 'depth', 0, 60, 0.5).onChange(onChange)
  folder.add(target, 'curveSegments', 1, 24, 1).onChange(onChange)
  folder.add(target, 'bevelEnabled').onChange(onChange)
  folder.add(target, 'bevelThickness', 0, 5, 0.05).onChange(onChange)
  folder.add(target, 'bevelSize', 0, 5, 0.05).onChange(onChange)
  folder.add(target, 'bevelOffset', -2, 2, 0.05).onChange(onChange)
  folder.add(target, 'bevelSegments', 1, 6, 1).onChange(onChange)
}

const roleFolders: GUI[] = []

const allFolder = gui.addFolder('All roles')
addExtrudeControls(allFolder, allRoles, () => {
  for (const r of ROLES) Object.assign(config[r], allRoles)
  for (const f of roleFolders) for (const c of f.controllers) c.updateDisplay()
  requestRebuild()
})

for (const role of ROLES) {
  const folder = gui.addFolder(role)
  folder.close()
  addExtrudeControls(folder, config[role], requestRebuild)
  roleFolders.push(folder)
}

// --- loop -------------------------------------------------------------------

function resize() {
  const w = window.innerWidth
  const h = window.innerHeight
  renderer.setSize(w, h)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}
window.addEventListener('resize', resize)
resize()

renderer.setAnimationLoop(() => {
  if (view.autoRotate && framed) framed.root.rotation.y += 0.006
  controls.update()
  renderer.render(scene, camera)
})

// --- load -------------------------------------------------------------------

loadSvg(MARK_URL)
  .then((result) => {
    paths = result.paths
    viewBox = result.viewBox
    rebuild()
    logChecklist()
  })
  .catch((e: unknown) => {
    const message = e instanceof Error ? `${e.message}\n\n${e.stack ?? ''}` : String(e)
    errBox.textContent = `Failed to load ${MARK_URL}\n\n${message}`
    errBox.style.display = 'grid'
    console.error(e)
  })
