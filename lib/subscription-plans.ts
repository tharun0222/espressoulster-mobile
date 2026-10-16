export const subscriptionPlans={weekly:{id:'weekly',name:'Weekly coffee pass',amount:159900,credits:8,days:30},monthly:{id:'monthly',name:'Monthly coffee pass',amount:600000,credits:34,days:30}} as const;
export function subscriptionPlan(id:unknown){if(id!=='weekly'&&id!=='monthly')throw Error('Choose a valid subscription plan.');return subscriptionPlans[id];}
