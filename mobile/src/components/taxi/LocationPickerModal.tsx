import { Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radii, typography } from '../../theme';

type Prediction = { place_id: string; description: string };

type Props = {
  visible: boolean;
  onClose: () => void;
  onUseCurrentLocation: () => void;
  permissionError: string;
  searchInput: string;
  onSearchChange: (text: string) => void;
  predictions: Prediction[];
  loading: boolean;
  onPredictionSelect: (description: string) => void;
};

export default function LocationPickerModal({
  visible,
  onClose,
  onUseCurrentLocation,
  permissionError,
  searchInput,
  onSearchChange,
  predictions,
  loading,
  onPredictionSelect,
}: Props) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.overlay} edges={['top', 'bottom']}>
        <View style={styles.modal}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <Text style={styles.title}>Select Pickup Location</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton} hitSlop={6}>
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.currentLocationButton}
            onPress={onUseCurrentLocation}
            activeOpacity={0.85}
          >
            <View style={styles.currentLocationIcon}>
              <Ionicons name="navigate" size={16} color={colors.white} />
            </View>
            <Text style={styles.currentLocationButtonText}>Use Current Location</Text>
          </TouchableOpacity>

          {permissionError ? (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={16} color={colors.brand} />
              <Text style={styles.errorText}>{permissionError}</Text>
            </View>
          ) : null}

          <View style={styles.searchContainer}>
            <Ionicons name="search" size={18} color={colors.textMuted} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search pickup location…"
              placeholderTextColor={colors.textMuted}
              value={searchInput}
              onChangeText={onSearchChange}
            />
            {loading && (
              <ActivityIndicator
                color={colors.brand}
                size="small"
                style={styles.searchSpinner}
              />
            )}
          </View>

          {predictions.length > 0 && (
            <ScrollView
              style={styles.predictionsList}
              contentContainerStyle={styles.predictionsContent}
              keyboardShouldPersistTaps="handled"
            >
              {predictions.map((pred) => (
                <TouchableOpacity
                  key={pred.place_id}
                  style={styles.predictionItem}
                  onPress={() => onPredictionSelect(pred.description)}
                  activeOpacity={0.7}
                >
                  <View style={styles.predictionIcon}>
                    <Ionicons name="location" size={16} color={colors.brand} />
                  </View>
                  <Text style={styles.predictionText} numberOfLines={2}>{pred.description}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.backdrop,
  },
  modal: {
    flex: 1,
    backgroundColor: colors.background,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    marginTop: spacing.xxl,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.border,
    marginTop: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    ...typography.sectionTitle,
    fontSize: 17,
    color: colors.textPrimary,
  },
  closeButton: {
    padding: spacing.sm,
    marginRight: -spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
  },
  currentLocationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.brand,
    borderRadius: radii.md,
    gap: spacing.md,
    shadowColor: colors.brand,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  currentLocationIcon: {
    width: 28,
    height: 28,
    borderRadius: radii.sm,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  currentLocationButtonText: {
    ...typography.bodyBold,
    color: colors.white,
    fontSize: 14,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.brandTint,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.pinkBorder,
  },
  errorText: {
    ...typography.caption,
    flex: 1,
    color: colors.brand,
    lineHeight: 18,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    paddingVertical: spacing.md,
    ...typography.body,
    fontSize: 14,
    color: colors.textPrimary,
  },
  searchSpinner: {
    marginLeft: spacing.sm,
  },
  predictionsList: {
    flex: 1,
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  predictionsContent: {
    gap: spacing.sm,
    paddingBottom: spacing.lg,
  },
  predictionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  predictionIcon: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    backgroundColor: colors.badgeTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  predictionText: {
    ...typography.body,
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
  },
});
