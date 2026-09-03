/* Grid geometry. Pure: the box the grid was given in, cells out.

   CSS owns the box — one height for every beat count, so adding or removing a
   beat never moves the tempo or the transport. This turns that box into rows,
   columns and a cell size that fit inside it. */

const GAP = 8;
const MIN_CELL = 4;

export interface GridMetrics {
  rows: number;
  cols: number;
  cell: number;
  gap: number;
  width: number;
  ring: number;
}

export function gridMetrics(
  boxWidth: number,
  boxHeight: number,
  beatCount: number,
): GridMetrics {
  const count = beatCount || 1;

  /* Six across reads best, but a fourth row costs more than a wider one, so
     past eighteen the grid widens toward eight rather than take one. */
  const rows = Math.min(3, Math.ceil(count / 6));
  const cols = count <= 6 ? count : Math.ceil(count / rows);
  const cellMax = count <= 4 ? 64 : 56;

  const byHeight = (boxHeight - (rows - 1) * GAP) / rows;
  const byWidth = (boxWidth - (cols - 1) * GAP) / cols;
  const cell = Math.max(
    MIN_CELL,
    Math.floor(Math.min(cellMax, byHeight, byWidth)),
  );

  return {
    rows,
    cols,
    cell,
    gap: GAP,
    width: cols * cell + (cols - 1) * GAP,
    ring: cell < 50 ? 2 : 3,
  };
}
