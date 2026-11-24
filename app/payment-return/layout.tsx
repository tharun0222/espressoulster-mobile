import type { ReactNode } from "react";
import "../frosted-home-preview/preview.css";

export default function PaymentReturnLayout({ children }: { children: ReactNode }) {
  return <div className="frosted-preview frosted-payment-return">{children}</div>;
}
