/**
 * Computed-stability helper.
 *
 * Vue 3.4+ only re-triggers downstream effects when a computed's *value*
 * changes. But an object literal built fresh on every evaluation is always a
 * new reference, so the computed is considered "changed" every time — causing
 * needless re-renders on each poll even when the underlying data is identical.
 *
 * `keepStable(prev, next)` returns `prev` when it is shallow-equal to `next`,
 * letting the computed hand back the previous reference and skip the re-render.
 * Pass the computed's first argument (the previous value) as `prev`:
 *
 *   currentDownload(prev) {
 *     const next = { ...derived };
 *     return keepStable(prev, next);
 *   }
 *
 * See https://vuejs.org/guide/best-practices/performance.html#computed-stability
 */
export function keepStable(prev, next) {
  if (prev === next) return next;
  if (
    !prev ||
    !next ||
    typeof prev !== "object" ||
    typeof next !== "object"
  ) {
    return next;
  }

  const prevKeys = Object.keys(prev);
  const nextKeys = Object.keys(next);
  if (prevKeys.length !== nextKeys.length) return next;

  for (const key of nextKeys) {
    if (prev[key] !== next[key]) return next;
  }

  return prev;
}
