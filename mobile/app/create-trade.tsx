import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Alert,
  Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import {
  shiftsApi,
  marketplaceApi,
  DayOfWeek,
  TimeSlot,
  TradePreferences,
} from '../src/services/api';
import { useActiveProfile } from '../src/stores/authStore';

/**
 * Create Trade Screen
 *
 * Select a shift to trade and set preferences for what you want in return.
 */

const DAYS_OF_WEEK: { value: DayOfWeek; label: string }[] = [
  { value: 'MONDAY', label: 'Monday' },
  { value: 'TUESDAY', label: 'Tuesday' },
  { value: 'WEDNESDAY', label: 'Wednesday' },
  { value: 'THURSDAY', label: 'Thursday' },
  { value: 'FRIDAY', label: 'Friday' },
  { value: 'SATURDAY', label: 'Saturday' },
  { value: 'SUNDAY', label: 'Sunday' },
];

const TIME_SLOTS: { value: TimeSlot; label: string; description: string }[] = [
  { value: 'MORNING', label: 'Morning', description: '6am - 12pm' },
  { value: 'AFTERNOON', label: 'Afternoon', description: '12pm - 5pm' },
  { value: 'EVENING', label: 'Evening', description: '5pm - 10pm' },
  { value: 'OVERNIGHT', label: 'Overnight', description: '10pm - 6am' },
];

interface MyShift {
  id: string;
  position: string;
  startTime: string;
  endTime: string;
  status: string;
  restaurant: {
    name: string;
  };
}

export default function CreateTradeScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const activeProfile = useActiveProfile();

  const [step, setStep] = useState<'select-shift' | 'set-preferences'>('select-shift');
  const [selectedShift, setSelectedShift] = useState<MyShift | null>(null);
  const [selectedDays, setSelectedDays] = useState<DayOfWeek[]>([]);
  const [selectedTimeSlots, setSelectedTimeSlots] = useState<TimeSlot[]>([]);
  const [flexibleOnDates, setFlexibleOnDates] = useState(true);
  const [notes, setNotes] = useState('');

  // Fetch my upcoming shifts that can be traded
  const { data: myShifts, isLoading: shiftsLoading } = useQuery({
    queryKey: ['my-tradeable-shifts', activeProfile?.restaurantId],
    queryFn: async () => {
      if (!activeProfile?.restaurantId) return [];
      const response = await shiftsApi.list(activeProfile.restaurantId, {
        status: ['CONFIRMED', 'PUBLISHED_CLAIMED'],
        startDate: new Date().toISOString(),
      });
      return response.data as MyShift[];
    },
    enabled: !!activeProfile?.restaurantId,
  });

  // Create trade offer mutation
  const createMutation = useMutation({
    mutationFn: async (data: { shiftId: string; preferences: TradePreferences }) => {
      const response = await marketplaceApi.createTradeOffer(
        data.shiftId,
        data.preferences,
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-trade-offers'] });
      queryClient.invalidateQueries({ queryKey: ['trade-offers'] });
      Alert.alert('Success', 'Your trade offer has been posted!', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    },
    onError: (error: any) => {
      Alert.alert(
        'Error',
        error?.response?.data?.message || 'Failed to create trade offer',
      );
    },
  });

  const toggleDay = (day: DayOfWeek) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  };

  const toggleTimeSlot = (slot: TimeSlot) => {
    setSelectedTimeSlots((prev) =>
      prev.includes(slot) ? prev.filter((s) => s !== slot) : [...prev, slot],
    );
  };

  const handleSelectShift = (shift: MyShift) => {
    setSelectedShift(shift);
    setStep('set-preferences');
  };

  const handleSubmit = () => {
    if (!selectedShift) return;

    const preferences: TradePreferences = {
      daysOfWeek: selectedDays.length > 0 ? selectedDays : undefined,
      timeSlots: selectedTimeSlots.length > 0 ? selectedTimeSlots : undefined,
      flexibleOnDates,
      notes: notes.trim() || undefined,
    };

    createMutation.mutate({
      shiftId: selectedShift.id,
      preferences,
    });
  };

  // Filter out shifts that are already being traded
  const tradeableShifts = (myShifts || []).filter(
    (shift) =>
      shift.status === 'CONFIRMED' || shift.status === 'PUBLISHED_CLAIMED',
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            if (step === 'set-preferences') {
              setStep('select-shift');
              setSelectedShift(null);
            } else {
              router.back();
            }
          }}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {step === 'select-shift' ? 'Select Shift to Trade' : 'Set Preferences'}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Progress */}
      <View style={styles.progress}>
        <View
          style={[
            styles.progressStep,
            step === 'select-shift' && styles.progressStepActive,
            step === 'set-preferences' && styles.progressStepComplete,
          ]}
        >
          <Text
            style={[
              styles.progressStepText,
              (step === 'select-shift' || step === 'set-preferences') &&
                styles.progressStepTextActive,
            ]}
          >
            1
          </Text>
        </View>
        <View
          style={[
            styles.progressLine,
            step === 'set-preferences' && styles.progressLineActive,
          ]}
        />
        <View
          style={[
            styles.progressStep,
            step === 'set-preferences' && styles.progressStepActive,
          ]}
        >
          <Text
            style={[
              styles.progressStepText,
              step === 'set-preferences' && styles.progressStepTextActive,
            ]}
          >
            2
          </Text>
        </View>
      </View>

      <ScrollView style={styles.content}>
        {step === 'select-shift' ? (
          <>
            <Text style={styles.sectionTitle}>Your Upcoming Shifts</Text>
            <Text style={styles.sectionSubtitle}>
              Select a shift you'd like to trade
            </Text>

            {shiftsLoading ? (
              <ActivityIndicator color="#4a90d9" style={{ marginTop: 40 }} />
            ) : tradeableShifts.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="calendar-outline" size={48} color="#666" />
                <Text style={styles.emptyTitle}>No shifts available</Text>
                <Text style={styles.emptySubtitle}>
                  You don't have any upcoming shifts to trade
                </Text>
              </View>
            ) : (
              tradeableShifts.map((shift) => (
                <TouchableOpacity
                  key={shift.id}
                  style={styles.shiftCard}
                  onPress={() => handleSelectShift(shift)}
                >
                  <View style={styles.shiftInfo}>
                    <Text style={styles.shiftPosition}>{shift.position}</Text>
                    <Text style={styles.shiftDate}>
                      {format(parseISO(shift.startTime), 'EEEE, MMMM d')}
                    </Text>
                    <Text style={styles.shiftTime}>
                      {format(parseISO(shift.startTime), 'h:mm a')} -{' '}
                      {format(parseISO(shift.endTime), 'h:mm a')}
                    </Text>
                    <Text style={styles.shiftRestaurant}>
                      {shift.restaurant.name}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#666" />
                </TouchableOpacity>
              ))
            )}
          </>
        ) : (
          <>
            {/* Selected Shift Summary */}
            {selectedShift && (
              <View style={styles.selectedShiftCard}>
                <View style={styles.selectedShiftHeader}>
                  <Text style={styles.selectedShiftLabel}>Trading:</Text>
                  <TouchableOpacity onPress={() => setStep('select-shift')}>
                    <Text style={styles.changeLink}>Change</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.selectedShiftPosition}>
                  {selectedShift.position}
                </Text>
                <Text style={styles.selectedShiftDate}>
                  {format(parseISO(selectedShift.startTime), 'EEEE, MMMM d')} |{' '}
                  {format(parseISO(selectedShift.startTime), 'h:mm a')} -{' '}
                  {format(parseISO(selectedShift.endTime), 'h:mm a')}
                </Text>
              </View>
            )}

            {/* Preferences */}
            <Text style={styles.sectionTitle}>What are you looking for?</Text>
            <Text style={styles.sectionSubtitle}>
              Set preferences to help find the right match
            </Text>

            {/* Day Preferences */}
            <View style={styles.preferenceSection}>
              <Text style={styles.preferenceLabel}>Preferred Days</Text>
              <Text style={styles.preferenceHint}>
                Select days you'd prefer to work instead
              </Text>
              <View style={styles.checkboxGrid}>
                {DAYS_OF_WEEK.map((day) => (
                  <TouchableOpacity
                    key={day.value}
                    style={[
                      styles.checkbox,
                      selectedDays.includes(day.value) && styles.checkboxActive,
                    ]}
                    onPress={() => toggleDay(day.value)}
                  >
                    <View
                      style={[
                        styles.checkboxBox,
                        selectedDays.includes(day.value) &&
                          styles.checkboxBoxActive,
                      ]}
                    >
                      {selectedDays.includes(day.value) && (
                        <Ionicons name="checkmark" size={14} color="#fff" />
                      )}
                    </View>
                    <Text
                      style={[
                        styles.checkboxLabel,
                        selectedDays.includes(day.value) &&
                          styles.checkboxLabelActive,
                      ]}
                    >
                      {day.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Time Slot Preferences */}
            <View style={styles.preferenceSection}>
              <Text style={styles.preferenceLabel}>Preferred Time Slots</Text>
              <Text style={styles.preferenceHint}>
                Select time slots that work for you
              </Text>
              <View style={styles.timeSlotGrid}>
                {TIME_SLOTS.map((slot) => (
                  <TouchableOpacity
                    key={slot.value}
                    style={[
                      styles.timeSlotCard,
                      selectedTimeSlots.includes(slot.value) &&
                        styles.timeSlotCardActive,
                    ]}
                    onPress={() => toggleTimeSlot(slot.value)}
                  >
                    <Text
                      style={[
                        styles.timeSlotLabel,
                        selectedTimeSlots.includes(slot.value) &&
                          styles.timeSlotLabelActive,
                      ]}
                    >
                      {slot.label}
                    </Text>
                    <Text
                      style={[
                        styles.timeSlotDesc,
                        selectedTimeSlots.includes(slot.value) &&
                          styles.timeSlotDescActive,
                      ]}
                    >
                      {slot.description}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Flexible Toggle */}
            <View style={styles.flexibleRow}>
              <View>
                <Text style={styles.flexibleLabel}>Flexible on Dates</Text>
                <Text style={styles.flexibleHint}>
                  Consider offers that don't match exactly
                </Text>
              </View>
              <Switch
                value={flexibleOnDates}
                onValueChange={setFlexibleOnDates}
                trackColor={{ false: '#2a2a4e', true: '#4a90d9' }}
                thumbColor={flexibleOnDates ? '#fff' : '#666'}
              />
            </View>

            {/* Notes */}
            <View style={styles.notesSection}>
              <Text style={styles.preferenceLabel}>Additional Notes</Text>
              <TextInput
                style={styles.notesInput}
                placeholder="Any specific requirements or details..."
                placeholderTextColor="#666"
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={3}
              />
            </View>

            {/* Submit Button */}
            <TouchableOpacity
              style={[
                styles.submitButton,
                createMutation.isPending && styles.submitButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="swap-horizontal" size={20} color="#fff" />
                  <Text style={styles.submitButtonText}>Post Trade Offer</Text>
                </>
              )}
            </TouchableOpacity>

            <Text style={styles.disclaimer}>
              Your offer will be visible to other workers. You can edit or cancel
              it anytime from the My Trades screen.
            </Text>
          </>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a4e',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  // Progress
  progress: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  progressStep: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2a2a4e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressStepActive: {
    backgroundColor: '#4a90d9',
  },
  progressStepComplete: {
    backgroundColor: '#22c55e',
  },
  progressStepText: {
    color: '#666',
    fontSize: 14,
    fontWeight: 'bold',
  },
  progressStepTextActive: {
    color: '#fff',
  },
  progressLine: {
    width: 60,
    height: 3,
    backgroundColor: '#2a2a4e',
    marginHorizontal: 8,
  },
  progressLineActive: {
    backgroundColor: '#4a90d9',
  },
  // Content
  content: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  sectionSubtitle: {
    color: '#666',
    fontSize: 14,
    marginBottom: 20,
  },
  // Shift Cards
  shiftCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  shiftInfo: {},
  shiftPosition: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  shiftDate: {
    color: '#4a90d9',
    fontSize: 14,
    marginBottom: 2,
  },
  shiftTime: {
    color: '#888',
    fontSize: 13,
    marginBottom: 4,
  },
  shiftRestaurant: {
    color: '#666',
    fontSize: 12,
  },
  // Selected Shift
  selectedShiftCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#4a90d950',
  },
  selectedShiftHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  selectedShiftLabel: {
    color: '#888',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  changeLink: {
    color: '#4a90d9',
    fontSize: 13,
    fontWeight: '500',
  },
  selectedShiftPosition: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  selectedShiftDate: {
    color: '#888',
    fontSize: 14,
  },
  // Preferences
  preferenceSection: {
    marginBottom: 24,
  },
  preferenceLabel: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  preferenceHint: {
    color: '#666',
    fontSize: 13,
    marginBottom: 12,
  },
  // Checkboxes
  checkboxGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  checkbox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 8,
  },
  checkboxActive: {
    backgroundColor: '#4a90d920',
  },
  checkboxBox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#666',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxBoxActive: {
    backgroundColor: '#4a90d9',
    borderColor: '#4a90d9',
  },
  checkboxLabel: {
    color: '#888',
    fontSize: 14,
  },
  checkboxLabelActive: {
    color: '#fff',
  },
  // Time Slots
  timeSlotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  timeSlotCard: {
    width: '48%',
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#2a2a4e',
  },
  timeSlotCardActive: {
    borderColor: '#4a90d9',
    backgroundColor: '#4a90d920',
  },
  timeSlotLabel: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  timeSlotLabelActive: {
    color: '#4a90d9',
  },
  timeSlotDesc: {
    color: '#666',
    fontSize: 12,
  },
  timeSlotDescActive: {
    color: '#888',
  },
  // Flexible Toggle
  flexibleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  flexibleLabel: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  flexibleHint: {
    color: '#666',
    fontSize: 12,
  },
  // Notes
  notesSection: {
    marginBottom: 24,
  },
  notesInput: {
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    padding: 16,
    color: '#fff',
    fontSize: 15,
    minHeight: 80,
    textAlignVertical: 'top',
    marginTop: 8,
  },
  // Submit
  submitButton: {
    backgroundColor: '#4a90d9',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  disclaimer: {
    color: '#666',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    color: '#666',
    fontSize: 14,
  },
  bottomSpacer: {
    height: 40,
  },
});
