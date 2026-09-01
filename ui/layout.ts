/* Grid sizing. Pure: viewport in, geometry out, so the reserve constants below
   can be reasoned about — and measured against — without a browser. */

const WIDE = 820;
const GAP = 8;

/* What is left for the beat grid once the tempo, the transport and the panel
   chevron have taken their share. Measured from the laid-out screen and left a
   little short, so the chevron is not flush against the bottom edge.
   RE-MEASURE THESE if the layout changes: they were wrong once and pushed the
   chevron off the bottom of a small phone. */
const RESERVED = { wide: 500, short: 590, tall: 616 };
const SHORT_VIEWPORT = 700;

const MAX_GRID = 2 * 56 + GAP;
const MIN_GRID = 36;
const MAX_SPARE = 268;

export interface GridMetrics {
  wide: boolean;
  rows: number;
  cols: number;
  cell: number;
  height: number;
  gap: number;
  width: number;
  ring: number;
}

export function gridMetrics(
  vw: number,
  vh: number,
  beatCount: number,
): GridMetrics {
  const wide = vw >= WIDE;
  const count = beatCount || 1;

  /* Six across reads best, but a fourth row costs more than a wider one, so
     past eighteen the grid widens toward eight rather than take one. */
  const rows = Math.min(3, Math.ceil(count / 6));
  const cols = count <= 6 ? count : Math.ceil(count / rows);
  const cellMax = count <= 4 ? 64 : 56;

  const reserved = wide
    ? RESERVED.wide
    : vh < SHORT_VIEWPORT
      ? RESERVED.short
      : RESERVED.tall;
  const spare = Math.min(MAX_SPARE, Math.max(MIN_GRID, vh - reserved));
  /* Two rows at full size is what the box holds. Sizing it for five would sink
     the counts nearly everyone uses under a well of empty space. */
  const height = Math.round(Math.min(spare, MAX_GRID));
  const cell = Math.floor(
    Math.min(cellMax, (height - (rows - 1) * GAP) / rows),
  );

  return {
    wide,
    rows,
    cols,
    cell,
    height,
    gap: GAP,
    width: cols * cell + (cols - 1) * GAP,
    ring: cell < 50 ? 2 : 3,
  };
}
