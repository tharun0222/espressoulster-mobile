'use client';

import Script from 'next/script';
import {useEffect, useRef, useState} from 'react';
import {paymentRequest} from '../../lib/payment-request';
import {openNativeCashfreeCheckout} from '../../lib/native-cashfree-checkout';
import {customerJson} from '../../lib/customer-flow';
import '../payment-order-flow.css';

type Session =
  | {state: 'ready'; mode: 'test' | 'live'; orderId: string; paymentSessionId: string}
  | {state: 'paid' | 'expired'};

type CashfreeSDK = (options: {mode: 'sandbox' | 'production'}) => {
  checkout(options: {paymentSessionId: string; redirectTarget: '_modal'}): Promise<{error?: unknown} | undefined>;
};

export default function CashfreeCheckout() {
  const [order, setOrder] = useState('');
  const [sdkReady, setSdkReady] = useState(false);
  const [message, setMessage] = useState('Opening Cashfree checkout…');
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const opening = useRef(false);
  const waitingForWebSdk = useRef(false);
  const webSdkFailed = useRef(false);
  const returnUrl = order.startsWith('BK-')
    ? '/booking-payment-return?booking=' + order
    : '/payment-return?order=' + order;

  function showError(message: string) {
    setMessage(message);
    setFailed(true);
  }

  useEffect(() => {
    const id = new URLSearchParams(location.search).get('order') ?? '';
    if (!/^(?:(?:PC|BK)-[A-F0-9]{32}|CH-[A-F0-9]{8})$/.test(id)) {
      showError('This payment link is invalid. Open the app to check your order.');
      return;
    }
    setOrder(id);
  }, []);

  useEffect(() => {
    const nativeReady = () => {
      if ((window as Window & {espressoCashfreeCheckout?: boolean}).espressoCashfreeCheckout) setSdkReady(true);
    };
    nativeReady();
    window.addEventListener('espresso-native-ready', nativeReady);
    return () => window.removeEventListener('espresso-native-ready', nativeReady);
  }, []);

  useEffect(() => {
    if (!order || !sdkReady) return;
    let active = true;

    async function openCheckout() {
      try {
        const session: Session = await paymentRequest(order + '/session');
        if (!active || opening.current) return;
        if (session.state !== 'ready') {
          location.replace(returnUrl);
          return;
        }
        opening.current = true;
        const native = openNativeCashfreeCheckout(session);
        let checkoutError = false;
        if (native) await native;
        else {
          const cashfree = (window as Window & {Cashfree?: CashfreeSDK}).Cashfree;
          if (!cashfree) {
            opening.current = false;
            if (webSdkFailed.current) throw new Error('Cashfree could not load. Check payment status or reload this page.');
            waitingForWebSdk.current = true;
            return;
          }
          const result = await cashfree({mode: session.mode === 'test' ? 'sandbox' : 'production'})
            .checkout({paymentSessionId: session.paymentSessionId, redirectTarget: '_modal'});
          checkoutError = Boolean(result?.error);
        }
        if (!active) return;
        // Local QA can deliberately skip the return/status request to exercise
        // server-to-server delivery. This branch is removed from production builds.
        if (process.env.NODE_ENV === 'development' && new URLSearchParams(location.search).get('webhookOnly') === '1') {
          setMessage('Checkout returned. Waiting for the server webhook.');
          return;
        }
        // SDK callbacks (including failure/close) cannot mark a payment paid.
        const status = order.startsWith('BK-')
          ? await customerJson('table-bookings/payment', {method: 'POST', data: {id: order}})
          : await paymentRequest(order + '/verify', {});
        if (status.paid || status.state === 'paid' || status.state === 'review') location.replace(returnUrl);
        else {
          opening.current = false;
          showError(checkoutError ? 'Payment was not completed. Your order is still unpaid.' : 'Payment is not confirmed yet. You can check its status or try checkout again.');
        }
      } catch (error) {
        opening.current = false;
        if (active) showError(error instanceof Error ? error.message : 'Cashfree checkout is unavailable.');
      }
    }

    void openCheckout();
    return () => { active = false; };
  }, [order, sdkReady, attempt, returnUrl]);

  return <main className="payment-return-screen">
    {order && <Script src="https://sdk.cashfree.com/js/v3/cashfree.js"
      onReady={() => {
        setSdkReady(true);
        if (waitingForWebSdk.current) {
          waitingForWebSdk.current = false;
          setAttempt(value => value + 1);
        }
      }}
      onError={() => {
        webSdkFailed.current = true;
        setSdkReady(true);
        if (waitingForWebSdk.current) showError('Cashfree could not load. Check payment status or reload this page.');
      }} />}
    <section className="payment-return-card">
      <h1>Cashfree checkout</h1>
      <p role={failed ? 'alert' : 'status'}>{message}</p>
      {failed && order && <button className="secondary" type="button" onClick={() => {
        if (!sdkReady || webSdkFailed.current) { location.reload(); return; }
        setFailed(false);
        setMessage('Opening Cashfree checkout…');
        setAttempt(value => value + 1);
      }}>Try opening checkout again</button>}
      {order
        ? <><a href={returnUrl}>Check payment status</a>
            <a href={returnUrl + '&cancelled=1'}>Cancel checkout</a></>
        : <a href="/">Return to the app</a>}
    </section>
  </main>;
}
