import { PaymentError } from './payment-security.ts';
import { createStripeCheckout, sandboxReturnOrigin, type CheckoutMode, type SandboxCheckout, type SandboxProvider } from './sandbox-checkout.ts';
import { bookingFee, tableBookingFeePaise, validateBooking } from './table-booking.ts';
import { fitCafeTables, freeCafeBookingTables, isCafeTableConflict } from './cafe-table-manager.ts';
import { phoneNumber } from './phone-verification.ts';

export const isBookingCheckoutId = (id: string) => /^BK-[A-F0-9]{32}$/.test(id);

type Checkout = {
 id: string;
 user_id: string;
 booking: string;
 amount: number;
 checkout_amount: number | null;
 state: 'creating'|'ready'|'paid'|'expired'|'review';
 provider_session_id: string | null;
 checkout_url: string | null;
 provider: SandboxProvider;
 mode: CheckoutMode;
};
type StripeRequest = (path:string, data?:URLSearchParams, idempotencyKey?:string) => Promise<any>;


export function createStripeTableBookings(db:D1Database,env:any,stripe:StripeRequest) {
 return createTableBookingCheckouts(db, () => env.PAYMENT_PROVIDER === 'stripe' ? 'stripe' : null, () => createStripeCheckout(env, stripe));
}

export function createTableBookingCheckouts(
 db:D1Database,
 provider: () => SandboxProvider | null,
 checkoutFor: (provider: SandboxProvider, mode: CheckoutMode) => SandboxCheckout,
 mode: CheckoutMode = 'test',
){
 const payable=(row:Checkout)=>({...row,amount:row.checkout_amount??row.amount});
 const byId=async(id:string)=>{const row=await db.prepare('SELECT * FROM table_booking_payments WHERE id=?').bind(id).first<Checkout>();return row?payable(row):null;};

 async function finalize(checkout:Checkout,reference:string){
  const booking=JSON.parse(checkout.booking) as ReturnType<typeof validateBooking>;
  await db.batch([
   db.prepare(`
    INSERT INTO table_bookings(id,user_id,date,time,guests,purpose,notes,start_at,end_at,table_ids)
    SELECT id,user_id,?,?,?,?,?,start_at,end_at,
      (SELECT json_group_array(s.table_id) FROM live_cafe_table_schedule s
       WHERE s.source_id=table_booking_payments.id AND s.kind='hold')
    FROM table_booking_payments
    WHERE id=? AND state='ready' AND start_at>unixepoch()
      AND (SELECT COALESCE(SUM(t.seats),0) FROM live_cafe_table_schedule s JOIN cafe_tables t ON t.id=s.table_id
           WHERE s.source_id=table_booking_payments.id AND s.kind='hold')>=?
      AND NOT EXISTS (SELECT 1 FROM table_bookings b WHERE b.user_id=table_booking_payments.user_id
       AND b.status IN ('pending','confirmed') AND b.start_at<table_booking_payments.end_at AND b.end_at>table_booking_payments.start_at)
    ON CONFLICT(id) DO NOTHING
   `).bind(booking.date,booking.time,booking.guests,booking.purpose,booking.notes,checkout.id,booking.guests),
   db.prepare(`UPDATE cafe_table_schedule SET expires_at=NULL WHERE source_id=? AND kind='hold'
      AND closed_at IS NULL AND expires_at>unixepoch() AND EXISTS(SELECT 1 FROM table_bookings WHERE id=?)`)
    .bind(checkout.id,checkout.id),
   db.prepare(`
    UPDATE table_booking_payments SET payment_reference=?,state=CASE
      WHEN EXISTS (SELECT 1 FROM table_bookings b WHERE b.id=table_booking_payments.id) THEN 'paid' ELSE 'review' END
    WHERE id=? AND state='ready' AND provider_session_id=?
   `).bind(reference,checkout.id,checkout.provider_session_id),
  ]);
  const saved=await byId(checkout.id);
  if(saved?.state==='paid')return {state:'paid',bookingId:checkout.id};
  if(saved?.state==='review')return {state:'review'};
  throw new PaymentError('Booking payment is still being checked. Try again shortly.',503);
 }

 async function verify(checkout:Checkout,cancelled=false,failed=false){
  if(checkout.state==='paid')return {state:'paid',bookingId:checkout.id};
  if(checkout.state==='review'||checkout.state==='expired')return {state:checkout.state};
  if(!checkout.provider_session_id)return {state:'pending'};
  const status=await checkoutFor(checkout.provider,checkout.mode).verify({
   id:checkout.id,total:checkout.amount,currency:'INR',
  },checkout.provider_session_id,checkout.id,cancelled);
  if(status.state==='paid')return finalize(checkout,status.reference);
  if(status.state==='expired'||failed){
   await db.prepare("UPDATE table_booking_payments SET state='expired' WHERE id=? AND state='ready'").bind(checkout.id).run();
   const saved=await byId(checkout.id);
   if(saved?.state==='paid')return {state:'paid',bookingId:checkout.id};
   return {state:saved?.state??'expired'};
  }
  return {state:'pending'};
 }

 async function start(req:Request,userId:string,input:unknown){
  const selected=provider();
  if(!selected)throw new PaymentError('Booking checkout is currently unavailable.',503);
  checkoutFor(selected,mode).config();
  let contact: {name: string; phone: string} | undefined;
  if(mode==='live'||(selected==='cashfree'&&checkoutFor(selected,mode).session)){
   const profile=await db.prepare('SELECT name,phone FROM profiles WHERE id=?').bind(userId).first<{name:string;phone:string}>();
   try{
    if(!profile?.name?.trim())throw new Error();
    contact={name:profile.name,phone:phoneNumber(profile.phone)};
   }catch{throw new PaymentError('Add your name and a valid Indian mobile number in Profile before booking.',409);}
  }
  let booking:ReturnType<typeof validateBooking>;
  try{booking=validateBooking(input);}
  catch(error){throw new PaymentError((error as Error).message);}
  const snapshot=JSON.stringify(booking);

  let existing=await db.prepare(`
   SELECT * FROM table_booking_payments WHERE user_id=? AND state IN ('creating','ready','review')
     AND start_at<? AND end_at>? ORDER BY created_at DESC LIMIT 1
  `).bind(userId,booking.end_at,booking.start_at).first<Checkout>();
  if(existing){
   existing=payable(existing);
   if(existing.mode!==mode)throw new PaymentError('An earlier booking checkout needs café review.',409);
   const held=await db.prepare("SELECT 1 FROM live_cafe_table_schedule WHERE source_id=? AND kind='hold' LIMIT 1").bind(existing.id).first();
   if(!held&&existing.state==='creating'){
    await db.prepare("UPDATE table_booking_payments SET state='expired' WHERE id=? AND state='creating'").bind(existing.id).run();
    existing=await byId(existing.id);
   }
  }
  if(existing){
   const held=await db.prepare("SELECT 1 FROM live_cafe_table_schedule WHERE source_id=? AND kind='hold' LIMIT 1").bind(existing.id).first();
   const state=await verify(existing,!held);
   if(state.state==='paid'||state.state==='review')return state;
   if(!held&&state.state==='pending')
    throw new PaymentError('The old booking checkout is still closing. Try again shortly.',409);
   if(state.state==='pending'&&existing.booking!==snapshot){
    throw new PaymentError('An overlapping booking checkout is open. Finish or cancel it first.',409);
   }
   if(state.state==='pending'&&existing.checkout_url){
    return {state:'pending',provider:existing.provider,...(existing.mode==='live'?{mode:existing.mode}:{}),redirectUrl:checkoutFor(existing.provider,existing.mode).checkoutUrl(existing.checkout_url)};
   }
  }

  let checkout=existing?.state==='creating'?existing:null;
  const amount=await bookingFee(db);
  for(let attempt=0;!checkout&&attempt<3;attempt++){
   const tables=fitCafeTables(await freeCafeBookingTables(db,booking),booking.guests);
   if(!tables.length)throw new PaymentError('There are not enough free seats at this time. Choose a different slot.',409);
   const id='BK-'+crypto.randomUUID().replaceAll('-','').toUpperCase();
   try{
    const [saved]=await db.batch<Checkout>([db.prepare(`
    INSERT INTO table_booking_payments(id,user_id,booking,start_at,end_at,amount,provider,mode,checkout_amount)
    SELECT ?,?,?,?,?,?,?,?,?
    WHERE (SELECT COUNT(*) FROM table_booking_payments WHERE user_id=? AND created_at>unixepoch()-86400)<10
      AND NOT EXISTS (SELECT 1 FROM table_bookings WHERE user_id=? AND status IN ('pending','confirmed') AND start_at<? AND end_at>?)
      AND NOT EXISTS (SELECT 1 FROM table_booking_payments WHERE user_id=? AND state IN ('creating','ready','review') AND start_at<? AND end_at>?)
    RETURNING *
   `).bind(id,userId,snapshot,booking.start_at,booking.end_at,tableBookingFeePaise,selected,mode,amount,
    userId,userId,booking.end_at,booking.start_at,userId,booking.end_at,booking.start_at),
    db.prepare(`INSERT INTO cafe_table_schedule(table_id,customer_id,kind,source_id,booking_id,start_at,end_at,expires_at)
      SELECT chosen.value,p.user_id,'hold',p.id,p.id,p.start_at,p.end_at,unixepoch()+900
      FROM table_booking_payments p JOIN json_each(?) chosen WHERE p.id=?`).bind(JSON.stringify(tables),id)]);
    checkout=saved.results[0]?{...saved.results[0],amount:saved.results[0].checkout_amount??saved.results[0].amount}:null;
    if(!checkout)break;
   }catch(error){
    if(!isCafeTableConflict(error))throw error;
   }
  }
  if(!checkout)throw new PaymentError('An overlapping booking already exists or the daily request limit was reached.',409);

  const gateway=checkoutFor(checkout.provider,checkout.mode);
  const origin=sandboxReturnOrigin(gateway.config().origin,req);
  const returnUrl=origin+'/booking-payment-return?booking='+checkout.id;
  const hold=await db.prepare("SELECT MIN(expires_at) AS expires_at FROM live_cafe_table_schedule WHERE source_id=? AND kind='hold'")
   .bind(checkout.id).first<{expires_at:number|null}>();
  if(!hold?.expires_at)throw new PaymentError('This booking hold expired. Choose a time and try again.',409);
  const session=await gateway.create({
   id:checkout.id,total:checkout.amount,currency:'INR',requestId:checkout.id,
   returnUrl,cancelUrl:returnUrl+'&cancelled=1',purpose:'Espressoulster table booking fee',expiresAt:hold.expires_at,contact,
  });
  await db.prepare("UPDATE table_booking_payments SET state='ready',provider_session_id=?,checkout_url=?,cashfree_order_id=? WHERE id=? AND state='creating'")
   .bind(session.id,session.url,session.orderId??null,checkout.id).run();
  const saved=await byId(checkout.id);
  if(saved?.state!=='ready'||saved.provider_session_id!==session.id)
   throw new PaymentError('This booking hold has changed. Open your bookings to check the status.',409);
  return {state:'pending',provider:checkout.provider,...(checkout.mode==='live'?{mode:checkout.mode}:{}),redirectUrl:session.url};
 }

 async function verifyOwner(id:string,userId:string,cancelled:boolean){
  const checkout=await byId(id);
  if(!checkout||checkout.user_id!==userId)throw new PaymentError('Booking checkout not found.',404);
  if(checkout.mode!==mode)throw new PaymentError('This booking checkout belongs to a different payment environment.',409);
  const result=await verify(checkout,cancelled);
  return {...result,...(checkout.mode==='live'?{mode:checkout.mode}:{}),
   ...(checkout.mode==='live'||checkout.amount!==tableBookingFeePaise?{amount:checkout.amount}:{})};
 }

 async function webhook(id:string,sessionId:string,event:string,expectedProvider:SandboxProvider='stripe',expectedMode:CheckoutMode='test'){
  const checkout=await byId(id);
  if(!checkout||checkout.provider!==expectedProvider||checkout.mode!==expectedMode)return {received:true,ignored:true};
  if(checkout.provider_session_id!==sessionId)throw new PaymentError('Booking payment mapping is not ready. Retry delivery.',409);
  return verify(checkout,false,expectedProvider==='stripe'&&event==='checkout.session.async_payment_failed');
 }
 return {start,verifyOwner,webhook};
}
