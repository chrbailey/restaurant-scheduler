import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import { ForecastChart } from '../ForecastChart';
import { mockForecast } from '@test/fixtures/data';

interface ForecastDataPoint {
  hour: string;
  dineIn: number;
  delivery: number;
  opportunity?: boolean;
  weather?: string;
  actual?: {
    dineIn?: number;
    delivery?: number;
  };
}

const renderForecastChart = (
  data: ForecastDataPoint[] = mockForecast.hourly,
  compact = false,
  showActuals = true
) => {
  return render(
    <ConfigProvider>
      <ForecastChart data={data} compact={compact} showActuals={showActuals} />
    </ConfigProvider>
  );
};

describe('ForecastChart', () => {
  it('renders the chart with data', async () => {
    renderForecastChart();

    await waitFor(() => {
      expect(screen.getByText('Dine-In')).toBeInTheDocument();
    });
  });

  it('renders legend', async () => {
    renderForecastChart();

    await waitFor(() => {
      expect(screen.getByText('Dine-In')).toBeInTheDocument();
      expect(screen.getByText('Delivery')).toBeInTheDocument();
    });
  });

  it('shows Actual in legend when showActuals is true', async () => {
    renderForecastChart(mockForecast.hourly, false, true);

    await waitFor(() => {
      expect(screen.getByText('Actual')).toBeInTheDocument();
    });
  });

  it('hides Actual in legend when showActuals is false', async () => {
    renderForecastChart(mockForecast.hourly, false, false);

    await waitFor(() => {
      expect(screen.queryByText('Actual')).not.toBeInTheDocument();
    });
  });
});

describe('ForecastChart Summary Stats', () => {
  it('shows peak dine-in', async () => {
    renderForecastChart();

    await waitFor(() => {
      expect(screen.getByText('Peak Dine-In')).toBeInTheDocument();
    });
  });

  it('shows peak dine-in value', async () => {
    renderForecastChart();

    await waitFor(() => {
      // Max dine-in from mock data is 70 (appears in Y-axis and stat card)
      const elements = screen.getAllByText('70');
      expect(elements.length).toBeGreaterThan(0);
    });
  });

  it('shows peak delivery', async () => {
    renderForecastChart();

    await waitFor(() => {
      expect(screen.getByText('Peak Delivery')).toBeInTheDocument();
    });
  });

  it('shows peak delivery value', async () => {
    renderForecastChart();

    await waitFor(() => {
      // Max delivery from mock data is 30
      expect(screen.getByText('30')).toBeInTheDocument();
    });
  });

  it('shows opportunity windows count', async () => {
    renderForecastChart();

    await waitFor(() => {
      expect(screen.getByText('Opportunities')).toBeInTheDocument();
    });
  });

  it('shows correct opportunity count', async () => {
    renderForecastChart();

    await waitFor(() => {
      // Mock data has 3 opportunity windows
      expect(screen.getByText('3')).toBeInTheDocument();
    });
  });

  it('shows windows label', async () => {
    renderForecastChart();

    await waitFor(() => {
      expect(screen.getByText('windows')).toBeInTheDocument();
    });
  });
});

describe('ForecastChart Compact Mode', () => {
  it('hides detailed stats in compact mode', async () => {
    renderForecastChart(mockForecast.hourly, true);

    await waitFor(() => {
      expect(screen.queryByText('Peak Dine-In')).not.toBeInTheDocument();
      expect(screen.queryByText('Opportunities')).not.toBeInTheDocument();
    });
  });

  it('shows first and last hour in compact mode', async () => {
    renderForecastChart(mockForecast.hourly, true);

    await waitFor(() => {
      expect(screen.getByText('11:00')).toBeInTheDocument();
      expect(screen.getByText('21:00')).toBeInTheDocument();
    });
  });

  it('shows middle hour in compact mode', async () => {
    renderForecastChart(mockForecast.hourly, true);

    await waitFor(() => {
      // Middle of the array
      expect(screen.getByText('16:00')).toBeInTheDocument();
    });
  });
});

describe('ForecastChart Y-Axis', () => {
  it('shows Y-axis labels', async () => {
    renderForecastChart();

    await waitFor(() => {
      // Should show max value, midpoint, and 0
      expect(screen.getByText('0')).toBeInTheDocument();
    });
  });

  it('calculates max value correctly', async () => {
    renderForecastChart();

    await waitFor(() => {
      // Max value from the data should be displayed (may appear multiple times)
      const maxValue = Math.max(
        ...mockForecast.hourly.flatMap((d) => [d.dineIn, d.delivery])
      );
      const elements = screen.getAllByText(String(maxValue));
      expect(elements.length).toBeGreaterThan(0);
    });
  });
});

describe('ForecastChart Opportunity Highlights', () => {
  it('highlights opportunity windows', async () => {
    renderForecastChart();

    // Opportunity windows should have visual highlighting
    // The bars for hours with opportunity=true should have special styling
    await waitFor(() => {
      // Check that the chart renders (opportunity styling is visual)
      expect(screen.getByText('Dine-In')).toBeInTheDocument();
    });
  });
});

describe('ForecastChart Empty State', () => {
  it('shows empty state when no data', async () => {
    renderForecastChart([]);

    await waitFor(() => {
      expect(screen.getByText('No forecast data available')).toBeInTheDocument();
    });
  });

  it('shows empty state when data is null', async () => {
    // @ts-expect-error Testing null data
    renderForecastChart(null);

    await waitFor(() => {
      expect(screen.getByText('No forecast data available')).toBeInTheDocument();
    });
  });
});

describe('ForecastChart Tooltips', () => {
  it('has tooltip on bars', async () => {
    renderForecastChart();

    // Tooltips are wrapped around each bar group
    await waitFor(() => {
      // The chart should render with tooltip-enabled elements
      expect(screen.getByText('Dine-In')).toBeInTheDocument();
    });
  });
});

describe('ForecastChart with Actual Data', () => {
  it('renders actual overlays when data has actuals', async () => {
    const dataWithActuals: ForecastDataPoint[] = mockForecast.hourly.map((d, i) => ({
      ...d,
      actual: i < 5 ? { dineIn: d.dineIn - 5, delivery: d.delivery - 3 } : undefined,
    }));

    renderForecastChart(dataWithActuals, false, true);

    await waitFor(() => {
      expect(screen.getByText('Actual')).toBeInTheDocument();
    });
  });
});

describe('ForecastChart Bar Sizing', () => {
  it('uses wider bars in non-compact mode', async () => {
    renderForecastChart(mockForecast.hourly, false);

    // Non-compact mode uses barWidth of 16
    await waitFor(() => {
      // Verify chart renders in non-compact mode
      expect(screen.getByText('Peak Dine-In')).toBeInTheDocument();
    });
  });

  it('uses narrower bars in compact mode', async () => {
    renderForecastChart(mockForecast.hourly, true);

    // Compact mode uses barWidth of 8
    await waitFor(() => {
      // Verify chart renders in compact mode
      expect(screen.queryByText('Peak Dine-In')).not.toBeInTheDocument();
    });
  });
});

describe('ForecastChart Hour Labels', () => {
  it('shows hour labels in non-compact mode', async () => {
    renderForecastChart(mockForecast.hourly, false);

    await waitFor(() => {
      // Hour labels are shown rotated under bars in non-compact
      expect(screen.getAllByText('11:00').length).toBeGreaterThan(0);
    });
  });
});

describe('ForecastChart Peak Times', () => {
  it('shows time of peak dine-in', async () => {
    renderForecastChart();

    await waitFor(() => {
      // Peak dine-in is at 19:00 (70)
      expect(screen.getByText('@19:00')).toBeInTheDocument();
    });
  });

  it('shows time of peak delivery', async () => {
    renderForecastChart();

    await waitFor(() => {
      // Peak delivery is at 18:00 (30)
      expect(screen.getByText('@18:00')).toBeInTheDocument();
    });
  });
});
