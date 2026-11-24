import {env} from 'cloudflare:workers';
import {notFound} from 'next/navigation';
import {hostedPaymentConfig} from '../../lib/sandbox-config';
import CashfreeCheckout from './checkout';

export const dynamic = 'force-dynamic';

export default function CashfreeCheckoutPage() {
  if (env.CASHFREE_CHECKOUT_API !== 'orders' || hostedPaymentConfig(env)?.provider !== 'cashfree') {
    notFound();
  }
  return <CashfreeCheckout />;
}
