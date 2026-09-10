import type { TextStyle } from 'react-native';

// Font families loaded in App.tsx (expo-font + @expo-google-fonts). The
// Figma design sets headings/labels in Urbanist and body copy in Inter.
export const fonts = {
  regular: 'Urbanist_400Regular',
  medium: 'Urbanist_500Medium',
  semiBold: 'Urbanist_600SemiBold',
  bold: 'Urbanist_700Bold',
  bodyLight: 'Inter_300Light',
  body: 'Inter_400Regular',
};

// Named text styles matching the weights/sizes used throughout the app and
// the Figma design (greeting headline, section titles, card copy, etc.).
// Uses Urbanist for headlines/bold accents and Inter for body/labels.
export const typography: Record<string, TextStyle> = {
  display: { fontSize: 42, fontFamily: fonts.bold, lineHeight: 52 },
  headline: { fontSize: 28, fontWeight: '700', fontFamily: fonts.bold, lineHeight: 36 },
  title: { fontSize: 24, fontWeight: '700', fontFamily: fonts.bold, lineHeight: 32 },
  sectionTitle: { fontSize: 18, fontWeight: '700', fontFamily: fonts.bold, lineHeight: 24 },
  body: { fontSize: 15, fontWeight: '400', fontFamily: fonts.body, lineHeight: 22 },
  bodyBold: { fontSize: 15, fontWeight: '600', fontFamily: fonts.semiBold, lineHeight: 22 },
  caption: { fontSize: 13, fontWeight: '400', fontFamily: fonts.body, lineHeight: 19 },
  small: { fontSize: 12, fontWeight: '600', fontFamily: fonts.semiBold, lineHeight: 16 },
};
