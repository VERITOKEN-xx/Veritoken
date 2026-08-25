import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useNetworkStore } from '../stores/useNetworkStore';
import { readCall } from '../utils/contractCalls';
import { formatUnits } from '../utils/formatters';
import { ErrorBoundary } from './ErrorBoundary';

interface BalanceResult {
  contractId: string;
  assetType: 'property' | 'invoice' | 'carbon' | 'rwa';
  balance: string;
  symbol: string;
}

interface PortfolioSummaryCardProps {
  walletAddress: string | null;
}

const ASSET_TYPE_COLORS = {
  property: '#3b82f6',
  invoice: '#10b981',
  carbon: '#f59e0b',
  rwa: '#8b5cf6',
};

const fetchBalances = async (walletAddress: string): Promise<BalanceResult[]> => {
  const { contracts } = useNetworkStore.getState();
  const results: BalanceResult[] = [];

  for (const contract of contracts) {
    try {
      const balance = await readCall(contract.id, 'balance', [walletAddress]);
      const symbol = await readCall(contract.id, 'symbol', []);
      const balanceStr = balance.toString();
      if (BigInt(balanceStr) > 0n) {
        results.push({
          contractId: contract.id,
          assetType: contract.type,
          balance: balanceStr,
          symbol: symbol as string,
        });
      }
    } catch (error) {
      console.warn(`Failed to fetch balance for ${contract.id}:`, error);
    }
  }

  return results;
};

const PortfolioSummaryCardInner: React.FC<PortfolioSummaryCardProps> = ({ walletAddress }) => {
  const { data: balances, isLoading, error } = useQuery({
    queryKey: ['portfolioBalances', walletAddress],
    queryFn: () => fetchBalances(walletAddress!),
    enabled: !!walletAddress,
  });

  if (!walletAddress) {
    return (
      <div className="card portfolio-summary" role="region" aria-label="Portfolio summary">
        <h2>Portfolio Summary</h2>
        <p className="placeholder">Connect wallet to view portfolio</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="card portfolio-summary" role="region" aria-label="Portfolio summary" aria-busy="true">
        <h2>Portfolio Summary</h2>
        <div className="skeleton-loader" aria-hidden="true" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="card portfolio-summary" role="region" aria-label="Portfolio summary">
        <h2>Portfolio Summary</h2>
        <p className="error" role="alert">Failed to load portfolio: {(error as Error).message}</p>
      </div>
    );
  }

  const totalPositions = balances.length;
  const groupedByType = balances.reduce((acc, b) => {
    acc[b.assetType] = (acc[b.assetType] || 0n) + BigInt(b.balance);
    return acc;
  }, {} as Record<string, bigint>);

  const chartData = Object.entries(groupedByType).map(([type, total]) => ({
    name: type.charAt(0).toUpperCase() + type.slice(1),
    value: Number(formatUnits(total, 18)),
    color: ASSET_TYPE_COLORS[type as keyof typeof ASSET_TYPE_COLORS] || '#6b7280',
  }));

  return (
    <div className="card portfolio-summary" role="region" aria-label="Portfolio summary">
      <h2>Portfolio Summary</h2>
      <div className="summary-stats">
        <div className="stat">
          <span className="stat-value">{totalPositions}</span>
          <span className="stat-label">Token Positions</span>
        </div>
        {Object.entries(groupedByType).map(([type, total]) => (
          <div key={type} className="stat">
            <span className="stat-value">{formatUnits(total, 18)}</span>
            <span className="stat-label">Total {type.charAt(0).toUpperCase() + type.slice(1)}</span>
          </div>
        ))}
      </div>
      {chartData.length > 0 && (
        <div className="chart-container" role="img" aria-label="Portfolio breakdown by asset type">
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
                dataKey="value"
                nameKey="name"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(1)}%`}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => [value.toLocaleString(), '']} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
      {chartData.length === 0 && (
        <p className="empty-state">No token positions found</p>
      )}
    </div>
  );
};

export const PortfolioSummaryCard: React.FC<PortfolioSummaryCardProps> = (props) => (
  <ErrorBoundary fallback={<div className="card portfolio-summary error" role="alert">Portfolio Summary failed to load</div>}>
    <PortfolioSummaryCardInner {...props} />
  </ErrorBoundary>
);
