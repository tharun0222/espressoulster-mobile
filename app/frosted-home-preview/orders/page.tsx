import type {Metadata} from 'next';
import OrderTimerDemo from '../../order-timer-preview/order-timer-demo';
import '../preview.css';

export const metadata: Metadata = {
  title: 'Order animation preview · Espressoulster Coffee',
  robots: {index: false, follow: false},
};

export default function FrostedOrderPreview() {
  return (
    <div className="frosted-preview">
      <OrderTimerDemo homePath="/frosted-home-preview" />
    </div>
  );
}
