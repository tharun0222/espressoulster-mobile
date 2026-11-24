import type {Metadata} from 'next';
import MobileEntry from '../mobile-entry';
import './preview.css';
import './profile-preview.css';

export const metadata: Metadata = {
  title: 'Frosted glass preview · Espressoulster Coffee',
  robots: {index: false, follow: false},
};

export default async function FrostedAppPreview({ searchParams }: { searchParams: Promise<{ profile?: string }> }) {
  const showProfilePreview = (await searchParams).profile === 'glass';
  return (
    <div className={showProfilePreview ? 'frosted-preview profile-glass-preview' : 'frosted-preview'}>
      <MobileEntry previewPath="/frosted-home-preview" />
    </div>
  );
}
