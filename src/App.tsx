/**
 * Phase 2 lives here: a <Logo> component taking an SVG url and a role -> config
 * map, one mesh per path, materials and depth driven by role.
 *
 * Nothing is ported yet — Phase 1 has to render correctly first. The vanilla
 * harness is the site root (index.html); this page is served at /phase2.html.
 */
export default function App() {
  return (
    <main style={{ font: '14px/1.6 system-ui, sans-serif', padding: '3rem', maxWidth: '46ch' }}>
      <h1 style={{ font: '600 18px/1.4 system-ui, sans-serif' }}>Phase 2 — not started</h1>
      <p>
        The reusable pieces are already framework-agnostic and live in <code>src/lib/</code>:{' '}
        <code>loadSvg</code>, <code>buildPieces</code> and <code>frame</code>. Porting means
        wrapping them in a component, not rewriting them.
      </p>
      <p>
        <a href="/">Phase 1 harness &rarr;</a>
      </p>
    </main>
  )
}
