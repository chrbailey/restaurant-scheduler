import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { format, startOfWeek, addDays, isSameDay, parseISO } from 'date-fns';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { shiftsApi } from '../../src/services/api';
import { useActiveProfile, useAuthStore } from '../../src/stores/authStore';
import { useGhostKitchen } from '../../src/hooks/useGhostKitchen';
import GhostKitchenBanner from '../../src/components/GhostKitchenBanner';

interface Shift {
  id: string;
  position: string;
  status: string;
  startTime: string;
  endTime: string;
  isGhostKitchen?: boolean;
  restaurant: {
    name: string;
    timezone: string;
  };
}

export default function ScheduleScreen() {
  const activeProfile = useActiveProfile();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 0 });

  // Ghost kitchen state
  const { isGhostModeActive } = useGhostKitchen();
  const hasDeliveryPosition = activeProfile?.positions?.includes('DELIVERY_PACK') ?? false;

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['schedule', activeProfile?.restaurantId, weekStart.toISOString()],
    queryFn: async () => {
      if (!activeProfile?.restaurantId) return {};
      const response = await shiftsApi.getWeek(
        activeProfile.restaurantId,
        weekStart.toISOString(),
        true,
      );
      return response.data;
    },
    enabled: !!activeProfile?.restaurantId,
  });

  const shifts = data || {};

  const getShiftsForDay = (date: Date): Shift[] => {
    const dateKey = format(date, 'yyyy-MM-dd');
    const dayShifts = shifts[dateKey] || [];
    // Filter to only show shifts assigned to current user
    return dayShifts.filter(
      (s: Shift) =>
        s.status === 'CONFIRMED' || s.status === 'IN_PROGRESS' || s.status === 'PUBLISHED_CLAIMED',
    );
  };

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  if (!activeProfile) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No restaurant selected</Text>
        <Text style={styles.emptySubtext}>
          Ask your manager to add you to a restaurant
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Week selector */}
      <View style={styles.weekSelector}>
        <TouchableOpacity
          onPress={() => setSelectedDate(addDays(selectedDate, -7))}
          style={styles.weekNav}
        >
          <Text style={styles.weekNavText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.weekTitle}>
          {format(weekStart, 'MMM d')} - {format(addDays(weekStart, 6), 'MMM d, yyyy')}
        </Text>
        <TouchableOpacity
          onPress={() => setSelectedDate(addDays(selectedDate, 7))}
          style={styles.weekNav}
        >
          <Text style={styles.weekNavText}>→</Text>
        </TouchableOpacity>
      </View>

      {/* Day tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.dayTabs}
      >
        {weekDays.map((day) => {
          const isSelected = isSameDay(day, selectedDate);
          const isToday = isSameDay(day, new Date());
          const dayShifts = getShiftsForDay(day);

          return (
            <TouchableOpacity
              key={day.toISOString()}
              style={[styles.dayTab, isSelected && styles.dayTabSelected]}
              onPress={() => setSelectedDate(day)}
            >
              <Text
                style={[styles.dayName, isSelected && styles.dayNameSelected]}
              >
                {format(day, 'EEE')}
              </Text>
              <Text
                style={[
                  styles.dayNumber,
                  isSelected && styles.dayNumberSelected,
                  isToday && styles.dayNumberToday,
                ]}
              >
                {format(day, 'd')}
              </Text>
              {dayShifts.length > 0 && (
                <View style={styles.shiftDot} />
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Shifts list */}
      <ScrollView
        style={styles.shiftsList}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => refetch()}
            tintColor="#4a90d9"
          />
        }
      >
        {isLoading ? (
          <ActivityIndicator color="#4a90d9" style={{ marginTop: 40 }} />
        ) : getShiftsForDay(selectedDate).length === 0 ? (
          <View style={styles.noShifts}>
            <Text style={styles.noShiftsText}>No shifts scheduled</Text>
            <Text style={styles.noShiftsSubtext}>
              Check Open Shifts to pick up available shifts
            </Text>
          </View>
        ) : (
          getShiftsForDay(selectedDate).map((shift) => (
            <ShiftCard key={shift.id} shift={shift} />
          ))
        )}
      </ScrollView>
    </View>
  );
}

function ShiftCard({ shift }: { shift: Shift }) {
  const startTime = parseISO(shift.startTime);
  const endTime = parseISO(shift.endTime);
  const duration = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'IN_PROGRESS':
        return '#22c55e';
      case 'CONFIRMED':
        return '#4a90d9';
      case 'PUBLISHED_CLAIMED':
        return '#f59e0b';
      default:
        return '#666';
    }
  };

  return (
    <TouchableOpacity style={styles.shiftCard}>
      <View style={styles.shiftTime}>
        <Text style={styles.shiftTimeText}>{format(startTime, 'h:mm a')}</Text>
        <Text style={styles.shiftTimeDivider}>|</Text>
        <Text style={styles.shiftTimeText}>{format(endTime, 'h:mm a')}</Text>
      </View>

      <View style={styles.shiftInfo}>
        <Text style={styles.shiftPosition}>{shift.position}</Text>
        <Text style={styles.shiftRestaurant}>{shift.restaurant.name}</Text>
        <Text style={styles.shiftDuration}>{duration.toFixed(1)}h shift</Text>
      </View>

      <View
        style={[
          styles.statusIndicator,
          { backgroundColor: getStatusColor(shift.status) },
        ]}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
  emptyContainer: {
    flex: 1,
    backgroundColor: '#0f0f23',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  emptySubtext: {
    color: '#666',
    fontSize: 16,
    textAlign: 'center',
  },
  weekSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a4e',
  },
  weekNav: {
    padding: 8,
  },
  weekNavText: {
    color: '#4a90d9',
    fontSize: 24,
  },
  weekTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  dayTabs: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a4e',
  },
  dayTab: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginHorizontal: 4,
    borderRadius: 12,
  },
  dayTabSelected: {
    backgroundColor: '#4a90d9',
  },
  dayName: {
    color: '#666',
    fontSize: 12,
    marginBottom: 4,
  },
  dayNameSelected: {
    color: '#fff',
  },
  dayNumber: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  dayNumberSelected: {
    color: '#fff',
  },
  dayNumberToday: {
    color: '#4a90d9',
  },
  shiftDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4a90d9',
    marginTop: 4,
  },
  shiftsList: {
    flex: 1,
    padding: 16,
  },
  noShifts: {
    alignItems: 'center',
    marginTop: 60,
  },
  noShiftsText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  noShiftsSubtext: {
    color: '#666',
    fontSize: 14,
  },
  shiftCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 4,
    borderLeftColor: '#4a90d9',
  },
  shiftTime: {
    marginRight: 16,
  },
  shiftTimeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  shiftTimeDivider: {
    color: '#666',
    fontSize: 12,
    marginVertical: 2,
  },
  shiftInfo: {
    flex: 1,
  },
  shiftPosition: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  shiftRestaurant: {
    color: '#888',
    fontSize: 14,
    marginBottom: 2,
  },
  shiftDuration: {
    color: '#666',
    fontSize: 12,
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
});
