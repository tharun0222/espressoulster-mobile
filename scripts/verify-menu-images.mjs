import {readFileSync,existsSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
const menu=JSON.parse(readFileSync('lib/outlet-menu.json','utf8'));
const paths=new Set(),hashes=new Set();
for(const p of menu.products){
 if(!p.image?.startsWith('/images/menu/items/'))throw Error(`Missing dedicated image: ${p.name}`);
 if(paths.has(p.image))throw Error(`Shared image URL: ${p.name}`);
 paths.add(p.image);
 const path=join('public',p.image);
 if(!existsSync(path))throw Error(`Missing asset: ${path}`);
 const bytes=readFileSync(path);
 if(bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WEBP')throw Error(`Invalid WebP: ${p.name}`);
 const hash=createHash('sha256').update(bytes).digest('hex');
 if(hashes.has(hash))throw Error(`Duplicate image content: ${p.name}`);
 hashes.add(hash);
}
const result={items:menu.products.length,distinct_image_urls:paths.size,distinct_image_contents:hashes.size,categories:menu.categories.length,status:'passed'};
writeFileSync('docs/testing/menu-images/results.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
