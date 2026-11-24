export const tableBookingFeePaise=10000;
export async function bookingFee(database: Pick<D1Database,'prepare'>) {
 const settings = await database.prepare("SELECT json_extract(data,'$.tableBookingFeePaise') AS fee FROM settings WHERE id='store'").bind().first<{fee:number}>();
 return Number.isSafeInteger(settings?.fee) && settings!.fee >= 100 ? settings!.fee : tableBookingFeePaise;
}
export const bookingSlots=Array.from({length:41},(_,i)=>360+i*30);
export const bookingHours=[...Array.from({length:18},(_,i)=>i+6),0,1];
export function slotTime(minutes:number){return `${String(Math.floor(minutes/60)%24).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;}
export function bookingTimeLabel(time:string){const [hour,minute]=time.split(':').map(Number);return `${hour%12||12}:${String(minute).padStart(2,'0')} ${hour<12?'AM':'PM'}`;}
export function bookingDay(now=Date.now()){const local=new Date(now+19800000);if(local.getUTCHours()<2)local.setUTCDate(local.getUTCDate()-1);return local.toISOString().slice(0,10);}
export function bookingDuration(start:number,end:number){const m=(end-start)/60;return `${Math.floor(m/60)?`${Math.floor(m/60)} hr `:''}${m%60?`${m%60} min`:''}`.trim();}
export function bookingsOverlap(a:{start_at:number;end_at:number},b:{start_at:number;end_at:number}){return a.start_at<b.end_at&&b.start_at<a.end_at;}
export function validateBooking(input:any,now=Date.now()){
 const date=String(input.date||''),time=String(input.time||''),endTime=String(input.endTime||''),guests=Number(input.guests);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||![time,endTime].every(t=>/^([01]\d|2[0-3]):(00|30)$/.test(t)))throw Error('Choose a date, check-in and check-out time.');
 const minute=(t:string)=>{const [h,m]=t.split(':').map(Number);return h*60+m+(h<6?1440:0)};
 const startMinute=minute(time),endMinute=minute(endTime);
 if(startMinute<360||startMinute>=1560||endMinute>1560||endMinute<=startMinute)throw Error('Check-out must be after check-in, between 6:00 AM and 2:00 AM next day IST.');
 const midnight=Date.parse(`${date}T00:00:00+05:30`);
 if(!Number.isFinite(midnight)||new Date(midnight+19800000).toISOString().slice(0,10)!==date)throw Error('Choose a valid date.');
 const start=midnight+startMinute*60000,end=midnight+endMinute*60000;
 if(start<now+1800000||start>now+30*86400000)throw Error('Choose check-in at least 30 minutes ahead and within 30 days.');
 if(!Number.isInteger(guests)||guests<1||guests>20)throw Error('Choose between 1 and 20 guests.');
 const purpose=String(input.purpose||'Visit');if(!['Office meeting','Catch-up','Celebration','Visit'].includes(purpose))throw Error('Choose a visit type.');
 const notes=String(input.notes||'').trim();if(notes.length>500)throw Error('Keep notes under 500 characters.');
 return {date:new Date(start+19800000).toISOString().slice(0,10),time,guests,purpose,notes,start_at:start/1000,end_at:end/1000};
}
