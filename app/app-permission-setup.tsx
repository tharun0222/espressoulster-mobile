'use client';
import {useEffect,useState} from 'react';
import {Bell,X} from 'lucide-react';
import {useDialogAccessibility} from '../lib/dialog';
export default function AppPermissionSetup(){
 const [open,setOpen]=useState(false),[notification,setNotification]=useState('default'),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const close=()=>{try{localStorage.setItem('espresso-permissions-reviewed-v1','true')}catch{}setOpen(false)};
 useDialogAccessibility(open,close);
 useEffect(()=>{
  const show=()=>{setNotification(typeof Notification==='undefined'?'unsupported':Notification.permission);setMessage('');setOpen(true)};
  let reviewed=false;try{reviewed=localStorage.getItem('espresso-permissions-reviewed-v1')==='true'}catch{}
  const standalone=matchMedia('(display-mode: standalone)').matches||(navigator as any).standalone===true;
  if(standalone&&!reviewed)show();
  const installed=()=>{if(!reviewed)show()};
  window.addEventListener('appinstalled',installed);window.addEventListener('espresso-open-permissions',show);
  return()=>{window.removeEventListener('appinstalled',installed);window.removeEventListener('espresso-open-permissions',show)};
 },[]);
 if(!open)return null;
 return <div className="modal-backdrop"><section className="permission-setup" role="dialog" aria-modal="true" aria-labelledby="permission-setup-title">
  <button className="icon-button permission-close" aria-label="Close notification settings" onClick={close}><X size={20}/></button>
  <span className="eyebrow">APP SETTINGS</span><h2 id="permission-setup-title">Notifications</h2><p>Choose whether to receive order updates on this device.</p>
  <div className="permission-choice"><Bell size={23}/><div><h3>Order notifications</h3><p>Get alerts for ready and completed orders.</p><small>{notification==='granted'?'Notifications enabled':notification==='denied'?'Blocked in browser settings':notification==='unsupported'?'Not supported in this browser':'Ask me before sending alerts'}</small></div><button className="secondary" disabled={busy||['granted','denied','unsupported'].includes(notification)} onClick={async()=>{setBusy(true);try{setNotification(await Notification.requestPermission())}catch{setMessage('Enable notifications in your browser settings.')}finally{setBusy(false)}}}>{notification==='granted'?'Enabled':busy?'Enabling…':'Enable notifications'}</button></div>
  {notification==='denied'&&<p className="fine-print">To allow notifications later, open this site’s permissions in your browser settings.</p>}{message&&<p role="status">{message}</p>}
  <button className="primary" disabled={busy} onClick={close}>Done</button><button className="text-button" disabled={busy} onClick={close}>Not now</button>
 </section></div>;
}
