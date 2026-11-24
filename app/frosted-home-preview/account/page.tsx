import type { Metadata } from 'next';
import AccountPreviews from './account-previews';
import '../preview.css';

export const metadata: Metadata = {
  title: 'Account screen previews · Espressoulster Coffee',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <div className="frosted-preview"><AccountPreviews /></div>;
}
