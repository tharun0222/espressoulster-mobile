// Shared by the API and UI: validation stays useful, implementation details stay private.
const internalDetail=/(?:\b(?:authkey|api[\s_-]*key|authorization|bearer|client[\s_-]*secret|secret[\s_-]*key|password[\s_-]*(?:hash|salt)|stack[\s_-]*trace|traceback|sqlite\w*|sqlstate|postgres\w*|prisma|drizzle|database|errno|econn\w*|enotfound|typeerror|referenceerror|syntaxerror|node_env|process\.env|cloudflare|msg91|next\.?js|namespace|webhook|backend|endpoint|cross-origin)\b|https?:\/\/|file:\/\/|\/(?:Users|home|var|tmp|workspace|node_modules)\/|\/api\/|\b[A-Za-z0-9_+-]{32,}\b)/i;

export function publicMessage(value:unknown,fallback='Something went wrong. Please try again.'){
 if(typeof value!=='string')return fallback;
 const message=value.trim();
 if(!message||message.length>350||/[\r\n<>\u0000-\u0008]/.test(message)||internalDetail.test(message))return fallback;
 return message;
}

export function customerEmail(value:unknown){
 return typeof value==='string'&&!/@(?:tester|phone|pin)\.invalid$/i.test(value)?value:'';
}
