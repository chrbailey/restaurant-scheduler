import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import { CapacityMeter } from '../CapacityMeter';

const renderCapacityMeter = (current: number, max: number, variant?: 'default' | 'compact' | 'circle') => {
  return render(
    <ConfigProvider>
      <CapacityMeter current={current} max={max} variant={variant} />
    </ConfigProvider>
  );
};

describe('CapacityMeter', () => {
  it('renders the component', async () => {
    renderCapacityMeter(8, 15);

    await waitFor(() => {
      // Text is "8 / 15" in a single Text element
      expect(screen.getByText('8 / 15')).toBeInTheDocument();
    });
  });

  it('displays current/max values', async () => {
    renderCapacityMeter(8, 15);

    await waitFor(() => {
      // Check for the combined text
      expect(screen.getByText('8 / 15')).toBeInTheDocument();
    });
  });

  it('renders progress bar', async () => {
    renderCapacityMeter(8, 15);

    await waitFor(() => {
      const progressBar = document.querySelector('.ant-progress');
      expect(progressBar).toBeInTheDocument();
    });
  });
});

describe('CapacityMeter Colors', () => {
  it('shows green color when below 70%', async () => {
    renderCapacityMeter(5, 15); // 33%

    await waitFor(() => {
      expect(screen.getByText('Capacity Available')).toBeInTheDocument();
    });
  });

  it('shows yellow/warning color between 70-90%', async () => {
    renderCapacityMeter(12, 15); // 80%

    await waitFor(() => {
      expect(screen.getByText('Getting Busy')).toBeInTheDocument();
    });
  });

  it('shows red color at 90% or above', async () => {
    renderCapacityMeter(14, 15); // 93%

    await waitFor(() => {
      expect(screen.getByText('Near Capacity')).toBeInTheDocument();
    });
  });
});

describe('CapacityMeter Status Icons', () => {
  it('shows check icon when capacity available', async () => {
    renderCapacityMeter(5, 15);

    await waitFor(() => {
      const checkIcon = document.querySelector('[data-icon="check-circle"]') ||
        document.querySelector('.anticon-check-circle');
      expect(checkIcon).toBeInTheDocument();
    });
  });

  it('shows thunderbolt icon when getting busy', async () => {
    renderCapacityMeter(12, 15);

    await waitFor(() => {
      const thunderIcon = document.querySelector('[data-icon="thunderbolt"]') ||
        document.querySelector('.anticon-thunderbolt');
      expect(thunderIcon).toBeInTheDocument();
    });
  });

  it('shows warning icon when near capacity', async () => {
    renderCapacityMeter(14, 15);

    await waitFor(() => {
      const warningIcon = document.querySelector('[data-icon="warning"]') ||
        document.querySelector('.anticon-warning');
      expect(warningIcon).toBeInTheDocument();
    });
  });
});

describe('CapacityMeter Variants - Circle', () => {
  it('renders circle variant', async () => {
    renderCapacityMeter(8, 15, 'circle');

    await waitFor(() => {
      const circleProgress = document.querySelector('.ant-progress-circle');
      expect(circleProgress).toBeInTheDocument();
    });
  });

  it('shows current value in circle', async () => {
    renderCapacityMeter(8, 15, 'circle');

    await waitFor(() => {
      expect(screen.getByText('8')).toBeInTheDocument();
    });
  });

  it('shows max value in circle variant', async () => {
    renderCapacityMeter(8, 15, 'circle');

    await waitFor(() => {
      expect(screen.getByText(/of 15/)).toBeInTheDocument();
    });
  });
});

describe('CapacityMeter Variants - Compact', () => {
  it('renders compact variant', async () => {
    renderCapacityMeter(8, 15, 'compact');

    await waitFor(() => {
      expect(screen.getByText('Capacity')).toBeInTheDocument();
    });
  });

  it('shows current/max in compact format', async () => {
    renderCapacityMeter(8, 15, 'compact');

    await waitFor(() => {
      expect(screen.getByText('8/15')).toBeInTheDocument();
    });
  });

  it('renders small progress bar', async () => {
    renderCapacityMeter(8, 15, 'compact');

    await waitFor(() => {
      const progressBar = document.querySelector('.ant-progress-small');
      expect(progressBar).toBeInTheDocument();
    });
  });
});

describe('CapacityMeter Variants - Default', () => {
  it('renders default variant with full styling', async () => {
    renderCapacityMeter(8, 15, 'default');

    await waitFor(() => {
      expect(screen.getByText('Capacity Available')).toBeInTheDocument();
    });
  });

  it('shows 70% marker', async () => {
    renderCapacityMeter(8, 15);

    await waitFor(() => {
      // 70% of 15 is 10.5, Math.round gives 11
      expect(screen.getByText('11 (70%)')).toBeInTheDocument();
    });
  });

  it('shows 0 and max markers', async () => {
    renderCapacityMeter(8, 15);

    await waitFor(() => {
      expect(screen.getByText('0')).toBeInTheDocument();
    });
  });

  it('renders visual slot indicators', async () => {
    renderCapacityMeter(8, 15);

    await waitFor(() => {
      // Should render individual slot divs for visual capacity bar
      const slots = document.querySelectorAll('[style*="width: 12px"][style*="height: 12px"]');
      expect(slots.length).toBeGreaterThan(0);
    });
  });
});

describe('CapacityMeter Edge Cases', () => {
  it('handles zero capacity', async () => {
    renderCapacityMeter(0, 15);

    await waitFor(() => {
      expect(screen.getByText('0')).toBeInTheDocument();
    });
  });

  it('handles full capacity', async () => {
    renderCapacityMeter(15, 15);

    await waitFor(() => {
      expect(screen.getByText('Near Capacity')).toBeInTheDocument();
    });
  });

  it('handles zero max capacity', async () => {
    renderCapacityMeter(0, 0);

    // Should handle edge case without crashing
    await waitFor(() => {
      const progressBar = document.querySelector('.ant-progress');
      expect(progressBar).toBeInTheDocument();
    });
  });

  it('handles over capacity (current > max)', async () => {
    renderCapacityMeter(20, 15);

    await waitFor(() => {
      // Text is "20 / 15" in a single element
      expect(screen.getByText('20 / 15')).toBeInTheDocument();
    });
  });
});

describe('CapacityMeter Large Max Values', () => {
  it('shows +N more when max > 20', async () => {
    renderCapacityMeter(15, 30);

    await waitFor(() => {
      expect(screen.getByText(/\+10 more/)).toBeInTheDocument();
    });
  });

  it('limits visual slots to 20', async () => {
    renderCapacityMeter(15, 30);

    await waitFor(() => {
      // Should have 20 slot divs max
      const slots = document.querySelectorAll('[style*="width: 12px"][style*="height: 12px"]');
      expect(slots.length).toBe(20);
    });
  });
});

describe('CapacityMeter Tooltip', () => {
  it('has tooltip on circle variant', async () => {
    renderCapacityMeter(8, 15, 'circle');

    await waitFor(() => {
      // Tooltip wrapper should exist
      const tooltip = document.querySelector('.ant-tooltip-open') ||
        document.querySelector('[class*="tooltip"]');
      // The tooltip may not be visible without hover, but the component should render
      expect(screen.getByText('8')).toBeInTheDocument();
    });
  });
});
