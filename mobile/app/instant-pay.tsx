import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import RNSlider from '@react-native-community/slider';
import { ComponentType } from 'react';
import { paymentsApi } from '../src/services/api';
import { useActiveProfile } from '../src/stores/authStore';

// Cast to bypass React 19 type compatibility issues
const Slider = RNSlider as ComponentType<any>;

/**
 * Instant Pay Screen
 *
 * Allows workers to transfer earned wages instantly.
 * Shows amount selector, fee calculation, and confirmation flow.
 */

type ScreenState = 'select' | 'confirm' | 'processing' | 'success' | 'error';

export default function InstantPayScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const activeProfile = useActiveProfile();

  const [screenState, setScreenState] = useState<ScreenState>('select');
  const [amount, setAmount] = useState(0);
  const [inputAmount, setInputAmount] = useState('');
  const [useSlider, setUseSlider] = useState(true);
  const [transferResult, setTransferResult] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState('');

  // Animation for success
  const [successAnim] = useState(new Animated.Value(0));

  // Fetch earned balance
  const { data: balance, isLoading: balanceLoading } = useQuery({
    queryKey: ['earned-balance'],
    queryFn: async () => {
      const response = await paymentsApi.getEarnedBalance();
      return response.data;
    },
    enabled: !!activeProfile,
  });

  // Fetch enrollment status
  const { data: enrollment, isLoading: enrollmentLoading } = useQuery({
    queryKey: ['instant-pay-enrollment'],
    queryFn: async () => {
      const response = await paymentsApi.getEnrollmentStatus();
      return response.data;
    },
    enabled: !!activeProfile,
  });

  // Transfer mutation
  const transferMutation = useMutation({
    mutationFn: async (transferAmount: number) => {
      const response = await paymentsApi.requestTransfer(transferAmount);
      return response.data;
    },
    onSuccess: (data) => {
      setTransferResult(data);
      setScreenState('success');
      // Animate success
      Animated.spring(successAnim, {
        toValue: 1,
        useNativeDriver: true,
        friction: 5,
      }).start();
      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['earned-balance'] });
      queryClient.invalidateQueries({ queryKey: ['transfer-history'] });
    },
    onError: (error: any) => {
      setErrorMessage(
        error?.response?.data?.message ||
          'Transfer failed. Please try again.',
      );
      setScreenState('error');
    },
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: balance?.currency || 'USD',
    }).format(value);
  };

  const availableAmount = balance?.available || 0;
  const minTransfer = enrollment?.feeStructure?.minTransfer || 1;
  const maxTransfer = Math.min(
    enrollment?.feeStructure?.maxTransfer || availableAmount,
    availableAmount,
  );

  // Calculate fee
  const calculateFee = (transferAmount: number) => {
    if (!enrollment?.feeStructure) return 0;
    const { flatFee, percentFee } = enrollment.feeStructure;
    return flatFee + (transferAmount * percentFee) / 100;
  };

  const fee = calculateFee(amount);
  const netAmount = amount - fee;

  // Handle slider change
  const handleSliderChange = (value: number) => {
    const roundedValue = Math.round(value * 100) / 100;
    setAmount(roundedValue);
    setInputAmount(roundedValue.toFixed(2));
  };

  // Handle text input change
  const handleInputChange = (text: string) => {
    // Only allow numbers and decimal
    const cleaned = text.replace(/[^0-9.]/g, '');
    setInputAmount(cleaned);
    const parsed = parseFloat(cleaned);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= availableAmount) {
      setAmount(parsed);
    }
  };

  // Handle max button
  const handleMaxPress = () => {
    setAmount(availableAmount);
    setInputAmount(availableAmount.toFixed(2));
  };

  // Confirm transfer
  const handleConfirmTransfer = () => {
    setScreenState('processing');
    transferMutation.mutate(amount);
  };

  // Reset and go back
  const handleDone = () => {
    router.back();
  };

  // Retry after error
  const handleRetry = () => {
    setScreenState('select');
    setErrorMessage('');
  };

  const isLoading = balanceLoading || enrollmentLoading;

  // Not enrolled - show enrollment prompt
  if (!enrollmentLoading && enrollment && !enrollment.isEnrolled) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Instant Pay</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.enrollPrompt}>
          <View style={styles.enrollIcon}>
            <MaterialCommunityIcons
              name="lightning-bolt"
              size={64}
              color="#f59e0b"
            />
          </View>
          <Text style={styles.enrollTitle}>Get Paid Instantly</Text>
          <Text style={styles.enrollDescription}>
            Access your earned wages before payday. Transfer funds directly to
            your bank account or debit card.
          </Text>

          <View style={styles.enrollBenefits}>
            <View style={styles.benefitRow}>
              <Ionicons name="checkmark-circle" size={20} color="#22c55e" />
              <Text style={styles.benefitText}>
                Access up to 100% of earned wages
              </Text>
            </View>
            <View style={styles.benefitRow}>
              <Ionicons name="checkmark-circle" size={20} color="#22c55e" />
              <Text style={styles.benefitText}>
                Funds arrive within minutes
              </Text>
            </View>
            <View style={styles.benefitRow}>
              <Ionicons name="checkmark-circle" size={20} color="#22c55e" />
              <Text style={styles.benefitText}>
                Simple, transparent fees
              </Text>
            </View>
          </View>

          <TouchableOpacity style={styles.enrollButton} onPress={() => {}}>
            <Text style={styles.enrollButtonText}>Set Up Instant Pay</Text>
          </TouchableOpacity>

          <Text style={styles.enrollDisclaimer}>
            Powered by DailyPay. Standard fees apply.
          </Text>
        </View>
      </View>
    );
  }

  // Success screen
  if (screenState === 'success') {
    return (
      <View style={styles.container}>
        <View style={styles.resultContainer}>
          <Animated.View
            style={[
              styles.successCircle,
              {
                transform: [
                  {
                    scale: successAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.5, 1],
                    }),
                  },
                ],
                opacity: successAnim,
              },
            ]}
          >
            <Ionicons name="checkmark" size={64} color="#22c55e" />
          </Animated.View>

          <Text style={styles.resultTitle}>Transfer Initiated!</Text>
          <Text style={styles.resultAmount}>
            {formatCurrency(transferResult?.netAmount || netAmount)}
          </Text>
          <Text style={styles.resultSubtitle}>on the way to your account</Text>

          <View style={styles.resultDetails}>
            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>Transfer Amount</Text>
              <Text style={styles.resultValue}>{formatCurrency(amount)}</Text>
            </View>
            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>Fee</Text>
              <Text style={styles.resultValue}>{formatCurrency(fee)}</Text>
            </View>
            <View style={styles.resultDivider} />
            <View style={styles.resultRow}>
              <Text style={styles.resultLabelBold}>You Receive</Text>
              <Text style={styles.resultValueBold}>
                {formatCurrency(transferResult?.netAmount || netAmount)}
              </Text>
            </View>
          </View>

          <View style={styles.destinationInfo}>
            <Ionicons name="card-outline" size={20} color="#888" />
            <Text style={styles.destinationText}>
              {enrollment?.paymentMethod?.bankName || 'Card'} ****
              {enrollment?.paymentMethod?.last4}
            </Text>
          </View>

          <Text style={styles.arrivalTime}>
            Expected arrival: Within 30 minutes
          </Text>

          <TouchableOpacity style={styles.doneButton} onPress={handleDone}>
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.viewHistoryLink}
            onPress={() => router.replace('/transfer-history')}
          >
            <Text style={styles.viewHistoryText}>View Transfer History</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Error screen
  if (screenState === 'error') {
    return (
      <View style={styles.container}>
        <View style={styles.resultContainer}>
          <View style={styles.errorCircle}>
            <Ionicons name="close" size={64} color="#ef4444" />
          </View>

          <Text style={styles.resultTitle}>Transfer Failed</Text>
          <Text style={styles.errorMessage}>{errorMessage}</Text>

          <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelLink}
            onPress={() => router.back()}
          >
            <Text style={styles.cancelLinkText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Processing screen
  if (screenState === 'processing') {
    return (
      <View style={styles.container}>
        <View style={styles.resultContainer}>
          <ActivityIndicator size="large" color="#4a90d9" />
          <Text style={styles.processingText}>Processing your transfer...</Text>
          <Text style={styles.processingSubtext}>This may take a moment</Text>
        </View>
      </View>
    );
  }

  // Confirm screen
  if (screenState === 'confirm') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setScreenState('select')}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Confirm Transfer</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.confirmContainer}>
          <Text style={styles.confirmLabel}>You're transferring</Text>
          <Text style={styles.confirmAmount}>{formatCurrency(amount)}</Text>

          <View style={styles.confirmDetails}>
            <View style={styles.confirmRow}>
              <Text style={styles.confirmRowLabel}>Transfer Amount</Text>
              <Text style={styles.confirmRowValue}>{formatCurrency(amount)}</Text>
            </View>
            <View style={styles.confirmRow}>
              <Text style={styles.confirmRowLabel}>Fee</Text>
              <Text style={styles.confirmRowValue}>-{formatCurrency(fee)}</Text>
            </View>
            <View style={styles.confirmDivider} />
            <View style={styles.confirmRow}>
              <Text style={styles.confirmRowLabelBold}>You'll Receive</Text>
              <Text style={styles.confirmRowValueBold}>
                {formatCurrency(netAmount)}
              </Text>
            </View>
          </View>

          <View style={styles.destinationCard}>
            <Ionicons name="card-outline" size={24} color="#4a90d9" />
            <View style={styles.destinationDetails}>
              <Text style={styles.destinationLabel}>Sending to</Text>
              <Text style={styles.destinationValue}>
                {enrollment?.paymentMethod?.bankName || 'Debit Card'} ****
                {enrollment?.paymentMethod?.last4}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.confirmButton}
            onPress={handleConfirmTransfer}
          >
            <Ionicons name="flash" size={20} color="#fff" />
            <Text style={styles.confirmButtonText}>Confirm Transfer</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => setScreenState('select')}
          >
            <Text style={styles.cancelButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Amount selection screen (default)
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Get Paid Now</Text>
        <View style={{ width: 24 }} />
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#4a90d9" size="large" />
        </View>
      ) : (
        <ScrollView style={styles.content}>
          {/* Available balance */}
          <View style={styles.availableCard}>
            <Text style={styles.availableLabel}>Available to Transfer</Text>
            <Text style={styles.availableAmount}>
              {formatCurrency(availableAmount)}
            </Text>
          </View>

          {/* Amount selector */}
          <View style={styles.selectorCard}>
            <View style={styles.selectorHeader}>
              <Text style={styles.selectorLabel}>Amount to Transfer</Text>
              <TouchableOpacity onPress={() => setUseSlider(!useSlider)}>
                <Ionicons
                  name={useSlider ? 'keypad-outline' : 'options-outline'}
                  size={20}
                  color="#4a90d9"
                />
              </TouchableOpacity>
            </View>

            {useSlider ? (
              <>
                <Text style={styles.selectedAmount}>{formatCurrency(amount)}</Text>
                <Slider
                  style={styles.slider}
                  minimumValue={0}
                  maximumValue={availableAmount}
                  value={amount}
                  onValueChange={handleSliderChange}
                  minimumTrackTintColor="#22c55e"
                  maximumTrackTintColor="#2a2a4e"
                  thumbTintColor="#22c55e"
                />
                <View style={styles.sliderLabels}>
                  <Text style={styles.sliderLabel}>$0</Text>
                  <TouchableOpacity onPress={handleMaxPress}>
                    <Text style={styles.maxButton}>MAX</Text>
                  </TouchableOpacity>
                  <Text style={styles.sliderLabel}>
                    {formatCurrency(availableAmount)}
                  </Text>
                </View>
              </>
            ) : (
              <View style={styles.inputContainer}>
                <Text style={styles.currencySymbol}>$</Text>
                <TextInput
                  style={styles.amountInput}
                  value={inputAmount}
                  onChangeText={handleInputChange}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor="#666"
                  autoFocus
                />
                <TouchableOpacity
                  style={styles.maxButtonInline}
                  onPress={handleMaxPress}
                >
                  <Text style={styles.maxButtonText}>MAX</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Fee breakdown */}
          {amount > 0 && (
            <View style={styles.feeCard}>
              <View style={styles.feeRow}>
                <Text style={styles.feeLabel}>Transfer Amount</Text>
                <Text style={styles.feeValue}>{formatCurrency(amount)}</Text>
              </View>
              <View style={styles.feeRow}>
                <Text style={styles.feeLabel}>
                  Fee
                  {enrollment?.feeStructure?.flatFee
                    ? ` (${formatCurrency(enrollment.feeStructure.flatFee)} flat)`
                    : enrollment?.feeStructure?.percentFee
                      ? ` (${enrollment.feeStructure.percentFee}%)`
                      : ''}
                </Text>
                <Text style={styles.feeValueRed}>-{formatCurrency(fee)}</Text>
              </View>
              <View style={styles.feeDivider} />
              <View style={styles.feeRow}>
                <Text style={styles.netLabel}>You'll Receive</Text>
                <Text style={styles.netValue}>{formatCurrency(netAmount)}</Text>
              </View>
            </View>
          )}

          {/* Destination */}
          <View style={styles.destinationCardSmall}>
            <View style={styles.destinationLeft}>
              <Ionicons name="card-outline" size={20} color="#888" />
              <View>
                <Text style={styles.destinationLabelSmall}>Transfer to</Text>
                <Text style={styles.destinationValueSmall}>
                  {enrollment?.paymentMethod?.bankName || 'Card'} ****
                  {enrollment?.paymentMethod?.last4}
                </Text>
              </View>
            </View>
            <TouchableOpacity>
              <Text style={styles.changeLink}>Change</Text>
            </TouchableOpacity>
          </View>

          {/* Transfer button */}
          <TouchableOpacity
            style={[
              styles.transferButton,
              (amount < minTransfer || amount > maxTransfer) &&
                styles.transferButtonDisabled,
            ]}
            onPress={() => setScreenState('confirm')}
            disabled={amount < minTransfer || amount > maxTransfer}
          >
            <Ionicons name="flash" size={20} color="#fff" />
            <Text style={styles.transferButtonText}>
              Transfer {formatCurrency(amount)}
            </Text>
          </TouchableOpacity>

          {amount < minTransfer && amount > 0 && (
            <Text style={styles.minWarning}>
              Minimum transfer: {formatCurrency(minTransfer)}
            </Text>
          )}

          <View style={styles.bottomSpacer} />
        </ScrollView>
      )}
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  // Available card
  availableCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  availableLabel: {
    color: '#888',
    fontSize: 14,
    marginBottom: 8,
  },
  availableAmount: {
    color: '#22c55e',
    fontSize: 36,
    fontWeight: 'bold',
  },
  // Selector card
  selectorCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  selectorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  selectorLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  selectedAmount: {
    color: '#fff',
    fontSize: 48,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sliderLabel: {
    color: '#666',
    fontSize: 12,
  },
  maxButton: {
    color: '#4a90d9',
    fontSize: 12,
    fontWeight: 'bold',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f0f23',
    borderRadius: 12,
    padding: 16,
  },
  currencySymbol: {
    color: '#fff',
    fontSize: 32,
    fontWeight: 'bold',
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    color: '#fff',
    fontSize: 32,
    fontWeight: 'bold',
  },
  maxButtonInline: {
    backgroundColor: '#4a90d9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  maxButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  // Fee card
  feeCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  feeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  feeLabel: {
    color: '#888',
    fontSize: 14,
  },
  feeValue: {
    color: '#fff',
    fontSize: 14,
  },
  feeValueRed: {
    color: '#ef4444',
    fontSize: 14,
  },
  feeDivider: {
    height: 1,
    backgroundColor: '#2a2a4e',
    marginVertical: 8,
  },
  netLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  netValue: {
    color: '#22c55e',
    fontSize: 18,
    fontWeight: 'bold',
  },
  // Destination
  destinationCardSmall: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  destinationLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  destinationLabelSmall: {
    color: '#666',
    fontSize: 12,
  },
  destinationValueSmall: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  changeLink: {
    color: '#4a90d9',
    fontSize: 14,
    fontWeight: '600',
  },
  // Transfer button
  transferButton: {
    backgroundColor: '#22c55e',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
  },
  transferButtonDisabled: {
    backgroundColor: '#666',
  },
  transferButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  minWarning: {
    color: '#f59e0b',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },
  bottomSpacer: {
    height: 40,
  },
  // Enroll prompt
  enrollPrompt: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  enrollIcon: {
    marginBottom: 24,
  },
  enrollTitle: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  enrollDescription: {
    color: '#888',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  enrollBenefits: {
    width: '100%',
    marginBottom: 32,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  benefitText: {
    color: '#fff',
    fontSize: 15,
  },
  enrollButton: {
    backgroundColor: '#f59e0b',
    width: '100%',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  enrollButtonText: {
    color: '#000',
    fontSize: 18,
    fontWeight: 'bold',
  },
  enrollDisclaimer: {
    color: '#666',
    fontSize: 12,
  },
  // Confirm screen
  confirmContainer: {
    flex: 1,
    padding: 24,
  },
  confirmLabel: {
    color: '#888',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 8,
  },
  confirmAmount: {
    color: '#fff',
    fontSize: 48,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 32,
  },
  confirmDetails: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
  },
  confirmRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  confirmRowLabel: {
    color: '#888',
    fontSize: 15,
  },
  confirmRowValue: {
    color: '#fff',
    fontSize: 15,
  },
  confirmRowLabelBold: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  confirmRowValueBold: {
    color: '#22c55e',
    fontSize: 18,
    fontWeight: 'bold',
  },
  confirmDivider: {
    height: 1,
    backgroundColor: '#2a2a4e',
    marginVertical: 12,
  },
  destinationCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 32,
  },
  destinationDetails: {},
  destinationLabel: {
    color: '#666',
    fontSize: 12,
    marginBottom: 4,
  },
  destinationValue: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  confirmButton: {
    backgroundColor: '#22c55e',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  cancelButton: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#888',
    fontSize: 16,
  },
  // Result screens
  resultContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  successCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#22c55e20',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  errorCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#ef444420',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  resultTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  resultAmount: {
    color: '#22c55e',
    fontSize: 48,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  resultSubtitle: {
    color: '#888',
    fontSize: 16,
    marginBottom: 32,
  },
  resultDetails: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    marginBottom: 24,
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  resultLabel: {
    color: '#888',
    fontSize: 14,
  },
  resultValue: {
    color: '#fff',
    fontSize: 14,
  },
  resultLabelBold: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  resultValueBold: {
    color: '#22c55e',
    fontSize: 18,
    fontWeight: 'bold',
  },
  resultDivider: {
    height: 1,
    backgroundColor: '#2a2a4e',
    marginVertical: 12,
  },
  destinationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  destinationText: {
    color: '#888',
    fontSize: 14,
  },
  arrivalTime: {
    color: '#666',
    fontSize: 13,
    marginBottom: 32,
  },
  doneButton: {
    backgroundColor: '#4a90d9',
    paddingHorizontal: 48,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 16,
  },
  doneButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  viewHistoryLink: {},
  viewHistoryText: {
    color: '#4a90d9',
    fontSize: 14,
    fontWeight: '600',
  },
  errorMessage: {
    color: '#888',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 32,
    paddingHorizontal: 24,
  },
  retryButton: {
    backgroundColor: '#4a90d9',
    paddingHorizontal: 48,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 16,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  cancelLink: {},
  cancelLinkText: {
    color: '#888',
    fontSize: 14,
  },
  processingText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 24,
    marginBottom: 8,
  },
  processingSubtext: {
    color: '#666',
    fontSize: 14,
  },
});
