export function addressLocation(input:unknown){
 if(input===undefined||input===null)return null;
 const p=input as {latitude:number;longitude:number};
 if(typeof p.latitude!=='number'||!Number.isFinite(p.latitude)||p.latitude < -90||p.latitude > 90||typeof p.longitude!=='number'||!Number.isFinite(p.longitude)||p.longitude < -180||p.longitude > 180)throw Error('Choose a valid address location.');
 return {latitude:p.latitude,longitude:p.longitude};
}
export function currentLocation():Promise<{latitude:number;longitude:number}>{
 return new Promise((resolve,reject)=>{
  if(!navigator.geolocation){reject(Error('Location is unavailable. Enter your address manually.'));return;}
  navigator.geolocation.getCurrentPosition(p=>resolve({latitude:p.coords.latitude,longitude:p.coords.longitude}),e=>reject(Error(e.code===1?'Location permission was declined. You can still enter your address manually.':'Unable to find your location. Try again or enter your address manually.')),{enableHighAccuracy:true,timeout:12000,maximumAge:60000});
 });
}
