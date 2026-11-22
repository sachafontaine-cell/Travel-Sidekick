// The app icon designs. Navy and gold like the other Fontaine apps, with the family fleur-de-lis
// (same drawing as the Control Center icon) small on each one.
export const NAVY = '#0D235A', GOLD = '#E0A21C', GOLD_DARK = '#B5850F', CREAM = '#F7F3EA'

const FLEUR = `<path d="M50 2 C67 20 68 42 50 62 C32 42 33 20 50 2 Z"/>
  <path d="M46 58 C29 63 10 54 11 38 C12 25 30 22 34 33 C37 42 30 46 26 42 C28 52 38 54 47 50 Z"/>
  <path d="M54 58 C71 63 90 54 89 38 C88 25 70 22 66 33 C63 42 70 46 74 42 C72 52 62 54 53 50 Z"/>
  <rect x="28" y="59" width="44" height="9" rx="4"/>
  <path d="M43 67 L36 90 C45 86 49 79 50 73 C51 79 55 86 64 90 L57 67 Z"/>`
/** A fleur-de-lis `w` px wide, centered on (cx, cy). */
export const fleur = (cx, cy, w, fill) => { const k = w / 100; return `<g transform="translate(${cx - 50 * k} ${cy - 46 * k}) scale(${k})" fill="${fill}">${FLEUR}</g>` }

export const DESIGNS = {
  // A map pin on a dotted route; the fleur-de-lis sits in the pin.
  pin: (s = 1) => `<g transform="translate(256 256) scale(${s}) translate(-256 -256)">
    <path d="M70 420 C130 470 200 470 230 430" fill="none" stroke="${CREAM}" stroke-width="12" stroke-linecap="round" stroke-dasharray="2 30" opacity=".85"/>
    <ellipse cx="256" cy="446" rx="54" ry="14" fill="#000" opacity=".25"/>
    <path d="M256 448 C222 392 120 302 120 206 A136 136 0 1 1 392 206 C392 302 290 392 256 448 Z" fill="${GOLD}"/>
    <path d="M256 448 C290 392 392 302 392 206 A136 136 0 0 0 256 70 Z" fill="${GOLD_DARK}" opacity=".35"/>
    <circle cx="256" cy="206" r="74" fill="${NAVY}"/>
    ${fleur(256, 206, 88, GOLD)}
  </g>`,
  // A suitcase; the fleur-de-lis is on its tag.
  suitcase: (s = 1) => `<g transform="translate(256 256) scale(${s}) translate(-256 -256)">
    <rect x="196" y="96" width="120" height="86" rx="26" fill="none" stroke="${GOLD}" stroke-width="22"/>
    <rect x="96" y="160" width="320" height="250" rx="40" fill="${GOLD}"/>
    <rect x="96" y="160" width="320" height="34" rx="17" fill="${GOLD_DARK}" opacity=".45"/>
    <rect x="168" y="160" width="18" height="250" fill="${NAVY}" opacity=".85"/>
    <rect x="326" y="160" width="18" height="250" fill="${NAVY}" opacity=".85"/>
    <circle cx="146" cy="428" r="16" fill="${CREAM}"/><circle cx="366" cy="428" r="16" fill="${CREAM}"/>
    <rect x="212" y="236" width="88" height="96" rx="16" fill="${NAVY}"/>
    ${fleur(256, 284, 62, GOLD)}
  </g>`,
  // A paper plane with a dotted trail; the fleur-de-lis is on the wing.
  plane: (s = 1) => `<g transform="translate(256 256) scale(${s}) translate(-256 -256)">
    <path d="M70 410 C120 330 170 360 200 320" fill="none" stroke="${CREAM}" stroke-width="12" stroke-linecap="round" stroke-dasharray="2 30" opacity=".85"/>
    <path d="M86 248 L430 104 L236 300 Z" fill="${GOLD}"/>
    <path d="M236 300 L430 104 L300 414 Z" fill="${GOLD_DARK}"/>
    <path d="M236 300 L262 360 L300 414 Z" fill="#8F6A0C"/>
    ${fleur(250, 230, 62, NAVY)}
  </g>`,
}

/** Full-bleed square (Android crops it), so no white border ever appears. */
export const icon = (name, scale) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"><rect width="512" height="512" fill="${NAVY}"/>${DESIGNS[name](scale)}</svg>`
