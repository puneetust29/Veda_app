import type { TextStyle } from 'react-native';

// Named text styles matching the weights/sizes used throughout the app and
// the Figma design (greeting headline, section titles, card copy, etc.).
export const typography: Record<string, TextStyle> = {
  headline: { fontSize: 28, fontWeight: '700' },
  title: { fontSize: 24, fontWeight: '700' },
  sectionTitle: { fontSize: 18, fontWeight: '700' },
  body: { fontSize: 15, fontWeight: '400' },
  bodyBold: { fontSize: 15, fontWeight: '600' },
  caption: { fontSize: 13, fontWeight: '400' },
  small: { fontSize: 12, fontWeight: '600' },
};
