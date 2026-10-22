// Hand-drawn icon glyphs on a 24×24 grid, as plain path data so they can be rendered by <Icon>
// (inline SVG in currentColor) or by tooling. Bold silhouettes to match the screen-print art.

/** `fill` (default) and `evenodd` paint with currentColor; `stroke` draws a 2.6-unit round line. */
export type GlyphPart = { readonly d: string; readonly paint?: 'fill' | 'evenodd' | 'stroke' };
export type Glyph = readonly GlyphPart[];

function circle(cx: number, cy: number, r: number): string {
  return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
}

function rect(x: number, y: number, w: number, h: number, r = 0): string {
  if (r === 0) return `M${x} ${y}h${w}v${h}h${-w}Z`;
  return `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}Z`;
}

const GEAR =
  'M10.08 3.62L10.27 1.08L13.73 1.08L13.92 3.62L16.65 4.75L18.58 3.09L21.03 5.54L19.37 7.47L20.50 10.20L23.04 10.39L23.04 13.85L20.50 14.04' +
  'L19.37 16.77L21.03 18.70L18.58 21.15L16.65 19.49L13.92 20.62L13.73 23.16L10.27 23.16L10.08 20.62L7.35 19.49L5.42 21.15L2.97 18.70' +
  'L4.63 16.77L3.50 14.04L0.96 13.85L0.96 10.39L3.50 10.20L4.63 7.47L2.97 5.54L5.42 3.09L7.35 4.75Z';

export const GLYPHS = {
  // ---- Categories ----
  apparel: [{ d: 'M8 3L3.6 5 1.2 9.6l3.6 2.2L6 10.3V21h12V10.3l1.2 1.5 3.6-2.2L20.4 5 16 3c-.7 1.8-2.2 2.8-4 2.8S8.7 4.8 8 3Z' }],
  gadgets: [
    { d: `${rect(2, 8, 20, 13.5, 2)}${circle(8.4, 14.75, 4)}${circle(8.4, 14.75, 2.3)}${circle(16.8, 12.6, 1.7)}${rect(14.6, 16.4, 4.4, 1.7, 0.85)}`, paint: 'evenodd' },
    { d: `M5.6 7.6L16.4 2.3l.7 1.4L8.4 7.6Z${circle(17.4, 2.8, 1.4)}` },
  ],
  home: [{ d: 'M12 2.4L1.4 11.6l1.5 1.6 1.6-1.4v9.7h5.6v-5.9h3.8v5.9h5.6v-9.7l1.6 1.4 1.5-1.6-4-3.5V3.6h-2.6v2.4Z' }],
  food: [
    {
      d: 'M12 7.6c-1.8-1.3-4.5-1.5-6.4.1-2.3 2-2.3 5.9-.8 9 1.3 2.7 3.3 5 5.2 4.9.9 0 1.3-.5 2-.5s1.1.5 2 .5c1.9.1 3.9-2.2 5.2-4.9 1.5-3.1 1.5-7-.8-9-1.9-1.6-4.6-1.4-6.4-.1Z',
    },
    { d: 'M11.2 7.1c.1-2-.3-3.4-1.3-4.4l1.1-.8c1.2 1.2 1.8 3 1.6 5.2ZM13.4 5.4c.4-2.2 2.2-3.3 4.4-3.1-.3 2.1-2 3.3-4.4 3.1Z' },
  ],

  // ---- Card types ----
  design: [{ d: 'M2.6 21.4l1.3-4.8 3.5 3.5ZM5 15.4L15.9 4.5l3.6 3.6L8.6 19ZM17 3.4l1.1-1.1a1.6 1.6 0 0 1 2.3 0l1.3 1.3a1.6 1.6 0 0 1 0 2.3L20.6 7Z' }],
  make: [{ d: `${GEAR}${circle(12, 12.12, 3.6)}`, paint: 'evenodd' }],
  ship: [{ d: `M1.4 5h13.4v11.6H1.4ZM15.8 8.6h4l2.8 3.6v4.4h-6.8Z${rect(16.9, 9.8, 2.4, 2.4)}${circle(6, 18.4, 2.6)}${circle(6, 18.4, 1)}${circle(18.2, 18.4, 2.6)}${circle(18.2, 18.4, 1)}`, paint: 'evenodd' }],

  // ---- Trend states ----
  hot: [
    {
      d: 'M12 1.6c.6 3.5 4.9 5.7 6 10 1.3 5-1.9 10.3-6 10.3-4.1 0-7.3-3.2-6.9-7.5.3-2.7 1.9-4.4 3.2-5.5.1 2.1 1 3.5 2.3 4.1-.6-3.9.8-8.2 1.4-11.4ZM12 20c1.9 0 3.4-1.6 3.2-3.7-.2-1.8-1.6-2.8-2.3-4.3-.4 1.7-1.4 2.5-2.3 3.5-1 1.1-1.5 2-1.2 2.9.3 1 1.3 1.6 2.6 1.6Z',
      paint: 'evenodd',
    },
  ],
  emerging: [
    { d: 'M11 21.6V12h2v9.6ZM11.2 12.6C7 12.8 4.2 10.4 3.8 6.2c4.4-.2 7.2 2.2 7.4 6.4ZM12.8 10.4C13 5.9 15.9 3.1 20.3 3c0 4.5-2.9 7.3-7.5 7.4Z' },
    { d: rect(6, 20.4, 12, 2, 1) },
  ],
  saturated: [{ d: 'M3 5.5l6.5 6.5 4-4 7 7', paint: 'stroke' }, { d: 'M22.4 9.4v8.2h-8.2Z' }],
  neutral: [{ d: 'M4 9h16M4 15h16', paint: 'stroke' }],
  loyal: [{ d: 'M12 21l-1.4-1.3C5.4 15 2 11.9 2 8.1 2 5 4.4 2.6 7.5 2.6c1.7 0 3.4.8 4.5 2.1 1.1-1.3 2.8-2.1 4.5-2.1C19.6 2.6 22 5 22 8.1c0 3.8-3.4 6.9-8.6 11.6Z' }],
  buzz: [{ d: 'M12 1.5c.8 5.7 4.5 9.4 10.5 10.5-6 1.1-9.7 4.8-10.5 10.5C11.2 16.8 7.5 13.1 1.5 12 7.5 10.9 11.2 7.2 12 1.5Z' }],
  equity: [
    { d: `${circle(12, 9.4, 7.6)}${circle(12, 9.4, 5.4)}${circle(12, 9.4, 3.6)}`, paint: 'evenodd' },
    { d: 'M7.4 15.4L5.2 22.6l3.4-1.2 2 2.8 1.1-6.6c-1.7 0-3.2-.8-4.3-2.2ZM16.6 15.4l2.2 7.2-3.4-1.2-2 2.8-1.1-6.6c1.7 0 3.2-.8 4.3-2.2Z' },
  ],

  // ---- Economy ----
  capital: [{ d: 'M4 5.2a8 3 0 1 0 16 0a8 3 0 1 0-16 0ZM4 7.8a8 3 0 0 0 16 0v2.6a8 3 0 0 1-16 0ZM4 12.4a8 3 0 0 0 16 0V15a8 3 0 0 1-16 0ZM4 17a8 3 0 0 0 16 0v2.6a8 3 0 0 1-16 0Z' }],
  sales: [{ d: `M4.5 1.6h15v20.8l-2.5-1.6-2.5 1.6-2.5-1.6-2.5 1.6-2.5-1.6-2.5 1.6Z${rect(7.5, 5.4, 9, 1.8, 0.9)}${rect(7.5, 9.6, 9, 1.8, 0.9)}${rect(7.5, 13.8, 5, 1.8, 0.9)}`, paint: 'evenodd' }],
  units: [{ d: 'M12 1.8l9.6 4.8L12 11.4 2.4 6.6ZM2.4 8.6l8.6 4.4v9.4l-8.6-4.4ZM13 13l8.6-4.4V18L13 22.4Z' }],
  margin: [{ d: `M2.4 3.6c0-.7.5-1.2 1.2-1.2h8.1l9.9 9.9-9.4 9.4-9.8-9.9Z${circle(7.2, 7.2, 1.9)}`, paint: 'evenodd' }],
  retool: [
    { d: 'M4.2 10.6a8 8 0 0 1 13.6-4.4M19.8 13.4a8 8 0 0 1-13.6 4.4', paint: 'stroke' },
    { d: 'M21.2 2.4v7.4h-7.4ZM2.8 21.6v-7.4h7.4Z' },
  ],
  scrap: [{ d: `${rect(3.2, 4.4, 17.6, 2.6, 1.1)}M9 4.4V2.8c0-.6.4-1 1-1h4c.6 0 1 .4 1 1v1.6h-1.8v-.8h-2.4v.8ZM5.4 8.6h13.2l-1.2 12.6c-.1.9-.8 1.4-1.6 1.4H8.2c-.8 0-1.5-.5-1.6-1.4Z${rect(9.1, 11, 1.7, 8.6, 0.85)}${rect(13.2, 11, 1.7, 8.6, 0.85)}`, paint: 'evenodd' }],

  // ---- Fixture kinds ----
  station: [{ d: `M1.6 21.8V9.6l5.6 3.6V9.6l5.6 3.6V9.6l5.6 3.6V2.4h4v19.4Z${rect(4.4, 16, 3, 2.6)}${rect(10, 16, 3, 2.6)}${rect(15.6, 16, 3, 2.6)}`, paint: 'evenodd' }],
  mod: [{ d: `M12 1.6l9 5.2v10.4l-9 5.2-9-5.2V6.8Z${circle(12, 12, 4)}`, paint: 'evenodd' }],
} as const satisfies Readonly<Record<string, Glyph>>;

export type IconName = keyof typeof GLYPHS;

export const ICON_NAMES = Object.keys(GLYPHS) as IconName[];
