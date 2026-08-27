import {
  Dimensions,
  Image,
  ImageSourcePropType,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SvgXml } from 'react-native-svg';

import { colors, fonts, spacing } from '../../theme';
import { shuffle as shuffleXml, tileArrow } from './figmaSvgs';

export type ConnectAppIcon = {
  source: ImageSourcePropType;
  /** Render the logo small inside a bordered white circle (Figma meetings
   * tile) instead of filling the circle (groceries/food tiles). */
  inset?: boolean;
};

export type Suggestion = {
  id: string;
  /** SVG markup for the tile icon (see dashboard/figmaSvgs). */
  iconXml: string;
  label: string;
  /** App logos shown next to a "Connect apps" label (integrations not
   * wired up yet). */
  connectAppIcons?: ConnectAppIcon[];
  onPress?: () => void;
};

type Props = {
  suggestions: Suggestion[];
  onShuffle?: () => void;
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
// Figma: 173px tiles with a 20px gutter on a 414px frame (24px margins).
const TILE_WIDTH = (SCREEN_WIDTH - spacing.xxl * 2 - 20) / 2;

// Static 2-column grid of "Things you can ask me" prompt tiles, styled 1:1
// against Figma node 1:35509: 110px bordered 20px-radius tiles with a soft
// red icon box top-left, optional "Connect apps" label with overlapping app
// logos, and a label + red arrow bottom row.
export default function SuggestionGrid({ suggestions, onShuffle }: Props) {
  return (
    <View>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Things you can ask me</Text>
        <TouchableOpacity onPress={onShuffle} disabled={!onShuffle} hitSlop={8}>
          <SvgXml xml={shuffleXml} width={24} height={24} />
        </TouchableOpacity>
      </View>

      <View style={styles.grid}>
        {suggestions.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.tile}
            onPress={item.onPress}
            activeOpacity={0.7}
          >
            <View style={styles.tileTop}>
              <View style={styles.iconBox}>
                <SvgXml xml={item.iconXml} width={20} height={20} />
              </View>
              {item.connectAppIcons ? (
                <View style={styles.connectRow}>
                  <Text style={styles.connectLabel}>Connect apps</Text>
                  <View style={styles.connectIcons}>
                    {item.connectAppIcons.map((icon, index) => (
                      <View
                        key={index}
                        style={[
                          styles.connectIconCircle,
                          icon.inset && styles.connectIconCircleBordered,
                          index > 0 && styles.connectIconOverlap,
                        ]}
                      >
                        <Image
                          source={icon.source}
                          style={icon.inset ? styles.connectIconInset : styles.connectIconFull}
                          resizeMode={icon.inset ? 'contain' : 'cover'}
                        />
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}
            </View>
            <View style={styles.tileBottom}>
              <Text style={styles.tileLabel} numberOfLines={2}>
                {item.label}
              </Text>
              <SvgXml xml={tileArrow} width={20} height={20} />
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: spacing.xxl,
    marginTop: spacing.xxxl,
  },
  sectionTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 20,
    lineHeight: 22,
    letterSpacing: -0.4,
    color: colors.textPrimary,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.xxl,
    marginTop: spacing.xxxl,
    gap: 20,
  },
  tile: {
    width: TILE_WIDTH,
    height: 110,
    borderWidth: 1,
    borderColor: colors.tileBorder,
    borderRadius: 20,
    backgroundColor: colors.white,
    padding: spacing.md,
    justifyContent: 'space-between',
  },
  tileTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.badgeTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  connectLabel: {
    fontFamily: fonts.medium,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textConnect,
    flexShrink: 1,
  },
  connectIcons: { flexDirection: 'row' },
  connectIconCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  connectIconCircleBordered: {
    borderWidth: 0.6,
    borderColor: '#e4e4e4',
  },
  connectIconOverlap: { marginLeft: -10 },
  connectIconInset: { width: 10, height: 10 },
  connectIconFull: { width: 20, height: 20 },
  tileBottom: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  tileLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 15,
    lineHeight: 18,
    color: colors.textPrimary,
    flexShrink: 1,
    marginRight: spacing.sm,
  },
});
