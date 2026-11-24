export type TimedOrder = {created_at:string;timer_started_at?:string;status:string;events?:{status:string;created_at:string}[]};
export function orderTime(value:string) {
  return Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : value.replace(' ', 'T') + 'Z');
}
export function orderElapsed(order:TimedOrder, now:number) {
  const start=orderTime(order.timer_started_at||order.created_at);
  const finished=['completed','cancelled'].includes(order.status);
  const event=finished ? order.events?.find(event=>event.status===order.status) : undefined;
  const end=event ? orderTime(event.created_at) : finished ? NaN : now;
  const hasTime=Number.isFinite(start)&&Number.isFinite(end)&&end>=start;
  return {seconds:hasTime?Math.floor((end-start)/1000):0,finished,hasTime};
}
export function elapsedLabel(seconds:number) {
  const hours=Math.floor(seconds/3600),minutes=Math.floor(seconds/60)%60;
  return (hours?String(hours).padStart(2,'0')+':':'')+String(minutes).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
}
