import { StyleSheet, Text, TouchableOpacity, View, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '../../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  onNewSession: () => void;
};

export default function ChatHistorySidebar({ visible, onClose, onNewSession }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.sidebarContainer}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>History</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {/* Divider */}
          <View style={styles.divider} />

          {/* New Session Button */}
          <TouchableOpacity style={styles.newSessionButton} onPress={onNewSession}>
            <View style={styles.newSessionIcon}>
              <Ionicons name="add" size={20} color={colors.brand} />
            </View>
            <Text style={styles.newSessionText}>New session</Text>
          </TouchableOpacity>

          {/* Sessions List */}
          <ScrollView style={styles.sessionsList} contentContainerStyle={styles.sessionsContent}>
            <Text style={styles.emptySessions}>No previous sessions</Text>
          </ScrollView>
        </View>

        {/* Close overlay on tap outside */}
        <TouchableOpacity style={styles.closeOverlay} onPress={onClose} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    flexDirection: 'row',
  },
  sidebarContainer: {
    width: '70%',
    backgroundColor: 'white',
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    height: '100%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    ...typography.sectionTitle,
    color: colors.textPrimary,
    fontSize: 20,
  },
  divider: {
    height: 1,
    backgroundColor: colors.textSecondary,
    opacity: 0.2,
    marginBottom: spacing.lg,
  },
  newSessionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  newSessionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.brandTint,
    justifyContent: 'center',
    alignItems: 'center',
  },
  newSessionText: {
    ...typography.bodyBold,
    color: colors.brand,
    fontSize: 16,
  },
  sessionsList: {
    flex: 1,
    marginTop: spacing.lg,
  },
  sessionsContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptySessions: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  closeOverlay: {
    flex: 1,
  },
});
