import type { Metadata } from 'next';
import CounterPreview from './counter-preview';
import '../../preview.css';

export const metadata: Metadata = {
  title: 'Pay at the counter preview · Espressoulster Coffee',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <div className="frosted-preview"><CounterPreview /></div>;
}
