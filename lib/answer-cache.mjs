import {createHash} from 'node:crypto';
const cache=new Map();const TTL=10*60*1000,MAX_BYTES=4*1024*1024;
export function clearAnswerCache(){cache.clear();}
export function answerCacheKey(data,key,settings,history,date){
 return createHash('sha256').update(key).update(JSON.stringify({version:'quality-v4',question:data.question.trim(),language:data.language,pages:data.pages,documentType:data.documentType,settings,history,date})).digest('hex');
}
export function getCachedAnswer(key){const entry=cache.get(key);if(!entry)return null;if(Date.now()-entry.time>TTL){cache.delete(key);return null;}cache.delete(key);cache.set(key,entry);return structuredClone(entry.value);}
export function cacheAnswer(key,value){
 const bytes=Buffer.byteLength(JSON.stringify(value));if(bytes>MAX_BYTES)return;
 cache.set(key,{value:structuredClone(value),time:Date.now(),bytes});
 let size=[...cache.values()].reduce((sum,e)=>sum+e.bytes,0);
 while(cache.size>100||size>MAX_BYTES){const first=cache.keys().next().value;size-=cache.get(first).bytes;cache.delete(first);}
}
