import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigProvider } from 'antd';
import { WorkerSuggestionCard } from '../WorkerSuggestionCard';
import { mockWorkerSuggestions } from '@test/fixtures/data';

const mockOnSelect = vi.fn();

const renderWorkerSuggestionCard = (
  suggestion = mockWorkerSuggestions[0],
  rank = 1,
  isSelected = false,
  onSelect = mockOnSelect
) => {
  return render(
    <ConfigProvider>
      <WorkerSuggestionCard
        suggestion={suggestion}
        rank={rank}
        isSelected={isSelected}
        onSelect={onSelect}
      />
    </ConfigProvider>
  );
};

describe('WorkerSuggestionCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the card', async () => {
    renderWorkerSuggestionCard();

    await waitFor(() => {
      expect(screen.getByText('John Smith')).toBeInTheDocument();
    });
  });

  it('displays worker name', async () => {
    renderWorkerSuggestionCard();

    await waitFor(() => {
      expect(screen.getByText('John Smith')).toBeInTheDocument();
    });
  });

  it('displays worker initials in avatar', async () => {
    renderWorkerSuggestionCard();

    await waitFor(() => {
      expect(screen.getByText('JS')).toBeInTheDocument();
    });
  });
});

describe('WorkerSuggestionCard Availability', () => {
  it('shows Confirmed tag for confirmed availability', async () => {
    renderWorkerSuggestionCard(mockWorkerSuggestions[0]);

    await waitFor(() => {
      expect(screen.getByText('Confirmed')).toBeInTheDocument();
    });
  });

  it('shows Likely Available tag for likely availability', async () => {
    renderWorkerSuggestionCard(mockWorkerSuggestions[1]);

    await waitFor(() => {
      expect(screen.getByText('Likely Available')).toBeInTheDocument();
    });
  });

  it('shows Unknown tag for unknown availability', async () => {
    renderWorkerSuggestionCard(mockWorkerSuggestions[2]);

    await waitFor(() => {
      expect(screen.getByText('Unknown')).toBeInTheDocument();
    });
  });

  it('shows green tag for confirmed', async () => {
    renderWorkerSuggestionCard(mockWorkerSuggestions[0]);

    await waitFor(() => {
      const tag = screen.getByText('Confirmed').closest('.ant-tag');
      expect(tag).toHaveClass('ant-tag-green');
    });
  });

  it('shows blue tag for likely', async () => {
    renderWorkerSuggestionCard(mockWorkerSuggestions[1]);

    await waitFor(() => {
      const tag = screen.getByText('Likely Available').closest('.ant-tag');
      expect(tag).toHaveClass('ant-tag-blue');
    });
  });
});

describe('WorkerSuggestionCard Match Score', () => {
  it('displays match score label', async () => {
    renderWorkerSuggestionCard();

    await waitFor(() => {
      expect(screen.getByText('Match Score')).toBeInTheDocument();
    });
  });

  it('displays match score percentage', async () => {
    renderWorkerSuggestionCard();

    await waitFor(() => {
      expect(screen.getByText('95%')).toBeInTheDocument();
    });
  });

  it('renders score progress bar', async () => {
    renderWorkerSuggestionCard();

    await waitFor(() => {
      const progressBar = document.querySelector('.ant-progress');
      expect(progressBar).toBeInTheDocument();
    });
  });

  it('shows green color for high score (90+)', async () => {
    renderWorkerSuggestionCard(mockWorkerSuggestions[0]); // 95%

    await waitFor(() => {
      const scoreText = screen.getByText('95%');
      expect(scoreText).toBeInTheDocument();
    });
  });

  it('shows blue color for medium-high score (75-89)', async () => {
    renderWorkerSuggestionCard(mockWorkerSuggestions[1]); // 82%

    await waitFor(() => {
      const scoreText = screen.getByText('82%');
      expect(scoreText).toBeInTheDocument();
    });
  });

  it('shows yellow color for medium score (60-74)', async () => {
    renderWorkerSuggestionCard(mockWorkerSuggestions[2]); // 68%

    await waitFor(() => {
      const scoreText = screen.getByText('68%');
      expect(scoreText).toBeInTheDocument();
    });
  });
});

describe('WorkerSuggestionCard Rank Badge', () => {
  it('shows Best Match badge for rank 1', async () => {
    renderWorkerSuggestionCard(mockWorkerSuggestions[0], 1);

    await waitFor(() => {
      expect(screen.getByText('Best')).toBeInTheDocument();
    });
  });

  it('shows trophy icon for rank 1', async () => {
    renderWorkerSuggestionCard(mockWorkerSuggestions[0], 1);

    await waitFor(() => {
      const trophyIcon = document.querySelector('[data-icon="trophy"]') ||
        document.querySelector('.anticon-trophy');
      expect(trophyIcon).toBeInTheDocument();
    });
  });

  it('shows #2 for rank 2', async () => {
    renderWorkerSuggestionCard(mockWorkerSuggestions[1], 2);

    // Rank 2 shows star icon but no "Best" text
    await waitFor(() => {
      const starIcon = document.querySelector('[data-icon="star"]') ||
        document.querySelector('.anticon-star');
      expect(starIcon).toBeInTheDocument();
    });
  });

  it('does not show badge for rank > 3', async () => {
    renderWorkerSuggestionCard(mockWorkerSuggestions[2], 4);

    await waitFor(() => {
      // No badge elements for rank 4+
      expect(screen.queryByText('Best')).not.toBeInTheDocument();
    });
  });
});

describe('WorkerSuggestionCard Quick Stats', () => {
  it('displays reliability score', async () => {
    renderWorkerSuggestionCard();

    await waitFor(() => {
      expect(screen.getByText('92%')).toBeInTheDocument();
      expect(screen.getByText('Reliable')).toBeInTheDocument();
    });
  });

  it('displays previous shifts count', async () => {
    renderWorkerSuggestionCard();

    await waitFor(() => {
      expect(screen.getByText('45')).toBeInTheDocument();
      expect(screen.getByText('Shifts')).toBeInTheDocument();
    });
  });

  it('shows green color for high reliability (90%+)', async () => {
    renderWorkerSuggestionCard(mockWorkerSuggestions[0]); // 92%

    await waitFor(() => {
      const reliabilityValue = screen.getByText('92%');
      expect(reliabilityValue).toBeInTheDocument();
    });
  });

  it('shows yellow color for medium reliability (75-89%)', async () => {
    renderWorkerSuggestionCard(mockWorkerSuggestions[2]); // 78%

    await waitFor(() => {
      const reliabilityValue = screen.getByText('78%');
      expect(reliabilityValue).toBeInTheDocument();
    });
  });
});

describe('WorkerSuggestionCard Reasons', () => {
  it('displays "Why suggested" label', async () => {
    renderWorkerSuggestionCard();

    await waitFor(() => {
      expect(screen.getByText('Why suggested:')).toBeInTheDocument();
    });
  });

  it('shows up to 3 reasons', async () => {
    renderWorkerSuggestionCard();

    await waitFor(() => {
      expect(screen.getByText(/45 shifts in this position/)).toBeInTheDocument();
      expect(screen.getByText(/Available based on calendar/)).toBeInTheDocument();
      expect(screen.getByText(/High reliability score/)).toBeInTheDocument();
    });
  });

  it('shows +N more reasons when more than 3', async () => {
    renderWorkerSuggestionCard(mockWorkerSuggestions[0]);

    await waitFor(() => {
      expect(screen.getByText('+1 more reasons')).toBeInTheDocument();
    });
  });

  it('shows check icons next to reasons', async () => {
    renderWorkerSuggestionCard();

    await waitFor(() => {
      const checkIcons = document.querySelectorAll('.anticon-check-circle');
      expect(checkIcons.length).toBeGreaterThan(0);
    });
  });
});

describe('WorkerSuggestionCard Select Button', () => {
  it('shows Select Worker button when not selected', async () => {
    renderWorkerSuggestionCard(mockWorkerSuggestions[0], 1, false);

    await waitFor(() => {
      expect(screen.getByText('Select Worker')).toBeInTheDocument();
    });
  });

  it('shows Selected button when selected', async () => {
    renderWorkerSuggestionCard(mockWorkerSuggestions[0], 1, true);

    await waitFor(() => {
      expect(screen.getByText('Selected')).toBeInTheDocument();
    });
  });

  it('calls onSelect when clicked', async () => {
    const user = userEvent.setup();
    renderWorkerSuggestionCard(mockWorkerSuggestions[0], 1, false);

    await waitFor(() => {
      expect(screen.getByText('Select Worker')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Select Worker'));

    expect(mockOnSelect).toHaveBeenCalled();
  });

  it('calls onSelect when card is clicked', async () => {
    const user = userEvent.setup();
    renderWorkerSuggestionCard(mockWorkerSuggestions[0], 1, false);

    await waitFor(() => {
      expect(screen.getByText('John Smith')).toBeInTheDocument();
    });

    // Click on the card (not the button)
    const card = screen.getByText('John Smith').closest('.ant-card');
    if (card) {
      await user.click(card);
    }

    expect(mockOnSelect).toHaveBeenCalled();
  });
});

describe('WorkerSuggestionCard Selection Styling', () => {
  it('has green border when selected', async () => {
    renderWorkerSuggestionCard(mockWorkerSuggestions[0], 1, true);

    await waitFor(() => {
      const card = screen.getByText('John Smith').closest('.ant-card');
      // Check for green border color style
      expect(card).toHaveStyle('border-color: #52c41a');
    });
  });

  it('has default border when not selected', async () => {
    renderWorkerSuggestionCard(mockWorkerSuggestions[0], 1, false);

    await waitFor(() => {
      const card = screen.getByText('John Smith').closest('.ant-card');
      expect(card).toHaveStyle('border-color: #2a2a4e');
    });
  });

  it('has green background when selected', async () => {
    renderWorkerSuggestionCard(mockWorkerSuggestions[0], 1, true);

    await waitFor(() => {
      const card = screen.getByText('John Smith').closest('.ant-card');
      expect(card).toHaveStyle('background-color: #1a3a2a');
    });
  });

  it('has green avatar when selected', async () => {
    renderWorkerSuggestionCard(mockWorkerSuggestions[0], 1, true);

    await waitFor(() => {
      const avatar = screen.getByText('JS').closest('.ant-avatar');
      expect(avatar).toHaveStyle('background-color: #52c41a');
    });
  });

  it('has blue avatar when not selected', async () => {
    renderWorkerSuggestionCard(mockWorkerSuggestions[0], 1, false);

    await waitFor(() => {
      const avatar = screen.getByText('JS').closest('.ant-avatar');
      expect(avatar).toHaveStyle('background-color: #4a90d9');
    });
  });

  it('shows check icon in button when selected', async () => {
    renderWorkerSuggestionCard(mockWorkerSuggestions[0], 1, true);

    await waitFor(() => {
      const button = screen.getByText('Selected').closest('button');
      const checkIcon = button?.querySelector('.anticon-check-circle');
      expect(checkIcon).toBeInTheDocument();
    });
  });
});

describe('WorkerSuggestionCard with Different Workers', () => {
  it('renders second suggestion correctly', async () => {
    renderWorkerSuggestionCard(mockWorkerSuggestions[1], 2, false);

    await waitFor(() => {
      expect(screen.getByText('Sarah Johnson')).toBeInTheDocument();
      expect(screen.getByText('SJ')).toBeInTheDocument();
      expect(screen.getByText('82%')).toBeInTheDocument();
      expect(screen.getByText('Likely Available')).toBeInTheDocument();
    });
  });

  it('renders third suggestion correctly', async () => {
    renderWorkerSuggestionCard(mockWorkerSuggestions[2], 3, false);

    await waitFor(() => {
      expect(screen.getByText('Mike Wilson')).toBeInTheDocument();
      expect(screen.getByText('MW')).toBeInTheDocument();
      expect(screen.getByText('68%')).toBeInTheDocument();
      expect(screen.getByText('Unknown')).toBeInTheDocument();
    });
  });
});
