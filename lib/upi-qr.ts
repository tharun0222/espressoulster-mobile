export function parseUpiQr(raw:string){
 if(raw.length>4096)throw Error('This QR code is too large.');
 const url=new URL(raw.trim());
 if(url.protocol!=='upi:'||url.hostname!=='pay'||(url.pathname&&url.pathname!=='/')||url.username||url.password)throw Error('Scan a valid UPI payment QR code.');
 const pa=url.searchParams.get('pa')||'',name=url.searchParams.get('pn')||pa,amount=url.searchParams.get('am');
 if(!/^[a-zA-Z0-9._-]{2,256}@[a-zA-Z0-9.-]{2,64}$/.test(pa))throw Error('The QR code has an invalid UPI ID.');
 if(amount!==null&&(!/^\d{1,8}(\.\d{1,2})?$/.test(amount)||Number(amount)<=0))throw Error('The QR code has an invalid amount.');
 if(url.searchParams.has('cu')&&url.searchParams.get('cu')!=='INR')throw Error('Only INR payments are supported.');
 // Rebuild only payment fields; never navigate to arbitrary URLs embedded in a QR.
 const clean=new URL('upi://pay');for(const key of ['pa','pn','am','tn','tr','mc','tid']){const v=url.searchParams.get(key);if(v)clean.searchParams.set(key,v.slice(0,256));}clean.searchParams.set('cu','INR');
 return {href:clean.href,pa,name:name.slice(0,120),amount};
}
