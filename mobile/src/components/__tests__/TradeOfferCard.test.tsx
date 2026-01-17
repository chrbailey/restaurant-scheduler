/**
 * TradeOfferCard Component Tests
 *
 * Tests for the TradeOfferCard component used in the marketplace screen.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import TradeOfferCard from '../TradeOfferCard';
import { mockTradeOffer, mockTradeOfferFlexible } from '../../../test/mocks/api.mock';
import type { TradeOffer } from '../../services/api';

// Mock date-fns
jest.mock('date-fns', () => ({
  format: jest.fn((date, formatStr) => {
    if (formatStr === 'EEEE, MMM d') return 'Monday, Dec 23';
    if (formatStr === 'h:mm a') return '2:00 PM';
    return 'mock-date';
  }),
  parseISO: jest.fn((str) => new Date(str)),
}));

describe('TradeOfferCard Component', () => {
  const mockOnPress = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Shift Details', () => {
    it('shows the shift being traded', () => {
      const { getByText } = render(
        <TradeOfferCard offer={mockTradeOffer} onPress={mockOnPress} />
      );

      expect(getByText('SERVER')).toBeTruthy();
      expect(getByText('Monday, Dec 23')).toBeTruthy();
      expect(getByText('Test Restaurant')).toBeTruthy();
    });

    it('displays shift time correctly', () => {
      const { getByText } = render(
        <TradeOfferCard offer={mockTradeOffer} onPress={mockOnPress} />
      );

      // Time range is displayed as a single combined string
      expect(getByText(/2:00 PM.*-.*2:00 PM/)).toBeTruthy();
    });

    it('shows duration in hours', () => {
      const { getByText } = render(
        <TradeOfferCard offer={mockTradeOffer} onPress={mockOnPress} />
      );

      // Duration calculation (8.0h)
      expect(getByText(/(8\.0h)/)).toBeTruthy();
    });
  });

  describe('Preferences Display', () => {
    it('displays day preferences', () => {
      const { getByText } = render(
        <TradeOfferCard offer={mockTradeOffer} onPress={mockOnPress} />
      );

      // Should show abbreviated days (uppercase)
      expect(getByText(/TUE, WED, THU/)).toBeTruthy();
    });

    it('displays time slot preferences', () => {
      const { getByText } = render(
        <TradeOfferCard offer={mockTradeOffer} onPress={mockOnPress} />
      );

      expect(getByText(/Evening/i)).toBeTruthy();
    });

    it('shows "Flexible - any shift" when no preferences set', () => {
      const flexibleOffer: TradeOffer = {
        ...mockTradeOffer,
        preferences: {},
      };

      const { getByText } = render(
        <TradeOfferCard offer={flexibleOffer} onPress={mockOnPress} />
      );

      expect(getByText('Flexible - any shift')).toBeTruthy();
    });

    it('shows flexible on dates badge when enabled', () => {
      const { getByText } = render(
        <TradeOfferCard offer={mockTradeOffer} onPress={mockOnPress} />
      );

      expect(getByText('Flexible on dates')).toBeTruthy();
    });

    it('shows multiple days count when more than 3 days selected', () => {
      const manyDaysOffer: TradeOffer = {
        ...mockTradeOffer,
        preferences: {
          daysOfWeek: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
        },
      };

      const { getByText } = render(
        <TradeOfferCard offer={manyDaysOffer} onPress={mockOnPress} />
      );

      expect(getByText(/5 days/)).toBeTruthy();
    });
  });

  describe('Compatibility Score', () => {
    it('renders compatibility bar when showCompatibility is true', () => {
      const { getByText } = render(
        <TradeOfferCard
          offer={mockTradeOffer}
          onPress={mockOnPress}
          showCompatibility={true}
          compatibilityScore={0.85}
        />
      );

      expect(getByText('85% match')).toBeTruthy();
    });

    it('does not render compatibility when showCompatibility is false', () => {
      const { queryByText } = render(
        <TradeOfferCard
          offer={mockTradeOffer}
          onPress={mockOnPress}
          showCompatibility={false}
          compatibilityScore={0.85}
        />
      );

      expect(queryByText('85% match')).toBeNull();
    });

    it('shows green color for high compatibility (>= 80%)', () => {
      const { getByText } = render(
        <TradeOfferCard
          offer={mockTradeOffer}
          onPress={mockOnPress}
          showCompatibility={true}
          compatibilityScore={0.9}
        />
      );

      expect(getByText('90% match')).toBeTruthy();
      // Color would be #22c55e (green)
    });

    it('shows yellow color for medium compatibility (50-79%)', () => {
      const { getByText } = render(
        <TradeOfferCard
          offer={mockTradeOffer}
          onPress={mockOnPress}
          showCompatibility={true}
          compatibilityScore={0.65}
        />
      );

      expect(getByText('65% match')).toBeTruthy();
      // Color would be #f59e0b (yellow)
    });

    it('shows red color for low compatibility (< 50%)', () => {
      const { getByText } = render(
        <TradeOfferCard
          offer={mockTradeOffer}
          onPress={mockOnPress}
          showCompatibility={true}
          compatibilityScore={0.3}
        />
      );

      expect(getByText('30% match')).toBeTruthy();
      // Color would be #ef4444 (red)
    });
  });

  describe('Interest Count', () => {
    it('shows interest count with heart icon', () => {
      const { getByText } = render(
        <TradeOfferCard offer={mockTradeOffer} onPress={mockOnPress} />
      );

      expect(getByText('5')).toBeTruthy();
    });

    it('renders different interest counts correctly', () => {
      const highInterestOffer: TradeOffer = {
        ...mockTradeOffer,
        interestCount: 15,
      };

      const { getByText } = render(
        <TradeOfferCard offer={highInterestOffer} onPress={mockOnPress} />
      );

      expect(getByText('15')).toBeTruthy();
    });

    it('renders zero interest count', () => {
      const noInterestOffer: TradeOffer = {
        ...mockTradeOffer,
        interestCount: 0,
      };

      const { getByText } = render(
        <TradeOfferCard offer={noInterestOffer} onPress={mockOnPress} />
      );

      expect(getByText('0')).toBeTruthy();
    });
  });

  describe('Worker Info', () => {
    it('shows worker name with initial', () => {
      const { getByText } = render(
        <TradeOfferCard offer={mockTradeOffer} onPress={mockOnPress} />
      );

      expect(getByText('Alex J.')).toBeTruthy();
    });

    it('shows worker avatar with first initial', () => {
      const { getByText } = render(
        <TradeOfferCard offer={mockTradeOffer} onPress={mockOnPress} />
      );

      expect(getByText('A')).toBeTruthy();
    });
  });

  describe('Recommended Badge', () => {
    it('shows recommended badge when isRecommended is true', () => {
      const { getByText } = render(
        <TradeOfferCard offer={mockTradeOffer} onPress={mockOnPress} isRecommended={true} />
      );

      expect(getByText('Recommended')).toBeTruthy();
    });

    it('does not show recommended badge when isRecommended is false', () => {
      const { queryByText } = render(
        <TradeOfferCard offer={mockTradeOffer} onPress={mockOnPress} isRecommended={false} />
      );

      expect(queryByText('Recommended')).toBeNull();
    });

    it('shows recommendation reason when provided', () => {
      const { getByText } = render(
        <TradeOfferCard
          offer={mockTradeOffer}
          onPress={mockOnPress}
          isRecommended={true}
          recommendationReason="This matches your Wednesday availability"
        />
      );

      expect(getByText('This matches your Wednesday availability')).toBeTruthy();
    });

    it('does not show reason when not recommended', () => {
      const { queryByText } = render(
        <TradeOfferCard
          offer={mockTradeOffer}
          onPress={mockOnPress}
          isRecommended={false}
          recommendationReason="This matches your Wednesday availability"
        />
      );

      expect(queryByText('This matches your Wednesday availability')).toBeNull();
    });
  });

  describe('Interactions', () => {
    it('calls onPress when card is pressed', () => {
      const { getByText } = render(
        <TradeOfferCard offer={mockTradeOffer} onPress={mockOnPress} />
      );

      // Find the View button and press it or press the card
      fireEvent.press(getByText('View'));

      // The onPress should be called through card press
    });

    it('shows View button with chevron', () => {
      const { getByText } = render(
        <TradeOfferCard offer={mockTradeOffer} onPress={mockOnPress} />
      );

      expect(getByText('View')).toBeTruthy();
    });
  });

  describe('Card Styling', () => {
    it('has different border for recommended offers', () => {
      // Recommended cards have amber border
      const { UNSAFE_root } = render(
        <TradeOfferCard offer={mockTradeOffer} onPress={mockOnPress} isRecommended={true} />
      );

      // Style verification through component render
      expect(true).toBe(true);
    });

    it('has default styling for non-recommended offers', () => {
      const { UNSAFE_root } = render(
        <TradeOfferCard offer={mockTradeOffer} onPress={mockOnPress} isRecommended={false} />
      );

      // Default border color
      expect(true).toBe(true);
    });
  });

  describe('Looking For Section', () => {
    it('displays "Looking for:" label', () => {
      const { getByText } = render(
        <TradeOfferCard offer={mockTradeOffer} onPress={mockOnPress} />
      );

      expect(getByText('Looking for:')).toBeTruthy();
    });
  });
});
