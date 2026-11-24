'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { adminSectionPath } from '../lib/admin-section';
import { unlockCelebrationAudio, welcomeSound } from '../lib/celebration-audio';
import { startWhatsAppAutofill } from '../lib/native-whatsapp-otp';
import { publicMessage } from '../lib/public-message';
import { rememberPinPhone } from '../lib/remembered-pin-phone';
import ProfileGenderField from './profile-gender-field';

type Step = 'phone' | 'otp' | 'profile';
type AccessResponse = { challenge?: string; setup?: string; destination?: string; error?: string; retryAfter?: number; expiresIn?: number };
const isToken = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

export default function WhatsAppLogin({ initialPhone, ready, preview, onSuccess }: {
  initialPhone: string;
  ready: boolean;
  preview: boolean;
  onSuccess: () => void;
}) {
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState(initialPhone);
  const [challenge, setChallenge] = useState<{ token: string; phone: string; expiresAt: number } | null>(null);
  const [setup, setSetup] = useState('');
  const [code, setCode] = useState('');
  const [autoCode, setAutoCode] = useState(false);
  const [name, setName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resendAt, setResendAt] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const form = useRef<HTMLFormElement>(null);
  const operation = useRef<AbortController | null>(null);
  const autofill = useRef<ReturnType<typeof startWhatsAppAutofill> | null>(null);

  useEffect(() => () => {
    operation.current?.abort();
    autofill.current?.stop();
  }, []);

  useEffect(() => {
    if (!resendAt) return;
    const update = () => setSeconds(Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [resendAt]);

  function back() {
    if (step === 'phone') return;
    operation.current?.abort();
    operation.current = null;
    autofill.current?.stop();
    setBusy(false);
    setAutoCode(false);
    setCode('');
    setError('');
    setStep(step === 'profile' ? 'otp' : 'phone');
  }

  useEffect(() => {
    if (step === 'phone') return;
    const handleBack = (event: Event) => {
      event.preventDefault();
      back();
    };
    window.addEventListener('espresso-android-back', handleBack);
    return () => window.removeEventListener('espresso-android-back', handleBack);
  }, [step]);

  useEffect(() => {
    if (step === 'otp' && challenge && autoCode && !busy && /^\d{6}$/.test(code)) form.current?.requestSubmit();
  }, [step, challenge, autoCode, busy, code]);

  function startCooldown(delay = 60) {
    setSeconds(delay);
    setResendAt(Date.now() + delay * 1000);
  }

  async function call(action: 'request' | 'confirm' | 'profile', payload: Record<string, string>) {
    if (preview || operation.current || !ready) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setError('');
    setAutoCode(false);
    try {
      if (action === 'request') {
        autofill.current?.stop();
        setCode('');
        const receiver = startWhatsAppAutofill(received => {
          setCode(received);
          setAutoCode(true);
        });
        autofill.current = receiver;
        await receiver.ready;
        if (controller.signal.aborted) return;
      }
      const response = await fetch('/api/auth/pin/access/' + action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, ...payload }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
      });
      const result = await response.json() as AccessResponse;
      if (controller.signal.aborted) return;
      if (!response.ok) {
        if (action === 'request' && (response.status === 429 || response.status === 503)) startCooldown();
        throw new Error(publicMessage(result.error, 'Please try again.'));
      }
      if (action === 'request') {
        if (!isToken(result.challenge)) throw new Error('Couldn’t send the OTP. Please try again.');
        setChallenge({ token: result.challenge, phone, expiresAt: Date.now() + (result.expiresIn ?? 600) * 1000 });
        setSetup('');
        startCooldown(result.retryAfter ?? 60);
        setStep('otp');
        return;
      }
      autofill.current?.stop();
      if (isToken(result.setup)) {
        setSetup(result.setup);
        setChallenge(null);
        setCode('');
        setStep('profile');
        return;
      }
      if (result.destination === 'admin') {
        window.location.replace(adminSectionPath(new URLSearchParams(location.search)));
        return;
      }
      rememberPinPhone(phone);
      welcomeSound();
      onSuccess();
    } catch (cause) {
      if (controller.signal.aborted) return;
      autofill.current?.stop();
      setAutoCode(false);
      setError(cause instanceof Error && cause.name === 'TimeoutError'
        ? 'The request timed out. Please try again.'
        : publicMessage(cause instanceof Error ? cause.message : '', 'Please try again.'));
    } finally {
      if (operation.current === controller) {
        operation.current = null;
        setBusy(false);
      }
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (preview || busy || !ready) return;
    unlockCelebrationAudio();
    if (step === 'phone') {
      if (challenge?.phone === phone && challenge.expiresAt > Date.now()) {
        setStep('otp');
      } else if (!seconds) void call('request', {});
    } else if (step === 'otp' && challenge) {
      void call('confirm', { challenge: challenge.token, code });
    } else if (step === 'profile' && setup) {
      void call('profile', { setup, name, dateOfBirth, gender });
    }
  }

  const title = step === 'phone' ? 'Log in' : step === 'otp' ? 'Enter OTP' : 'Your details';
  const canResume = challenge?.phone === phone && challenge.expiresAt > Date.now();
  return <main className="phone-welcome pin-welcome returning-pin" data-cafe-form={step === 'profile' ? 'register' : 'signin'}>
    <div className="after-hours-brand">Espressoulster<span>Coffee</span></div>
    <section className="phone-welcome-card" aria-labelledby="whatsapp-login-title">
      <h1 id="whatsapp-login-title">{title}</h1>
      {step === 'phone' && <p>We’ll send you a code on WhatsApp.</p>}
      {step === 'otp' && <p>Check WhatsApp on +91 {phone}.</p>}
      <form ref={form} onSubmit={submit}>
        {step === 'phone' && <label>Mobile number<div className="phone-input-row"><span>+91</span><input
          type="tel" inputMode="numeric" autoComplete="tel-national" required pattern="[6-9][0-9]{9}" maxLength={10}
          placeholder="10-digit mobile number" disabled={busy} value={phone}
          onChange={event => { setPhone(event.target.value.replace(/\D/g, '')); setError(''); }}
        /></div></label>}
        {step === 'otp' && <label>Verification code<input className="pin-profile-input" autoComplete="one-time-code"
          inputMode="numeric" required pattern="[0-9]{6}" maxLength={6} disabled={busy || !challenge} value={code}
          onChange={event => { setAutoCode(false); setCode(event.target.value.replace(/\D/g, '')); setError(''); }}
        /></label>}
        {step === 'profile' && <>
          <label>Your name<input className="pin-profile-input" autoComplete="name" required minLength={2} maxLength={100}
            disabled={busy} value={name} onChange={event => setName(event.target.value)} /></label>
          <label>Date of birth<input className="pin-profile-input" type="date" autoComplete="bday" required min="1900-01-01"
            max={new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })}
            disabled={busy} value={dateOfBirth} onChange={event => setDateOfBirth(event.target.value)} /></label>
          <ProfileGenderField required value={gender} onChange={setGender} disabled={busy} />
        </>}
        {!ready && <p role="status" className="phone-service-note">Log in is temporarily unavailable.</p>}
        {error && <p role="alert" className="phone-error">{error}</p>}
        <button type="submit" className="primary wide" disabled={preview || busy || !ready || (step === 'otp' && !challenge) || (step === 'phone' && !canResume && seconds > 0)}>
          {busy ? 'Please wait…' : step === 'otp' ? 'Verify OTP' : step === 'phone' && !canResume && seconds > 0 ? `Try again in ${seconds}s` : 'Continue'}
        </button>
      </form>
      {step === 'otp' && <div className="whatsapp-otp-actions">
        <button type="button" className="pin-back" onClick={back}>Change number</button>
        <button type="button" className="pin-back" disabled={busy || seconds > 0 || preview || !ready} onClick={() => void call('request', {})}>
          {seconds > 0 ? `Resend OTP in ${seconds}s` : 'Resend OTP'}
        </button>
      </div>}
      {step === 'profile' && <button type="button" className="pin-back" onClick={back}>Back</button>}
    </section>
  </main>;
}
