import { type ReactNode } from "react";
import { useWallet } from "../lib/wallet";
import WalletSelectorModal from "./WalletSelectorModal";

export default function WalletGuard({
  children,
  message,
}: {
  children: ReactNode;
  message?: string;
}) {
  const { connected } = useWallet();

  if (!connected) {
    return <WalletSelectorModal message={message} />;
  }

  return <>{children}</>;
}