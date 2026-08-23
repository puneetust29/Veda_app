import React from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { colors, spacing, typography } from '../../theme';
import type { HotelBooking } from '../../types';

interface HotelRecommendation {
  name: string;
  rating: number;
  price: number;
  location: string;
}

interface HotelBookingCardProps {
  hotel?: HotelBooking | null;
  suggestion: string;
  recommendations?: HotelRecommendation[] | null;
  onSearchHotels?: () => void;
}

export default function HotelBookingCard({
  hotel,
  suggestion,
  recommendations,
  onSearchHotels,
}: HotelBookingCardProps) {
  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.icon}>🏨</Text>
        <Text style={styles.title}>Hotel Booking</Text>
      </View>

      {hotel && hotel.found ? (
        <View style={styles.hotelFound}>
          <View style={styles.hotelDetails}>
            <Text style={styles.hotelName}>{hotel.hotel_name}</Text>
            {hotel.location && (
              <Text style={styles.hotelLocation}>📍 {hotel.location}</Text>
            )}
            <View style={styles.datesRow}>
              {hotel.check_in && (
                <Text style={styles.date}>
                  Check-in: {formatDate(hotel.check_in)}
                </Text>
              )}
              {hotel.check_out && (
                <Text style={styles.date}>
                  Check-out: {formatDate(hotel.check_out)}
                </Text>
              )}
            </View>
            {hotel.source && (
              <Text style={styles.source}>
                From: {hotel.source === 'calendar' ? '📅 Calendar' : '📧 Email'}
              </Text>
            )}
          </View>
        </View>
      ) : (
        <View style={styles.hotelNotFound}>
          <Text style={styles.suggestionText}>{suggestion}</Text>
          {recommendations && recommendations.length > 0 && (
            <View style={styles.recommendationsContainer}>
              <Text style={styles.recommendationsTitle}>Top Hotels</Text>
              {recommendations.slice(0, 3).map((rec, idx) => (
                <View key={idx} style={styles.hotelRecommendation}>
                  <View style={styles.hotelRecInfo}>
                    <Text style={styles.hotelRecName}>{rec.name}</Text>
                    <View style={styles.ratingRow}>
                      <Text style={styles.rating}>⭐ {rec.rating.toFixed(1)}</Text>
                      <Text style={styles.price}>${rec.price}/night</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
          {onSearchHotels && (
            <Pressable style={styles.searchButton} onPress={onSearchHotels}>
              <Text style={styles.searchButtonText}>Search Hotels</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.lg,
    marginVertical: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  icon: {
    fontSize: 20,
    marginRight: spacing.sm,
  },
  title: {
    ...typography.bodyBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  hotelFound: {
    backgroundColor: '#f0f7ff',
    borderRadius: 6,
    padding: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: '#4CAF50',
  },
  hotelDetails: {
    gap: spacing.xs,
  },
  hotelName: {
    ...typography.bodyBold,
    fontSize: 15,
    color: colors.textPrimary,
  },
  hotelLocation: {
    ...typography.body,
    fontSize: 13,
    color: colors.textSecondary,
  },
  datesRow: {
    gap: spacing.xs,
  },
  date: {
    ...typography.body,
    fontSize: 12,
    color: colors.textSecondary,
  },
  source: {
    ...typography.caption,
    fontSize: 11,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  hotelNotFound: {
    backgroundColor: '#fff8e1',
    borderRadius: 6,
    padding: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: '#FFC107',
  },
  suggestionText: {
    ...typography.body,
    fontSize: 13,
    color: colors.textPrimary,
    lineHeight: 18,
    marginBottom: spacing.md,
  },
  recommendationsContainer: {
    marginVertical: spacing.md,
    gap: spacing.sm,
  },
  recommendationsTitle: {
    ...typography.bodyBold,
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  hotelRecommendation: {
    backgroundColor: colors.background,
    borderRadius: 6,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hotelRecInfo: {
    gap: spacing.xs,
  },
  hotelRecName: {
    ...typography.body,
    fontSize: 12,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  ratingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rating: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  price: {
    ...typography.bodyBold,
    fontSize: 12,
    color: colors.brand,
  },
  searchButton: {
    backgroundColor: colors.brand,
    borderRadius: 6,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  searchButtonText: {
    ...typography.bodyBold,
    fontSize: 12,
    color: '#fff',
  },
});
