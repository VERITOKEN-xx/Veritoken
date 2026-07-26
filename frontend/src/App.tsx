import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import InvoicePage from "./pages/InvoicePage";
import PropertyPage from "./pages/PropertyPage";
import CarbonPage from "./pages/CarbonPage";
import KycPage from "./pages/KycPage";
import AdminPage from "./pages/AdminPage";
import DeployPage from "./pages/DeployPage";
import DocsPage from "./pages/DocsPage";
import ErrorBoundary from "./components/ErrorBoundary";
import SimulationErrorBoundary from "./components/SimulationErrorBoundary";
import { ToastProvider } from "./lib/toast";

export default function App() {
  return (
    <ToastProvider>
      <Layout>
        <Routes>
          {/* Dashboard uses the generic boundary – no simulation on load */}
          <Route path="/" element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />

          {/* Contract-interaction pages use SimulationErrorBoundary so that
              failed simulations show a recovery UI rather than a blank screen. */}
          <Route
            path="/invoices"
            element={
              <SimulationErrorBoundary>
                <InvoicePage />
              </SimulationErrorBoundary>
            }
          />
          <Route
            path="/property"
            element={
              <SimulationErrorBoundary>
                <PropertyPage />
              </SimulationErrorBoundary>
            }
          />
          <Route
            path="/carbon"
            element={
              <SimulationErrorBoundary>
                <CarbonPage />
              </SimulationErrorBoundary>
            }
          />
          <Route
            path="/kyc"
            element={
              <SimulationErrorBoundary>
                <KycPage />
              </SimulationErrorBoundary>
            }
          />
          <Route
            path="/admin"
            element={
              <SimulationErrorBoundary>
                <AdminPage />
              </SimulationErrorBoundary>
            }
          />
          <Route path="/deploy" element={<ErrorBoundary><DeployPage /></ErrorBoundary>} />
          <Route path="/docs"   element={<ErrorBoundary><DocsPage /></ErrorBoundary>} />
        </Routes>
      </Layout>
    </ToastProvider>
  );
}
