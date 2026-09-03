# Phase 1 report — `ninalogo_v1.svg`

three r0.185.1 · vite 8.2.2 · React 19.2 · measured 2026-09-02

Harness is at `index.html` → `src/phase1/main.ts`, served by `npm run dev`.
Reusable extrude code is in `src/lib/`. The React scaffold is parked at
`/phase2.html` and is untouched pending the port.

**Caveat up front:** everything below marked *measured* comes from
`scripts/verify-svg.mjs`, which parses the SVG through `SVGLoader` under jsdom
and inspects the resulting geometry numerically. Everything marked *needs eyes*
has not been visually confirmed by me — the harness renders and serves, but I
have not looked at it.

---

## Which known issues actually manifested

| # | Issue | Outcome |
| - | ----- | ------- |
| 1 | Leftover `matrix(…)` on the face plate | **Did not manifest.** The only transform in the file is `translate(-27.5 -127)` on the wrapping `<g>`. The mirrored matrix is gone — a later export than the one the handoff was written against. Plate coordinates are in the same space as the other six paths, so position debugging is not confusing after all. |
| 2 | Near-zero-length segments in the mouth | **Manifested, mildly.** The plate carries 28 coincident points and a shortest genuine segment of `6.0e-5` (handoff estimated `5e-4`). This produces **8 degenerate triangles** out of the plate's 2380. No NaN vertices, no loader errors, no tearing in the triangulation. 8 zero-area triangles are invisible and cost nothing. **Recommendation: do not run SVGO.** The risk of `convertPathData` altering the fillets outweighs removing 8 triangles. Revisit only if the mouth looks torn (*needs eyes*). |
| 3 | Elliptical corner fillets (~5.35 × 8.13) | **Present in the data, verdict needs eyes.** Confirmed unequal radii in the path (`a 5.35 8.13 89.2`, `a 5.38 8.18 89.2` — the two top corners also differ by 0.6%, per issue 4). Whether it reads as wrong is a judgement call to make in the browser with `bevelSize` turned up. |
| 4 | Sub-1% asymmetries | **Present, ignoring as instructed.** Measured bounds are 149.940 × 40.426 against a declared viewBox of 150 × 40.5. |
| 5 | Winding / hole detection | **Works — but the handoff's description of it is wrong.** See below. |

### On issue 5

The handoff states the plate's outer contour has negative signed area and the
three holes positive. Measured, it is the **opposite**: the plate's outer
contour winds CCW (positive) and its holes wind CW. The absolute sign is not
meaningful anyway — it flips with Y-axis direction, and the file's windings are
genuinely mixed, because mirrored copies wind opposite to their twins:

| | wind |
| - | - |
| `bracket-l` | ccw |
| `bracket-r` | cw |
| `bar-l-top`, `bar-l-bottom` | cw |
| `bar-r-top`, `bar-r-bottom` | ccw |
| `plate` | ccw, holes cw |

What matters is only that a hole winds *opposite* to the contour it is cut
from, which holds. Hole detection works. If a future logo extrudes its holes as
solids, check that relation, not the absolute sign.

**The holes are real voids — measured, not assumed.** 8788 sample points
distributed inside the three hole contours were tested against the front-cap
triangulation; **0 of 8788** are covered by geometry. You should be able to see
straight through all three. The `backlight` toggle in the debug panel puts an
emissive plane behind the mark to make this obvious.

---

## Triangle count per role

At `depth: 10`, `bevelEnabled: false`:

| curveSegments | plate | bracket (×2) | bar (×4) | total |
| ------------- | ----- | ------------ | -------- | ----- |
| 1 | 268 | 96 | 112 | 476 |
| 2 | 460 | 160 | 176 | 796 |
| 4 | 844 | 288 | 304 | **1436** |
| 8 | 1612 | 544 | 560 | 2716 |
| 12 | 2380 | 800 | 816 | 3996 |
| 24 | 4684 | 1568 | 1584 | 7836 |

Growth is exactly linear at **160 triangles per `curveSegments` step** for the
whole mark. Enabling bevels multiplies this by roughly `bevelSegments`.

### Per-role `curveSegments`

The handoff's instinct is right and the numbers support it. The bars are
rounded rectangles with a corner radius of ~1.03 units on a 16.7 × 4.5 body —
at `curveSegments: 12` they spend 816 triangles resolving corners that are two
pixels across on screen.

Suggested split — **plate 12, bracket 8, bar 2** — gives **3100 triangles**
against 3996 for a uniform 12, a 22% saving with no visible difference. Confirm
in the panel (*needs eyes*).

---

## Recommended depth and bevel values

These are **starting points, not conclusions** — settling them is what the
debug panel is for, and it needs a human looking at it. What follows is what
the geometry constrains, which is real, plus a proposal.

**Hard constraint on `bevelSize`, measured from the path data:** the ω mouth is
drawn from arcs of radius 1.58, so the ribbon is ~3.16 units wide at its
narrowest. The bar corner radius is ~1.03. A bevel eats into the shape by
`bevelSize` on every edge, so:

- `bevelSize` above ~1.0 will start visibly closing the mouth and rounding the
  bars into lozenges.
- `bevelSize` ≤ 0.4 is safe on every piece.

Proposal to start from, in SVG user units (artwork is 150 × 40.5):

| Role | depth | bevelSize | bevelThickness | bevelSegments | curveSegments |
| ---- | ----- | --------- | -------------- | ------------- | ------------- |
| plate | 6.0 | 0.35 | 0.35 | 3 | 12 |
| bracket | 4.0 | 0.30 | 0.30 | 2 | 8 |
| bar | 2.5 | 0.20 | 0.20 | 2 | 2 |

`bevelSegments: 3` on the plate follows the handoff's note that it is enough
for the interior hole edges to catch light and read as machined. The `depth: 10`
of the ugly default is 25% of the artwork height — a slab. 6 / 4 / 2.5
preserves the plate > bracket > bar ordering with less bulk.

---

## Do the elliptical corners need redrawing in Inkscape?

**Undetermined — this one genuinely needs eyes.** The asymmetry is confirmed
present in the data, but whether it reads as flattened depends on the final
bevel and camera framing. Turn `bevelSize` up in the panel and look at the two
top corners of the plate. Redraw only if it bothers you at final framing; it is
a plate-only change and does not affect the pipeline.

---

## Deviations from the handoff, and why

1. **`SVGLoader.createShapes()` is deprecated as of r185** — exactly the version
   installed. It now logs a warning and forwards to `shapePath.toShapes()`.
   Following the handoff's snippet would have printed 7 warnings on every
   geometry rebuild, i.e. continuously while dragging a slider. The code calls
   `path.toShapes()`.

2. **Fills arrive as `rgb(255, 0, 0)`, a third format.** The handoff's table
   says `#FF0000`; the file on disk says `#f00`; `SVGLoader` normalises it to
   `rgb(255, 0, 0)` before you ever see it. All three are handled by
   `normaliseFill()` in `src/lib/roles.ts`. Role resolution prefers
   `path.userData.node.id` as the handoff recommends and only falls back to
   fill, so this is belt-and-braces.

3. **`@types/three` mis-declares `SVGResult.xml`** as `XMLDocument`; at runtime
   `SVGLoader` assigns `xml.documentElement`, an element. Cast with a comment in
   `loadSvg()`.

4. **Scaffolded at the repo root**, not in a `festival-lineup/` subdirectory —
   this repo already is the project.

5. **Added `scripts/verify-svg.mjs`** (and a `jsdom` devDependency). Not in the
   handoff. It runs the whole parse-and-extrude headlessly and exits non-zero on
   findings, which is how the numbers in this report were produced. Worth
   pointing at each of the other 39 SVGs before wiring them up — it catches
   solid-extruded holes, NaN geometry, and unrecognised roles without a browser.

---

## Performance budget baseline

| Metric | This logo |
| ------ | --------- |
| Source SVG | 3.3 kB uncompressed |
| Meshes / draw calls | 7 |
| Triangles (recommended per-role settings, no bevel) | ~3100 |
| Triangles (with bevels, est. ×2–3) | ~7–9k |
| JS bundle (three + lil-gui, gzipped) | 166 kB |

At 40 logos the triangle total (~300k) is not the problem; **draw calls are**.
7 meshes × 40 = 280 draw calls if everything is resident. Two mitigations worth
planning for before logo 5, not logo 39:

- Merge same-role pieces per logo where they share a material — the 4 bars and
  2 brackets are 6 of the 7 meshes and could be 2. That takes 280 draw calls to
  ~120.
- The reveal animation needs the pieces to move independently, so merging has
  to happen *after* the animation completes, or be scoped to logos that are not
  currently animating.

The 166 kB gzipped three.js payload is per-site, not per-logo, so it amortises.
Lazy per-scene loading matters for the SVGs and any textures, not for this.

---

## Checklist status

| # | Check | Status |
| - | ----- | ------ |
| 1 | Orientation | Handled — `root.scale.y = -1` in `frame()`. *Needs eyes* to confirm it is not upside down. |
| 2 | Origin | Handled at group level as the handoff prefers; relative positions of the 7 pieces preserved. |
| 3 | Scale | Measured bounds 149.940 × 40.426, normalised to a world width of 22. |
| 4 | Holes | **Measured: 0/8788 interior points covered. Real voids.** |
| 5 | Mouth integrity | 8 degenerate triangles, no NaN, no errors. *Needs eyes* for tearing. |
| 6 | Piece count | **7 paths → 7 meshes.** No unexpected subpath grouping. |

One thing to know when you look: `frame()` applies `scale.y = -1`, a mirror, so
the group's world matrix has a negative determinant. three's `WebGLRenderer`
compensates by flipping its winding order, so this renders correctly — but if
you ever see faces vanishing or lighting inverted after changing that line,
that is the first place to look.
