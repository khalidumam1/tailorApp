const PALETTE = ['var(--brand-700)', '#4389c1', '#d39a38', '#816bd1', '#d55c59', '#20979b'];

/** Shared chart colors without pulling the on-demand SVG renderers into the entry chunk. */
export function paletteColor(index: number): string {
  return PALETTE[index % PALETTE.length];
}
