/**
 * Build an asset URL that respects Vite's `base` config — so paths
 * resolve correctly both in `npm run dev` (base='/') and in production
 * GitHub Pages deploys (base='/NYC-public-art/').
 */
export function asset(path: string): string {
  const base = import.meta.env.BASE_URL || '/';
  return base.replace(/\/$/, '') + '/' + path.replace(/^\//, '');
}
