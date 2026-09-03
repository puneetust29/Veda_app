import { Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '../../theme';

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
      <SafeAreaView style={styles.overlay} edges={['bottom']}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>Select Pickup Location</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.currentLocationButton}
            onPress={onUseCurrentLocation}
          >
            <Ionicons name="navigate" size={20} color={colors.white} />
            <Text style={styles.currentLocationButtonText}>Use Current Location</Text>
          </TouchableOpacity>

          {permissionError && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{permissionError}</Text>
            </View>
          )}

          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search pickup location…"
              placeholderTextColor="#999"
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
            <ScrollView style={styles.predictionsList}>
              {predictions.map((pred) => (
                <TouchableOpacity
                  key={pred.place_id}
                  style={styles.predictionItem}
                  onPress={() => onPredictionSelect(pred.description)}
                >
                  <Ionicons name="location" size={18} color={colors.brand} />
                  <Text style={styles.predictionText}>{pred.description}</Text>
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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modal: {
    flex: 1,
    backgroundColor: colors.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    marginTop: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  closeButton: {
    padding: spacing.md,
    marginRight: -spacing.md,
  },
  currentLocationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    backgroundColor: colors.brand,
    borderRadius: 8,
    gap: spacing.md,
  },
  currentLocationButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  errorContainer: {
    marginHorizontal: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: '#fff3f3',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ffcccc',
  },
  errorText: {
    color: colors.brand,
    fontSize: 13,
    lineHeight: 18,
  },
  searchContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 14,
    backgroundColor: '#f9f9f9',
  },
  searchSpinner: {
    marginLeft: spacing.md,
  },
  predictionsList: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  predictionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    gap: spacing.md,
  },
  predictionText: {
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
  },
});
