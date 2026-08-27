// Converts a theme hex color to an rgba() string at the given alpha, so
// translucent overlays reference the same palette entry as their solid form
// instead of hardcoding a separate rgba literal.
export function withOpacity(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  const full = normalized.length === 3
    ? normalized.split('').map((c) => c + c).join('')
    : normalized;
  const value = parseInt(full, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
