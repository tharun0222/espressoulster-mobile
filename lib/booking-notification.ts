export function bookingNoticeText(data:{tables:string[];start:number;end:number;updated?:boolean}){
 const fmt=(n:number)=>new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',year:'numeric',hour:'numeric',minute:'2-digit',hour12:true}).format(new Date(n*1000));
 return {title:data.updated?'Your tables changed':'Your table is booked',tables:`Table${data.tables.length===1?'':'s'} ${data.tables.join(', ')}`,checkIn:fmt(data.start)+' IST',checkOut:fmt(data.end)+' IST'};
}
