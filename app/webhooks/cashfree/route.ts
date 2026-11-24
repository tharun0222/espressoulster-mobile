import {cashfreeWebhook} from '../../../lib/stripe-payments';
import {PaymentError} from '../../../lib/payment-security';

export const dynamic = 'force-dynamic';

/** Public server callback: signature verification uses the unmodified request body. */
export async function POST(request: Request) {
  try {
    return await cashfreeWebhook(request);
  } catch (error) {
    if (error instanceof PaymentError) {
      return Response.json({error: error.message}, {status: error.status, headers: {'Cache-Control': 'no-store'}});
    }
    return Response.json({error: 'Webhook could not be processed. Retry delivery.'}, {status: 503});
  }
}
