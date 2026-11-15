import { Unsupported, type Box, type Labels, type Point, type Shape } from './geometry.js';
import { round } from './numbers.js';

// From shapes to a grid of labeled cells: 0 is nothing, 1 and up is a fill. Every measurement reads the grid, so a vector logo and a
// raster one are measured the same way. The longer side of the grid is RESOLUTION cells.

export const RESOLUTION = 256;

/** Paint `label` into the cells whose centers a set of polygons covers, by the nonzero or the even-odd rule. */
export function fillPolygons(grid: Labels, origin: Point, scale: number, polygons: Point[][], label: number, rule: 'nonzero' | 'evenodd'): void {
  const height = grid.length;
  const width = grid[0]!.length;
  const edges: [number, number, number, number][] = [];
  for (const polygon of polygons) {
    const points = polygon.map(([px, py]) => [(px - origin[0]) * scale, (py - origin[1]) * scale] as Point);
    points.forEach(([x0, y0], k) => {
      const [x1, y1] = points[(k + 1) % points.length]!;
      if (y0 !== y1) edges.push([x0, y0, x1, y1]);
    });
  }
  for (let row = 0; row < height; row++) {
    const cy = row + 0.5;
    const crossings: [number, number][] = [];
    for (const [x0, y0, x1, y1] of edges) if ((y0 <= cy && cy < y1) || (y1 <= cy && cy < y0)) crossings.push([x0 + ((cy - y0) * (x1 - x0)) / (y1 - y0), y1 > y0 ? 1 : -1]);
    crossings.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let winding = 0;
    for (let k = 0; k < crossings.length - 1; k++) {
      winding = rule === 'evenodd' ? winding ^ 1 : winding + crossings[k]![1];
      if (winding !== 0) {
        const start = Math.ceil(crossings[k]![0] - 0.5);
        const end = Math.ceil(crossings[k + 1]![0] - 0.5);
        for (let col = Math.max(start, 0); col < Math.min(end, width); col++) grid[row]![col] = label;
      }
    }
  }
}

/**
 * The part of the artboard (or of the crop) that the ink's points span, so the grid is drawn at the same resolution however much padding
 * the artwork has. Undefined when no shape reaches it.
 */
export function inkRegion(viewBox: Box, shapes: Shape[], crop?: Box): Box | undefined {
  const [vx, vy, vw, vh] = crop ?? viewBox;
  const points = shapes.flatMap((s) => s.polygons.flat());
  if (points.length === 0) return undefined;
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const [x0, y0, x1, y1] = [Math.max(vx, minX), Math.max(vy, minY), Math.min(vx + vw, maxX), Math.min(vy + vh, maxY)];
  return x1 > x0 && y1 > y0 ? [x0, y0, x1 - x0, y1 - y0] : undefined;
}

/** Shapes drawn into a grid, and the region of the artwork the grid covers. */
export function rasterize(viewBox: Box, shapes: Shape[], crop?: Box): { grid: Labels; region: Box } {
  const region = inkRegion(viewBox, shapes, crop);
  if (!region) throw new Unsupported('the logo has nothing to measure: no ink in it');
  const [vx, vy, vw, vh] = region;
  const scale = RESOLUTION / Math.max(vw, vh);
  const width = Math.max(1, round(vw * scale));
  const height = Math.max(1, round(vh * scale));
  const grid: Labels = Array.from({ length: height }, () => new Array<number>(width).fill(0));
  const labels = new Map<string, number>();
  for (const shape of shapes) {
    if (!labels.has(shape.fill)) labels.set(shape.fill, labels.size + 1);
    fillPolygons(grid, [vx, vy], scale, shape.polygons, labels.get(shape.fill)!, shape.rule);
  }
  return { grid, region };
}

/**
 * A raster (RGBA bytes, row by row) as a grid. It is first scaled down to RESOLUTION cells on its longer side by averaging the pixels each
 * cell covers. Then transparent (or, when the image has no transparency, the corner's color) is nothing, and the rest is labeled by its
 * color, three bits a channel.
 */
export function labelRaster(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number): Labels {
  const scale = RESOLUTION / Math.max(width, height);
  const [w, h] = scale < 1 ? [Math.max(1, round(width * scale)), Math.max(1, round(height * scale))] : [width, height];
  const pixels = scale < 1 ? boxScale(rgba, width, height, w, h) : rgba;
  const total = w * h;
  let transparent = 0;
  for (let i = 0; i < total; i++) if (pixels[i * 4 + 3]! < 128) transparent++;
  const keyed = transparent > 0.02 * total;
  const corner = [pixels[0]!, pixels[1]!, pixels[2]!];
  const grid: Labels = Array.from({ length: h }, () => new Array<number>(w).fill(0));
  const labels = new Map<number, number>();
  for (let i = 0; i < total; i++) {
    const [r, g, b, a] = [pixels[i * 4]!, pixels[i * 4 + 1]!, pixels[i * 4 + 2]!, pixels[i * 4 + 3]!];
    const ink = keyed ? a >= 128 : Math.abs(r - corner[0]!) + Math.abs(g - corner[1]!) + Math.abs(b - corner[2]!) > 60;
    if (!ink) continue;
    const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
    if (!labels.has(key)) labels.set(key, labels.size + 1);
    grid[Math.floor(i / w)]![i % w] = labels.get(key)!;
  }
  return grid;
}

/** RGBA pixels scaled to w by h by averaging, each output pixel the mean of the source area it covers, partial pixels in proportion. */
function boxScale(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h * 4);
  const [sx, sy] = [width / w, height / h];
  for (let oy = 0; oy < h; oy++) {
    const [y0, y1] = [oy * sy, (oy + 1) * sy];
    for (let ox = 0; ox < w; ox++) {
      const [x0, x1] = [ox * sx, (ox + 1) * sx];
      const sum = [0, 0, 0, 0];
      let weight = 0;
      for (let y = Math.floor(y0); y < Math.min(height, Math.ceil(y1)); y++) {
        const wy = Math.min(y + 1, y1) - Math.max(y, y0);
        for (let x = Math.floor(x0); x < Math.min(width, Math.ceil(x1)); x++) {
          const wgt = wy * (Math.min(x + 1, x1) - Math.max(x, x0));
          const at = (y * width + x) * 4;
          // Color is weighted by alpha so a transparent pixel's hidden color does not tint the cell, then the alpha itself is averaged
          const a = rgba[at + 3]! / 255;
          sum[0]! += rgba[at]! * a * wgt;
          sum[1]! += rgba[at + 1]! * a * wgt;
          sum[2]! += rgba[at + 2]! * a * wgt;
          sum[3]! += rgba[at + 3]! * wgt;
          weight += wgt;
        }
      }
      const alpha = sum[3]! / weight;
      const to = (ox + oy * w) * 4;
      const coverage = alpha / 255;
      out[to] = coverage > 0 ? Math.round(sum[0]! / weight / coverage) : 0;
      out[to + 1] = coverage > 0 ? Math.round(sum[1]! / weight / coverage) : 0;
      out[to + 2] = coverage > 0 ? Math.round(sum[2]! / weight / coverage) : 0;
      out[to + 3] = Math.round(alpha);
    }
  }
  return out;
}
