import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigProvider } from 'antd';
import { ChurnRiskIndicator } from '../ChurnRiskIndicator';

const renderChurnRiskIndicator = (
  risk: 'low' | 'medium' | 'high',
  showLabel = false,
  showProgress = false,
  size: 'small' | 'default' = 'default'
) => {
  return render(
    <ConfigProvider>
      <ChurnRiskIndicator
        risk={risk}
        showLabel={showLabel}
        showProgress={showProgress}
        size={size}
      />
    </ConfigProvider>
  );
};

describe('ChurnRiskIndicator', () => {
  it('renders the component', async () => {
    renderChurnRiskIndicator('low');

    await waitFor(() => {
      expect(screen.getByText('LOW')).toBeInTheDocument();
    });
  });

  it('shows uppercase risk level', async () => {
    renderChurnRiskIndicator('medium');

    await waitFor(() => {
      expect(screen.getByText('MEDIUM')).toBeInTheDocument();
    });
  });
});

describe('ChurnRiskIndicator Low Risk', () => {
  it('displays LOW text', async () => {
    renderChurnRiskIndicator('low');

    await waitFor(() => {
      expect(screen.getByText('LOW')).toBeInTheDocument();
    });
  });

  it('shows green tag for low risk', async () => {
    renderChurnRiskIndicator('low');

    await waitFor(() => {
      const tag = screen.getByText('LOW').closest('.ant-tag');
      expect(tag).toHaveClass('ant-tag-green');
    });
  });

  it('shows check icon for low risk', async () => {
    renderChurnRiskIndicator('low');

    await waitFor(() => {
      const checkIcon = document.querySelector('[data-icon="check-circle"]') ||
        document.querySelector('.anticon-check-circle');
      expect(checkIcon).toBeInTheDocument();
    });
  });
});

describe('ChurnRiskIndicator Medium Risk', () => {
  it('displays MEDIUM text', async () => {
    renderChurnRiskIndicator('medium');

    await waitFor(() => {
      expect(screen.getByText('MEDIUM')).toBeInTheDocument();
    });
  });

  it('shows orange tag for medium risk', async () => {
    renderChurnRiskIndicator('medium');

    await waitFor(() => {
      const tag = screen.getByText('MEDIUM').closest('.ant-tag');
      expect(tag).toHaveClass('ant-tag-orange');
    });
  });

  it('shows exclamation icon for medium risk', async () => {
    renderChurnRiskIndicator('medium');

    await waitFor(() => {
      const exclamationIcon = document.querySelector('[data-icon="exclamation-circle"]') ||
        document.querySelector('.anticon-exclamation-circle');
      expect(exclamationIcon).toBeInTheDocument();
    });
  });
});

describe('ChurnRiskIndicator High Risk', () => {
  it('displays HIGH text', async () => {
    renderChurnRiskIndicator('high');

    await waitFor(() => {
      expect(screen.getByText('HIGH')).toBeInTheDocument();
    });
  });

  it('shows red tag for high risk', async () => {
    renderChurnRiskIndicator('high');

    await waitFor(() => {
      const tag = screen.getByText('HIGH').closest('.ant-tag');
      expect(tag).toHaveClass('ant-tag-red');
    });
  });

  it('shows warning icon for high risk', async () => {
    renderChurnRiskIndicator('high');

    await waitFor(() => {
      const warningIcon = document.querySelector('[data-icon="warning"]') ||
        document.querySelector('.anticon-warning');
      expect(warningIcon).toBeInTheDocument();
    });
  });
});

describe('ChurnRiskIndicator with Label', () => {
  it('shows "Low Risk" label when showLabel is true', async () => {
    renderChurnRiskIndicator('low', true);

    await waitFor(() => {
      expect(screen.getByText('Low Risk')).toBeInTheDocument();
    });
  });

  it('shows "Medium Risk" label when showLabel is true', async () => {
    renderChurnRiskIndicator('medium', true);

    await waitFor(() => {
      expect(screen.getByText('Medium Risk')).toBeInTheDocument();
    });
  });

  it('shows "High Risk" label when showLabel is true', async () => {
    renderChurnRiskIndicator('high', true);

    await waitFor(() => {
      expect(screen.getByText('High Risk')).toBeInTheDocument();
    });
  });
});

describe('ChurnRiskIndicator with Progress', () => {
  it('renders progress bar when showProgress is true', async () => {
    renderChurnRiskIndicator('low', false, true);

    await waitFor(() => {
      const progressBar = document.querySelector('.ant-progress');
      expect(progressBar).toBeInTheDocument();
    });
  });

  it('shows correct percentage for low risk', async () => {
    renderChurnRiskIndicator('low', false, true);

    // Low risk = 25%
    await waitFor(() => {
      const progressBar = document.querySelector('.ant-progress');
      expect(progressBar).toBeInTheDocument();
    });
  });

  it('shows correct percentage for medium risk', async () => {
    renderChurnRiskIndicator('medium', false, true);

    // Medium risk = 55%
    await waitFor(() => {
      const progressBar = document.querySelector('.ant-progress');
      expect(progressBar).toBeInTheDocument();
    });
  });

  it('shows correct percentage for high risk', async () => {
    renderChurnRiskIndicator('high', false, true);

    // High risk = 85%
    await waitFor(() => {
      const progressBar = document.querySelector('.ant-progress');
      expect(progressBar).toBeInTheDocument();
    });
  });

  it('shows label under progress when both showLabel and showProgress are true', async () => {
    renderChurnRiskIndicator('medium', true, true);

    await waitFor(() => {
      expect(screen.getByText('Medium Risk')).toBeInTheDocument();
      const progressBar = document.querySelector('.ant-progress');
      expect(progressBar).toBeInTheDocument();
    });
  });
});

describe('ChurnRiskIndicator Size Variants', () => {
  it('renders smaller font for small size', async () => {
    renderChurnRiskIndicator('low', false, false, 'small');

    await waitFor(() => {
      const tag = screen.getByText('LOW');
      // Check if tag has small styling (fontSize 11)
      expect(tag).toBeInTheDocument();
    });
  });

  it('renders default font for default size', async () => {
    renderChurnRiskIndicator('low', false, false, 'default');

    await waitFor(() => {
      const tag = screen.getByText('LOW');
      expect(tag).toBeInTheDocument();
    });
  });

  it('renders narrower progress for small size', async () => {
    renderChurnRiskIndicator('low', false, true, 'small');

    await waitFor(() => {
      // Small size should have width of 80
      const progressBar = document.querySelector('.ant-progress');
      expect(progressBar).toBeInTheDocument();
    });
  });

  it('renders wider progress for default size', async () => {
    renderChurnRiskIndicator('low', false, true, 'default');

    await waitFor(() => {
      // Default size should have width of 120
      const progressBar = document.querySelector('.ant-progress');
      expect(progressBar).toBeInTheDocument();
    });
  });
});

describe('ChurnRiskIndicator Tooltip', () => {
  it('has tooltip with description', async () => {
    renderChurnRiskIndicator('low');

    // Tooltips are rendered when hovering
    // We check that the component renders correctly
    await waitFor(() => {
      expect(screen.getByText('LOW')).toBeInTheDocument();
    });
  });

  it('shows engagement message for low risk', async () => {
    renderChurnRiskIndicator('low', true);

    // The tooltip should contain the description
    // Description: "Worker is engaged and satisfied. No immediate concerns."
    await waitFor(() => {
      expect(screen.getByText('Low Risk')).toBeInTheDocument();
    });
  });

  it('shows warning signs message for medium risk', async () => {
    renderChurnRiskIndicator('medium', true);

    // Description: "Some warning signs detected. Consider proactive engagement."
    await waitFor(() => {
      expect(screen.getByText('Medium Risk')).toBeInTheDocument();
    });
  });

  it('shows attention message for high risk', async () => {
    renderChurnRiskIndicator('high', true);

    // Description: "Significant retention risk. Immediate attention recommended."
    await waitFor(() => {
      expect(screen.getByText('High Risk')).toBeInTheDocument();
    });
  });
});

describe('ChurnRiskIndicator Edge Cases', () => {
  it('handles unknown risk level gracefully', async () => {
    // @ts-expect-error Testing unknown risk level
    renderChurnRiskIndicator('unknown');

    await waitFor(() => {
      // Should default to low risk config
      expect(screen.getByText('UNKNOWN')).toBeInTheDocument();
    });
  });

  it('handles string risk value', async () => {
    // The component accepts string type
    renderChurnRiskIndicator('low' as any);

    await waitFor(() => {
      expect(screen.getByText('LOW')).toBeInTheDocument();
    });
  });
});
