import type { TextStyle } from 'react-native';

import { fontFamily } from './fonts';

// Named text styles matching the weights/sizes used throughout the app and
// the Figma design (greeting headline, section titles, card copy, etc.).
// Uses Urbanist for headlines/bold accents and Inter for body/labels.
export const typography: Record<string, TextStyle> = {
  // Brand wordmark scale — the landing screen's "veda" lockup.
  display: { fontSize: 34, fontWeight: '800', fontFamily: fontFamily.display, letterSpacing: -0.5 },
  headline: { fontSize: 28, fontWeight: '700', fontFamily: fontFamily.headline },
  title: { fontSize: 24, fontWeight: '700', fontFamily: fontFamily.title },
  sectionTitle: { fontSize: 18, fontWeight: '700', fontFamily: fontFamily.sectionTitle },
  body: { fontSize: 15, fontWeight: '400', fontFamily: fontFamily.body },
  bodyBold: { fontSize: 15, fontWeight: '600', fontFamily: fontFamily.bodyBold },
  caption: { fontSize: 13, fontWeight: '400', fontFamily: fontFamily.caption },
  small: { fontSize: 12, fontWeight: '600', fontFamily: fontFamily.small },
};
