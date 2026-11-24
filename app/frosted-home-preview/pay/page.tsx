import type { Metadata } from 'next';
import ScannerPreviews from './scanner-previews';
import '../preview.css';

export const metadata: Metadata = {
  title: 'Pay in Store designs · Espressoulster Coffee',
  robots: { index: false, follow: false },
};

export default function PayPreview() {
  return <div className="frosted-preview"><ScannerPreviews /></div>;
}
