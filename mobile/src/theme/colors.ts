// Central color palette. Pulled from the Figma "Veda: Design Prototype" file
// and the app's existing red/neutral accents — import from here instead of
// hardcoding hex values in screens/components so the palette stays in sync.
export const colors = {
  brand: '#c0392b',
  brandDark: '#a5311f',
  brandTint: '#fdf1f1',

  success: '#2e9e4f',
  successTint: '#eaf7ee',

  background: '#ffffff',
  surface: '#fafafa',
  border: '#eeeeee',

  textPrimary: '#111111',
  textSecondary: '#444444',
  textMuted: '#888888',
  textDisabled: '#bbbbbb',

  link: '#0a66c2',
  white: '#ffffff',

  // Dashboard tokens pulled 1:1 from Figma node 1:35332 ("5 - Stability
  // Index Screen"). The design uses several distinct reds — keep them
  // separate rather than collapsing into `brand`.
  // Figma specifies #d5201f -> #c81f1d, which is imperceptible on device;
  // the end stop is deepened so the gradient actually reads.
  headerGradientStart: '#d5201f',
  headerGradientEnd: '#a81412',
  accentButton: '#e60000', // card "Review recommendation" arrow square
  accentCta: '#f00405', // "Tap to ask Vinto" CTA + active pagination dot
  chipTint: '#fff4f4', // Travel Insurance / Roaming chips
  badgeTint: '#fef1f1', // count badge + suggestion tile icon boxes
  cardFooter: '#f5f6fa', // card bottom action bar
  tileBorder: '#dedede',
  sourceBadgeBorder: '#7891ae',
  textConnect: '#6b7280', // "Connect apps" label
  dotInactive: '#d9d9d9',
};
