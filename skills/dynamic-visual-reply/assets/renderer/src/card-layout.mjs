// Keep CSS tracks and placement estimates on the same layout rules.
export const cardLayout = spec => !spec.layout || spec.layout === 'auto'
  ? spec.readOnly ? 'grid' : 'stack' : spec.layout;
export const cardTracks = spec => cardLayout(spec) === 'stack' ? 'minmax(0,1fr)'
  : 'repeat(auto-fit,minmax(min(100%,var(--vr-card-min)),1fr))';
export function cardColumns(spec, width, minWidth, gap = 8) {
  return cardLayout(spec) === 'stack' ? 1
    : Math.max(1, Math.min(spec.rows?.length || 1, Math.floor((width + gap) / (minWidth + gap))));
}
