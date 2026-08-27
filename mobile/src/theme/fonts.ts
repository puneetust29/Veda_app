// Font families and weights for the app.
// Uses Urbanist for headlines and Inter for body text.
// These fonts are loaded via expo-google-fonts in the app entry point.

export const fonts = {
  // Urbanist: Display, headlines, bold accents
  urbanist: {
    regular: 'Urbanist_400Regular',
    medium: 'Urbanist_500Medium',
    bold: 'Urbanist_700Bold',
    extraBold: 'Urbanist_800ExtraBold',
  },

  // Inter: Body text, UI labels, captions
  inter: {
    light: 'Inter_300Light',
    regular: 'Inter_400Regular',
    medium: 'Inter_500Medium',
    semiBold: 'Inter_600SemiBold',
    bold: 'Inter_700Bold',
  },
};

// Font family mappings for consistent usage
export const fontFamily = {
  display: fonts.urbanist.extraBold,
  headline: fonts.urbanist.bold,
  title: fonts.urbanist.bold,
  sectionTitle: fonts.urbanist.bold,
  body: fonts.inter.regular,
  bodyBold: fonts.inter.semiBold,
  caption: fonts.inter.regular,
  small: fonts.inter.semiBold,
};
