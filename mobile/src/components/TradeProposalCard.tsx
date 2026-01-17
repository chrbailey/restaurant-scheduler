import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { format, parseISO } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { TradeProposal } from '../services/api';

/**
 * TradeProposalCard Component
 *
 * Displays a trade proposal with both shifts shown side-by-side.
 * Supports incoming (received) and outgoing (sent) proposal views.
 */

interface TradeProposalCardProps {
  proposal: TradeProposal;
  type: 'incoming' | 'outgoing';
  onAccept?: () => void;
  onReject?: () => void;
  isAccepting?: boolean;
  isRejecting?: boolean;
}

export default function TradeProposalCard({
  proposal,
  type,
  onAccept,
  onReject,
  isAccepting = false,
  isRejecting = false,
}: TradeProposalCardProps) {
  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'PENDING':
        return { color: '#f59e0b', bg: '#f59e0b20', label: 'Pending' };
      case 'ACCEPTED':
        return { color: '#22c55e', bg: '#22c55e20', label: 'Accepted' };
      case 'REJECTED':
        return { color: '#ef4444', bg: '#ef444420', label: 'Rejected' };
      case 'EXPIRED':
        return { color: '#666', bg: '#66666620', label: 'Expired' };
      case 'CANCELLED':
        return { color: '#888', bg: '#88888820', label: 'Cancelled' };
      default:
        return { color: '#666', bg: '#66666620', label: status };
    }
  };

  const statusStyle = getStatusStyle(proposal.status);

  // Determine which shift is "theirs" and which is "yours"
  const theirShift = proposal.offer.shift;
  const yourShift = proposal.proposedShift;

  // For incoming proposals, the proposer wants YOUR shift (the offer) and is giving their shift
  // For outgoing proposals, you are the proposer offering your shift for their offer
  const leftShift = type === 'incoming' ? yourShift : theirShift;
  const rightShift = type === 'incoming' ? theirShift : yourShift;
  const leftLabel = type === 'incoming' ? "They're offering" : "They're trading";
  const rightLabel = type === 'incoming' ? 'For your shift' : 'Your offer';

  const formatShiftTime = (startTime: string, endTime: string) => {
    const start = parseISO(startTime);
    const end = parseISO(endTime);
    return `${format(start, 'h:mm a')} - ${format(end, 'h:mm a')}`;
  };

  const isPending = proposal.status === 'PENDING';

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {type === 'incoming' ? (
            <>
              <View style={styles.proposerAvatar}>
                <Text style={styles.proposerAvatarText}>
                  {proposal.proposer.firstName[0]}
                </Text>
              </View>
              <Text style={styles.proposerName}>
                {proposal.proposer.firstName} {proposal.proposer.lastName}
              </Text>
            </>
          ) : (
            <Text style={styles.proposerName}>
              To: {proposal.offer.worker.firstName}{' '}
              {proposal.offer.worker.lastName}
            </Text>
          )}
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
          <Text style={[styles.statusText, { color: statusStyle.color }]}>
            {statusStyle.label}
          </Text>
        </View>
      </View>

      {/* Shifts Comparison */}
      <View style={styles.shiftsContainer}>
        {/* Left Shift */}
        <View style={styles.shiftColumn}>
          <Text style={styles.shiftLabel}>{leftLabel}</Text>
          <View style={styles.shiftCard}>
            <Text style={styles.shiftPosition}>{leftShift.position}</Text>
            <Text style={styles.shiftDate}>
              {format(parseISO(leftShift.startTime), 'EEE, MMM d')}
            </Text>
            <Text style={styles.shiftTime}>
              {formatShiftTime(leftShift.startTime, leftShift.endTime)}
            </Text>
            <Text style={styles.shiftRestaurant}>
              {leftShift.restaurant.name}
            </Text>
          </View>
        </View>

        {/* Arrow */}
        <View style={styles.arrowContainer}>
          <Ionicons name="swap-horizontal" size={24} color="#4a90d9" />
        </View>

        {/* Right Shift */}
        <View style={styles.shiftColumn}>
          <Text style={styles.shiftLabel}>{rightLabel}</Text>
          <View style={[styles.shiftCard, styles.shiftCardHighlighted]}>
            <Text style={styles.shiftPosition}>{rightShift.position}</Text>
            <Text style={styles.shiftDate}>
              {format(parseISO(rightShift.startTime), 'EEE, MMM d')}
            </Text>
            <Text style={styles.shiftTime}>
              {formatShiftTime(rightShift.startTime, rightShift.endTime)}
            </Text>
            <Text style={styles.shiftRestaurant}>
              {rightShift.restaurant.name}
            </Text>
          </View>
        </View>
      </View>

      {/* Message */}
      {proposal.message && (
        <View style={styles.messageContainer}>
          <Ionicons name="chatbubble-outline" size={14} color="#888" />
          <Text style={styles.messageText}>"{proposal.message}"</Text>
        </View>
      )}

      {/* Status Message */}
      {type === 'outgoing' && proposal.status === 'PENDING' && (
        <View style={styles.waitingContainer}>
          <Ionicons name="time-outline" size={14} color="#f59e0b" />
          <Text style={styles.waitingText}>Waiting for their response</Text>
        </View>
      )}

      {type === 'outgoing' && proposal.status === 'REJECTED' && proposal.rejectionReason && (
        <View style={styles.rejectionContainer}>
          <Text style={styles.rejectionLabel}>Rejection reason:</Text>
          <Text style={styles.rejectionText}>{proposal.rejectionReason}</Text>
        </View>
      )}

      {/* Actions for incoming pending proposals */}
      {type === 'incoming' && isPending && onAccept && onReject && (
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.rejectButton}
            onPress={onReject}
            disabled={isAccepting || isRejecting}
          >
            {isRejecting ? (
              <ActivityIndicator color="#ef4444" size="small" />
            ) : (
              <>
                <Ionicons name="close" size={18} color="#ef4444" />
                <Text style={styles.rejectButtonText}>Decline</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.acceptButton}
            onPress={onAccept}
            disabled={isAccepting || isRejecting}
          >
            {isAccepting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="checkmark" size={18} color="#fff" />
                <Text style={styles.acceptButtonText}>Accept Trade</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Timestamp */}
      <View style={styles.footer}>
        <Text style={styles.timestamp}>
          {proposal.status === 'PENDING'
            ? `Proposed ${format(parseISO(proposal.createdAt), 'MMM d, h:mm a')}`
            : proposal.respondedAt
              ? `${statusStyle.label} ${format(parseISO(proposal.respondedAt), 'MMM d, h:mm a')}`
              : format(parseISO(proposal.createdAt), 'MMM d, h:mm a')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  proposerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#4a90d9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  proposerAvatarText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  proposerName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // Shifts
  shiftsContainer: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: 16,
  },
  shiftColumn: {
    flex: 1,
  },
  shiftLabel: {
    color: '#666',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
    textAlign: 'center',
  },
  shiftCard: {
    backgroundColor: '#0f0f23',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#2a2a4e',
  },
  shiftCardHighlighted: {
    borderColor: '#4a90d950',
    backgroundColor: '#4a90d910',
  },
  shiftPosition: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  shiftDate: {
    color: '#4a90d9',
    fontSize: 12,
    marginBottom: 2,
  },
  shiftTime: {
    color: '#888',
    fontSize: 11,
    marginBottom: 4,
  },
  shiftRestaurant: {
    color: '#666',
    fontSize: 10,
  },
  // Arrow
  arrowContainer: {
    width: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Message
  messageContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#0f0f23',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  messageText: {
    flex: 1,
    color: '#888',
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  // Waiting
  waitingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  waitingText: {
    color: '#f59e0b',
    fontSize: 13,
  },
  // Rejection
  rejectionContainer: {
    backgroundColor: '#ef444410',
    padding: 10,
    borderRadius: 6,
    marginBottom: 12,
  },
  rejectionLabel: {
    color: '#ef4444',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  rejectionText: {
    color: '#888',
    fontSize: 13,
    lineHeight: 18,
  },
  // Actions
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  rejectButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#ef444420',
  },
  rejectButtonText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '600',
  },
  acceptButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#22c55e',
  },
  acceptButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  // Footer
  footer: {
    borderTopWidth: 1,
    borderTopColor: '#2a2a4e',
    paddingTop: 10,
  },
  timestamp: {
    color: '#666',
    fontSize: 11,
    textAlign: 'center',
  },
});
