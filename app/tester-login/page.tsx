import {env} from 'cloudflare:workers';
import {redirect} from 'next/navigation';
import TesterForm from './tester-form';
export const dynamic='force-dynamic';
export default function TesterPage(){if((env as any).CUSTOMER_AUTH_MODE==='pin')redirect('/#home');return <TesterForm/>;}
