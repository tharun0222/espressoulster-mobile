import {env} from 'cloudflare:workers';
import {db,body} from './server';
import {createPinAuth} from './pin-auth-core';
export async function pinAuth(path:string,req:Request){return createPinAuth(db(),env).route(path,req,req.method==='POST'&&!path.endsWith('/logout')?await body(req):{});}
