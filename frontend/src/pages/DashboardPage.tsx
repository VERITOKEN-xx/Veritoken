import React from 'react';
import { PortfolioSummaryCard } from '../components/PortfolioSummaryCard';
import { DividendHistoryChart } from '../components/DividendHistoryChart';
import { KycExpiryPanel } from '../components/KycExpiryPanel';
import { ComplianceAlertTimeline } from '../components/ComplianceAlertTimeline';
import { InvoicePortfolioTable } from '../components/InvoicePortfolioTable';
import { useWallet } from '../hooks/useWallet';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const DashboardContent: React.FC = () => {
  const { address, isConnected } = useWallet();

  if (!isConnected) {
    return (
      <div className="dashboard-page" role="main">
        <h1>Portfolio Dashboard</h1>
        <p className="connect-prompt">Please connect your wallet to view portfolio analytics.</p>
        <div className="dashboard-grid" aria-label="Dashboard cards (wallet not connected)">
          <PortfolioSummaryCard walletAddress={null} />
          <DividendHistoryChart walletAddress={null} />
          <KycExpiryPanel walletAddress={null} />
          <ComplianceAlertTimeline />
          <InvoicePortfolioTable walletAddress={null} />
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-page" role="main">
      <header className="dashboard-header">
        <h1>Portfolio Dashboard</h1>
        <p className="wallet-address" aria-label="Connected wallet">{address}</p>
      </header>
      <div className="dashboard-grid" aria-label="Dashboard cards">
        <PortfolioSummaryCard walletAddress={address} />
        <DividendHistoryChart walletAddress={address} />
        <KycExpiryPanel walletAddress={address} />
        <ComplianceAlertTimeline />
        <InvoicePortfolioTable walletAddress={address} />
      </div>
    </div>
  );
};

export const DashboardPage: React.FC = () => (
  <QueryClientProvider client={queryClient}>
    <DashboardContent />
    <ReactQueryDevtools initialIsOpen={false} />
  </QueryClientProvider>
);

export default DashboardPage;
