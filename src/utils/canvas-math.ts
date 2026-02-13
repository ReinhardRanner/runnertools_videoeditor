export const getSnapInfo = (val: number, guides: number[], threshold: number) => {
  let best = val;
  let minDist = threshold;
  let snapped = false;
  let guide: number | null = null;

  for (const g of guides) {
    const d = Math.abs(val - g);
    if (d < minDist) {
      minDist = d;
      best = g;
      snapped = true;
      guide = g;
    }
  }

  return { value: best, snapped, guide };
};

/**
 * Calculates the angle in degrees between a center point and a target point.
 */
export const getAngle = (cx: number, cy: number, px: number, py: number): number => {
  return Math.atan2(py - cy, px - cx) * (180 / Math.PI);
};

/**
 * Standard smoothstep function for interpolation logic.
 */
export const smoothstep = (t: number): number => {
  const v = Math.max(0, Math.min(1, t));
  return v * v * (3 - 2 * v);
};