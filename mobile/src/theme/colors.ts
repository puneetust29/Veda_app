// Central color palette. Pulled from the Figma "Veda: Design Prototype" file
// and the app's existing red/neutral accents — import from here instead of
// hardcoding hex values in screens/components so the palette stays in sync.
export const colors = {
  brand: '#c0392b',
  brandDark: '#a5311f',
  brandTint: '#fdf1f1',
  brandText: '#FF0000',
  brandBackGround: "#F00405",

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
  black: '#000000',

  overlay: 'rgba(0,0,0,0.28)',
  fieldFill: '#efefef',
  bubbleFill: '#FFF2F2',
  bannerGlow: '#e60000',

  badgeSparkle1: '#F79191',
  badgeSparkle2: '#FBBFBF',
  badgeSparkle3: '#FAB6B6',
  badgeSparkle4: '#FCD0D0',

  warningTint: '#fff4e5',
  warningText: '#8a4b00',
  backdrop: 'rgba(0,0,0,0.35)',
  ctaDisabledLight: '#d0d0d0',
  borderMuted: '#dedede',
  rowDivider: '#eaeaea',
  pillFillLight: '#e8e8e8',
  neutralFillLight: '#f3f3f3',

  accentRed: '#E8332B',
  pinkTile: '#FFEBEB',
  pinkBorder: '#FBC7C7',
  gradientBannerStart: '#E70001',
  gradientBannerEnd: '#970000',
  gradientCardStart: '#D5201F',
  gradientCardEnd: '#C81F1D',

  // Dashboard tokens pulled 1:1 from Figma node 1:35332 ("5 - Stability
  // Index Screen"). The design uses several distinct reds — keep them
  // separate rather than collapsing into `brand`.
  // Figma specifies #d5201f -> #c81f1d, which is imperceptible on device;
  // the end stop is deepened so the gradient actually reads.
  headerGradientStart: '#d5201f',
  headerGradientEnd: '#a81412',
  accentButton: '#e60000',
  accentCta: '#f00405',
  chipTint: '#fff4f4',
  badgeTint: '#fef1f1',
  cardFooter: '#f5f6fa',
  tileBorder: '#dedede',
  sourceBadgeBorder: '#7891ae',
  textConnect: '#6b7280',
  dotInactive: '#d9d9d9',
};
