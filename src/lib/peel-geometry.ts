/** Half-plane clipping and reflection, in the sticker's 320px viewBox. */
export function peelGeometry(p: number, angle: number) {
  const nx = Math.cos(angle),
    ny = Math.sin(angle);
  const corners = [
    [-20, -20],
    [340, -20],
    [340, 340],
    [-20, 340],
  ];
  const projections = corners.map(([x, y]) => nx * x + ny * y);
  const lo = Math.min(...projections),
    hi = Math.max(...projections);
  const q = lo + p * (hi - lo);
  function polygon(sign: number) {
    const out: number[][] = [];
    for (let i = 0; i < 4; i++) {
      const a = corners[i],
        b = corners[(i + 1) % 4];
      const da = sign * (nx * a[0] + ny * a[1] - q),
        db = sign * (nx * b[0] + ny * b[1] - q);
      if (da >= 0) out.push(a);
      if (da >= 0 !== db >= 0) {
        const t = da / (da - db);
        out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
      }
    }
    return out.map((a) => a.join(",")).join(" ");
  }
  return {
    front: polygon(1),
    fold: polygon(-1),
    matrix: `matrix(${1 - 2 * nx * nx} ${-2 * nx * ny} ${-2 * nx * ny} ${1 - 2 * ny * ny} ${2 * q * nx} ${2 * q * ny})`,
    x: q * nx,
    y: q * ny,
    nx,
    ny,
  };
}
