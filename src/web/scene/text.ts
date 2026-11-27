// Vẽ chữ lên canvas để làm texture (bảng tên, màn hình, bảng tường).
import * as THREE from 'three';

export interface TextOpts {
  width: number;
  height: number;
  bg: string;
  color: string;
  font?: string;
  padding?: number;
  lineHeight?: number;
}

export const FONT = "'Be Vietnam Pro', system-ui, sans-serif";

export function fitText(ctx: CanvasRenderingContext2D, s: string, max: number): string {
  if (ctx.measureText(s).width <= max) return s;
  let t = s;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}

export class TextCanvas {
  readonly canvas = document.createElement('canvas');
  readonly ctx: CanvasRenderingContext2D;
  readonly texture: THREE.CanvasTexture;

  constructor(readonly o: TextOpts) {
    this.canvas.width = o.width;
    this.canvas.height = o.height;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
  }

  /** Vẽ các dòng; dòng là [chữ, cỡ, màu?, đậm?]. */
  draw(lines: [string, number, string?, boolean?][]) {
    const { ctx, o } = this;
    const pad = o.padding ?? 16;
    ctx.fillStyle = o.bg;
    ctx.fillRect(0, 0, o.width, o.height);
    let y = pad;
    for (const [s, size, color, bold] of lines) {
      ctx.font = `${bold ? 600 : 400} ${size}px ${o.font ?? FONT}`;
      ctx.fillStyle = color ?? o.color;
      ctx.textBaseline = 'top';
      ctx.fillText(fitText(ctx, s, o.width - pad * 2), pad, y);
      y += size * (o.lineHeight ?? 1.35);
    }
    this.texture.needsUpdate = true;
  }
}

/** Sprite chữ luôn quay về camera. */
export function textSprite(text: string, opts: { size?: number; color?: string; bg?: string; scale?: number } = {}): THREE.Sprite {
  const size = opts.size ?? 40;
  const probe = document.createElement('canvas').getContext('2d')!;
  probe.font = `600 ${size}px ${FONT}`;
  const w = Math.ceil(probe.measureText(text).width) + 32;
  const tc = new TextCanvas({ width: w, height: size + 24, bg: opts.bg ?? 'rgba(255,255,255,0.92)', color: opts.color ?? '#1f2328', padding: 12 });
  tc.draw([[text, size, undefined, true]]);
  const mat = new THREE.SpriteMaterial({ map: tc.texture, depthWrite: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  const k = (opts.scale ?? 0.6) / (size + 24);
  sprite.scale.set(w * k, (size + 24) * k, 1);
  return sprite;
}
