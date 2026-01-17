/**
 * Instant Pay Flow Integration Tests
 *
 * Tests the complete instant pay flow: check balance -> select amount -> confirm -> success
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Alert } from 'react-native';
import {
  mockEarnedBalance,
  mockTransfer,
  mockInstantPayEnrollment,
  mockWorkerProfile,
  createMockApiResponse,
  createMockApiError,
} from '../mocks/api.mock';
import { clearMockedStorage } from '../setup';

// Mock Alert
jest.spyOn(Alert, 'alert');

// Mock the API
const mockGetBalance = jest.fn();
const mockGetEnrollment = jest.fn();
const mockRequestTransfer = jest.fn();

jest.mock('../../src/services/api', () => ({
  paymentsApi: {
    getEarnedBalance: (...args: any[]) => mockGetBalance(...args),
    getEnrollmentStatus: (...args: any[]) => mockGetEnrollment(...args),
    requestTransfer: (...args: any[]) => mockRequestTransfer(...args),
  },
}));

// Mock expo-router
const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
  }),
}));

// Mock auth store
jest.mock('../../src/stores/authStore', () => ({
  useActiveProfile: jest.fn(() => mockWorkerProfile),
}));

import { useActiveProfile } from '../../src/stores/authStore';

// Create test wrapper
function createTestWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

// Test instant pay screen
function TestInstantPayScreen() {
  const [balance, setBalance] = React.useState<any>(null);
  const [enrollment, setEnrollment] = React.useState<any>(null);
  const [amount, setAmount] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [transferring, setTransferring] = React.useState(false);
  const { View, Text, TextInput, TouchableOpacity, ActivityIndicator } = require('react-native');

  React.useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [balanceRes, enrollmentRes] = await Promise.all([
        mockGetBalance(),
        mockGetEnrollment(),
      ]);
      setBalance(balanceRes.data);
      setEnrollment(enrollmentRes.data);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value);
  };

  const calculateFee = (transferAmount: number) => {
    if (!enrollment?.feeStructure) return 0;
    const { flatFee, percentFee } = enrollment.feeStructure;
    return flatFee + transferAmount * (percentFee / 100);
  };

  const handleTransfer = () => {
    const transferAmount = parseFloat(amount);
    if (isNaN(transferAmount) || transferAmount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount');
      return;
    }

    if (transferAmount > (balance?.available || 0)) {
      Alert.alert('Insufficient Balance', 'Amount exceeds available balance');
      return;
    }

    const fee = calculateFee(transferAmount);
    const netAmount = transferAmount - fee;

    Alert.alert(
      'Confirm Transfer',
      `Transfer ${formatCurrency(transferAmount)}?\n\nFee: ${formatCurrency(fee)}\nYou receive: ${formatCurrency(netAmount)}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Transfer',
          onPress: async () => {
            setTransferring(true);
            try {
              await mockRequestTransfer(transferAmount);
              Alert.alert(
                'Transfer Initiated',
                `${formatCurrency(netAmount)} is on its way to your account!`,
                [{ text: 'OK', onPress: () => mockBack() }]
              );
            } catch (error: any) {
              Alert.alert('Transfer Failed', error.response?.data?.message || 'Please try again');
            } finally {
              setTransferring(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View testID="loading">
        <ActivityIndicator />
      </View>
    );
  }

  if (!enrollment?.isEnrolled) {
    return (
      <View testID="not-enrolled-screen">
        <Text>Set up instant pay to get started</Text>
        <TouchableOpacity testID="enroll-button" onPress={() => mockPush('/enroll')}>
          <Text>Enroll Now</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View testID="instant-pay-screen">
      <Text testID="available-balance">{formatCurrency(balance?.available || 0)}</Text>
      <Text>Available for instant pay</Text>

      <TextInput
        testID="amount-input"
        value={amount}
        onChangeText={setAmount}
        placeholder="Enter amount"
        keyboardType="decimal-pad"
      />

      {/* Quick amount buttons */}
      <View testID="quick-amounts">
        <TouchableOpacity
          testID="amount-50"
          onPress={() => setAmount('50')}
          disabled={50 > (balance?.available || 0)}
        >
          <Text>$50</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="amount-100"
          onPress={() => setAmount('100')}
          disabled={100 > (balance?.available || 0)}
        >
          <Text>$100</Text>
        </TouchableOpacity>
        <TouchableOpacity testID="amount-max" onPress={() => setAmount(String(balance?.available || 0))}>
          <Text>Max</Text>
        </TouchableOpacity>
      </View>

      {/* Fee preview */}
      {amount && parseFloat(amount) > 0 && (
        <View testID="fee-preview">
          <Text testID="fee-amount">Fee: {formatCurrency(calculateFee(parseFloat(amount)))}</Text>
          <Text testID="net-amount">
            You receive: {formatCurrency(parseFloat(amount) - calculateFee(parseFloat(amount)))}
          </Text>
        </View>
      )}

      {/* Payment method */}
      <View testID="payment-method">
        <Text>
          To: {enrollment.paymentMethod?.bankName || 'Card'} ****
          {enrollment.paymentMethod?.last4}
        </Text>
      </View>

      <TouchableOpacity
        testID="transfer-button"
        onPress={handleTransfer}
        disabled={transferring || !amount || parseFloat(amount) <= 0}
      >
        <Text>{transferring ? 'Processing...' : 'Get Paid Now'}</Text>
      </TouchableOpacity>
    </View>
  );
}

describe('Instant Pay Flow Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearMockedStorage();

    // Default API responses
    mockGetBalance.mockResolvedValue(createMockApiResponse(mockEarnedBalance));
    mockGetEnrollment.mockResolvedValue(createMockApiResponse(mockInstantPayEnrollment));
    mockRequestTransfer.mockResolvedValue(
      createMockApiResponse({
        ...mockTransfer,
        id: 'new-transfer',
        status: 'PROCESSING',
      })
    );

    (useActiveProfile as jest.Mock).mockReturnValue(mockWorkerProfile);
  });

  describe('Check Balance', () => {
    it('displays available balance', async () => {
      const { findByTestId } = render(<TestInstantPayScreen />, {
        wrapper: createTestWrapper(),
      });

      await waitFor(async () => {
        const balanceText = await findByTestId('available-balance');
        expect(balanceText.props.children).toContain('245.50');
      });
    });

    it('shows payment method information', async () => {
      const { findByTestId } = render(<TestInstantPayScreen />, {
        wrapper: createTestWrapper(),
      });

      await waitFor(async () => {
        const paymentMethod = await findByTestId('payment-method');
        expect(paymentMethod).toBeTruthy();
      });
    });
  });

  describe('Select Amount', () => {
    it('allows manual amount entry', async () => {
      const { findByTestId } = render(<TestInstantPayScreen />, {
        wrapper: createTestWrapper(),
      });

      await waitFor(async () => {
        const input = await findByTestId('amount-input');
        fireEvent.changeText(input, '75');
      });

      // Should show fee preview
      await waitFor(async () => {
        expect(await findByTestId('fee-preview')).toBeTruthy();
      });
    });

    it('provides quick amount buttons', async () => {
      const { findByTestId, getByTestId } = render(<TestInstantPayScreen />, {
        wrapper: createTestWrapper(),
      });

      await waitFor(async () => {
        expect(await findByTestId('quick-amounts')).toBeTruthy();
      });

      // Press $100 button
      fireEvent.press(getByTestId('amount-100'));

      const input = getByTestId('amount-input');
      expect(input.props.value).toBe('100');
    });

    it('allows selecting max amount', async () => {
      const { findByTestId, getByTestId } = render(<TestInstantPayScreen />, {
        wrapper: createTestWrapper(),
      });

      await waitFor(async () => {
        expect(await findByTestId('amount-max')).toBeTruthy();
      });

      // Press Max button
      fireEvent.press(getByTestId('amount-max'));

      const input = getByTestId('amount-input');
      expect(input.props.value).toBe('245.5');
    });

    it('shows fee preview when amount entered', async () => {
      const { findByTestId } = render(<TestInstantPayScreen />, {
        wrapper: createTestWrapper(),
      });

      // Wait for input and enter amount
      const input = await findByTestId('amount-input');
      fireEvent.changeText(input, '100');

      await waitFor(async () => {
        const feeAmount = await findByTestId('fee-amount');
        // Children may be array or string, flatten and join for comparison
        const feeText = Array.isArray(feeAmount.props.children)
          ? feeAmount.props.children.join('')
          : feeAmount.props.children;
        expect(feeText).toContain('2.99');

        const netAmount = await findByTestId('net-amount');
        const netText = Array.isArray(netAmount.props.children)
          ? netAmount.props.children.join('')
          : netAmount.props.children;
        expect(netText).toContain('97.01');
      });
    });
  });

  describe('Confirm Transfer', () => {
    it('shows confirmation dialog', async () => {
      const { findByTestId, getByTestId } = render(<TestInstantPayScreen />, {
        wrapper: createTestWrapper(),
      });

      await waitFor(async () => {
        const input = await findByTestId('amount-input');
        fireEvent.changeText(input, '100');
      });

      fireEvent.press(getByTestId('transfer-button'));

      expect(Alert.alert).toHaveBeenCalledWith(
        'Confirm Transfer',
        expect.stringContaining('$100'),
        expect.any(Array)
      );
    });

    it('shows fee breakdown in confirmation', async () => {
      const { findByTestId, getByTestId } = render(<TestInstantPayScreen />, {
        wrapper: createTestWrapper(),
      });

      await waitFor(async () => {
        const input = await findByTestId('amount-input');
        fireEvent.changeText(input, '100');
      });

      fireEvent.press(getByTestId('transfer-button'));

      expect(Alert.alert).toHaveBeenCalledWith(
        'Confirm Transfer',
        expect.stringContaining('Fee'),
        expect.any(Array)
      );
    });

    it('calls transfer API when confirmed', async () => {
      (Alert.alert as jest.Mock).mockImplementation((title, message, buttons) => {
        if (title === 'Confirm Transfer') {
          const confirmButton = buttons?.find((b: any) => b.text === 'Transfer');
          if (confirmButton?.onPress) confirmButton.onPress();
        }
      });

      const { findByTestId, getByTestId } = render(<TestInstantPayScreen />, {
        wrapper: createTestWrapper(),
      });

      await waitFor(async () => {
        const input = await findByTestId('amount-input');
        fireEvent.changeText(input, '100');
      });

      fireEvent.press(getByTestId('transfer-button'));

      await waitFor(() => {
        expect(mockRequestTransfer).toHaveBeenCalledWith(100);
      });
    });
  });

  describe('Success Flow', () => {
    it('shows success message after transfer', async () => {
      (Alert.alert as jest.Mock)
        .mockImplementationOnce((title, message, buttons) => {
          const confirmButton = buttons?.find((b: any) => b.text === 'Transfer');
          if (confirmButton?.onPress) confirmButton.onPress();
        })
        .mockImplementationOnce(() => {});

      const { findByTestId, getByTestId } = render(<TestInstantPayScreen />, {
        wrapper: createTestWrapper(),
      });

      await waitFor(async () => {
        const input = await findByTestId('amount-input');
        fireEvent.changeText(input, '100');
      });

      fireEvent.press(getByTestId('transfer-button'));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Transfer Initiated',
          expect.stringContaining('on its way'),
          expect.any(Array)
        );
      });
    });

    it('navigates back on success acknowledgment', async () => {
      (Alert.alert as jest.Mock)
        .mockImplementationOnce((title, message, buttons) => {
          const confirmButton = buttons?.find((b: any) => b.text === 'Transfer');
          if (confirmButton?.onPress) confirmButton.onPress();
        })
        .mockImplementationOnce((title, message, buttons) => {
          const okButton = buttons?.find((b: any) => b.text === 'OK');
          if (okButton?.onPress) okButton.onPress();
        });

      const { findByTestId, getByTestId } = render(<TestInstantPayScreen />, {
        wrapper: createTestWrapper(),
      });

      await waitFor(async () => {
        const input = await findByTestId('amount-input');
        fireEvent.changeText(input, '100');
      });

      fireEvent.press(getByTestId('transfer-button'));

      await waitFor(() => {
        expect(mockBack).toHaveBeenCalled();
      });
    });
  });

  describe('Error Handling', () => {
    it('shows error for invalid amount', async () => {
      const { findByTestId, getByTestId } = render(<TestInstantPayScreen />, {
        wrapper: createTestWrapper(),
      });

      await waitFor(async () => {
        const input = await findByTestId('amount-input');
        fireEvent.changeText(input, 'abc');
      });

      fireEvent.press(getByTestId('transfer-button'));

      expect(Alert.alert).toHaveBeenCalledWith('Invalid Amount', expect.any(String));
    });

    it('shows error for amount exceeding balance', async () => {
      const { findByTestId, getByTestId } = render(<TestInstantPayScreen />, {
        wrapper: createTestWrapper(),
      });

      await waitFor(async () => {
        const input = await findByTestId('amount-input');
        fireEvent.changeText(input, '500'); // More than available
      });

      fireEvent.press(getByTestId('transfer-button'));

      expect(Alert.alert).toHaveBeenCalledWith('Insufficient Balance', expect.any(String));
    });

    it('shows error when transfer API fails', async () => {
      mockRequestTransfer.mockRejectedValue(
        createMockApiError(400, 'Daily transfer limit exceeded')
      );

      (Alert.alert as jest.Mock)
        .mockImplementationOnce((title, message, buttons) => {
          const confirmButton = buttons?.find((b: any) => b.text === 'Transfer');
          if (confirmButton?.onPress) confirmButton.onPress();
        })
        .mockImplementationOnce(() => {});

      const { findByTestId, getByTestId } = render(<TestInstantPayScreen />, {
        wrapper: createTestWrapper(),
      });

      await waitFor(async () => {
        const input = await findByTestId('amount-input');
        fireEvent.changeText(input, '100');
      });

      fireEvent.press(getByTestId('transfer-button'));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Transfer Failed',
          'Daily transfer limit exceeded'
        );
      });
    });
  });

  describe('Not Enrolled State', () => {
    it('shows enrollment screen when not enrolled', async () => {
      mockGetEnrollment.mockResolvedValue(
        createMockApiResponse({
          isEnrolled: false,
          feeStructure: mockInstantPayEnrollment.feeStructure,
        })
      );

      const { findByTestId } = render(<TestInstantPayScreen />, {
        wrapper: createTestWrapper(),
      });

      await waitFor(async () => {
        expect(await findByTestId('not-enrolled-screen')).toBeTruthy();
        expect(await findByTestId('enroll-button')).toBeTruthy();
      });
    });

    it('navigates to enrollment flow', async () => {
      mockGetEnrollment.mockResolvedValue(
        createMockApiResponse({
          isEnrolled: false,
          feeStructure: mockInstantPayEnrollment.feeStructure,
        })
      );

      const { findByTestId } = render(<TestInstantPayScreen />, {
        wrapper: createTestWrapper(),
      });

      await waitFor(async () => {
        const enrollButton = await findByTestId('enroll-button');
        fireEvent.press(enrollButton);
      });

      expect(mockPush).toHaveBeenCalledWith('/enroll');
    });
  });

  describe('Loading State', () => {
    it('shows loading indicator while fetching data', () => {
      mockGetBalance.mockImplementation(() => new Promise(() => {}));
      mockGetEnrollment.mockImplementation(() => new Promise(() => {}));

      const { getByTestId } = render(<TestInstantPayScreen />, {
        wrapper: createTestWrapper(),
      });

      expect(getByTestId('loading')).toBeTruthy();
    });
  });

  describe('Transfer Button State', () => {
    it('disables transfer button during processing', async () => {
      mockRequestTransfer.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 1000))
      );

      (Alert.alert as jest.Mock).mockImplementation((title, message, buttons) => {
        const confirmButton = buttons?.find((b: any) => b.text === 'Transfer');
        if (confirmButton?.onPress) confirmButton.onPress();
      });

      const { findByTestId, getByTestId, getByText } = render(<TestInstantPayScreen />, {
        wrapper: createTestWrapper(),
      });

      await waitFor(async () => {
        const input = await findByTestId('amount-input');
        fireEvent.changeText(input, '100');
      });

      fireEvent.press(getByTestId('transfer-button'));

      await waitFor(() => {
        expect(getByText('Processing...')).toBeTruthy();
      });
    });
  });
});
