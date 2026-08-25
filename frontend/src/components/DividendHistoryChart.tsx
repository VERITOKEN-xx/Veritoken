import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useNetworkStore } from '../stores/useNetworkStore';
import { useEventQuery } from '../hooks/useEventQuery';
import { formatUnits, formatTimestamp } from '../utils/formatters';
import { ErrorBoundary } from './ErrorBoundary';

interface DistributionEvent {
  ledger: number;
  timestamp: number;
  amount: string;
  claimed: boolean;
  checkpoint: number;
}

interface DividendHistoryChartProps {
  walletAddress: string | null;
}

const fetchPropertyContracts = () => {
  const { contracts } = useNetworkStore.getState();
  return contracts.filter((c) => c.type === 'property');
};

const fetchDistributions = async (walletAddress: string): Promise<DistributionEvent[]> => {
  const propertyContracts = fetchPropertyContracts();
  const allEvents: DistributionEvent[] = [];

  for (const contract of propertyContracts) {
    try {
      const balance = await useEventQuery(
        contract.id,
        'DistributionCheckpoint',
        { fromLedger: 0, toLedger: 'latest' }
      );
      
      for (const event of balance) {
        if (event.data.recipient === walletAddress || event.data.holder === walletAddress) {
          allEvents.push({
            ledger: event.ledger,
            timestamp: event.timestamp,
            amount: event.data.amount.toString(),
            claimed: event.data.claimed === true,
            checkpoint: event.data.checkpoint,
          });
        }
      }
    } catch (error) {
      console.warn(`Failed to fetch distributions for ${contract.id}:`, error);
    }
  }

  return allEvents.sort((a, b) => a.timestamp - b.timestamp);
};

const DividendHistoryChartInner: React.FC<DividendHistoryChartProps> = ({ walletAddress }) => {
  const [timeRange, setTimeRange] = useState<'all' | '90d'>('all');
  const now = Date.now();
  const ninetyDaysAgo = now - 90 * 24 * 60 * 60 * 1000;

  const { data: distributions, isLoading, error } = useQuery({
    queryKey: ['dividendHistory', walletAddress],
    queryFn: () => fetchDistributions(walletAddress!),
    enabled: !!walletAddress,
  });

  if (!walletAddress) {
    return (
      <div className="card dividend-history" role="region" aria-label="Dividend history">
        <h2>Dividend History</h2>
        <p className="placeholder">Connect wallet to view dividend history</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="card dividend-history" role="region" aria-label="Dividend history" aria-busy="true">
        <h2>Dividend History</h2>
        <div className="skeleton-loader" aria-hidden="true" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="card dividend-history" role="region" aria-label="Dividend history">
        <h2>Dividend History</h2>
        <p className="error" role="alert">Failed to load dividend history: {(error as Error).message}</p>
      </div>
    );
  }

  const filteredDistributions = distributions?.filter((d) =>
    timeRange === 'all' ? true : d.timestamp >= ninetyDaysAgo
  ) || [];

  const chartData = filteredDistributions.map((d) => ({
    time: formatTimestamp(d.timestamp),
    timestamp: d.timestamp,
    amount: Number(formatUnits(d.amount, 18)),
    claimed: d.claimed,
    checkpoint: d.checkpoint,
    ledger: d.ledger,
  }));

  const unclaimedData = chartData.filter((d) => !d.claimed);
  const claimedData = chartData.filter((d) => d.claimed);

  return (
    <div className="card dividend-history" role="region" aria-label="Dividend history">
      <div className="card-header">
        <h2>Dividend History</h2>
        <div className="time-range-toggle" role="group" aria-label="Time range">
          <button
            className={timeRange === 'all' ? 'active' : ''}
            onClick={() => setTimeRange('all')}
            onKeyDown={(e) => e.key === 'Enter' && setTimeRange('all')}
            aria-pressed={timeRange === 'all'}
          >
            All Time
          </button>
          <button
            className={timeRange === '90d' ? 'active' : ''}
            onClick={() => setTimeRange('90d')}
            onKeyDown={(e) => e.key === 'Enter' && setTimeRange('90d')}
            aria-pressed={timeRange === '90d'}
          >
            Last 90 Days
          </button>
        </div>
      </div>
      {chartData.length > 0 && (
        <div className="chart-container" role="img" aria-label="Dividend distributions over time">
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="claimedGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="unclaimedGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="time" tickFormatter={(value) => value} />
              <YAxis tickFormatter={(value) => value.toLocaleString()} />
              <Tooltip
                formatter={(value: number, name: string) => [
                  value.toLocaleString(),
                  name === 'amount' ? 'Claimed Amount' : 'Unclaimed Amount',
                ]}
                labelFormatter={(timestamp) => new Date(timestamp).toLocaleString()}
              />
              <Legend />
              {claimedData.length > 0 && (
                <Area
                  type="monotone"
                  dataKey="amount"
                  data={claimedData}
                  stroke="#10b981"
                  fillOpacity={1}
                  fill="url(#claimedGradient)"
                  name="Claimed"
                />
              )}
              {unclaimedData.length > 0 && (
                <Area
                  type="monotone"
                  dataKey="amount"
                  data={unclaimedData}
                  stroke="#f59e0b"
                  fillOpacity={1}
                  fill="url(#unclaimedGradient)"
                  name="Unclaimed"
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      {chartData.length === 0 && (
        <p className="empty-state">No dividend distributions found for the selected period</p>
      )}
    </div>
  );
};

export const DividendHistoryChart: React.FC<DividendHistoryChartProps> = (props) => (
  <ErrorBoundary fallback={<div className="card dividend-history error" role="alert">Dividend History failed to load</div>}>
    <DividendHistoryChartInner {...props} />
  </ErrorBoundary>
);
