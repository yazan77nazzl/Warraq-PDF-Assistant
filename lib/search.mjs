import {createHash} from 'node:crypto';
import {chunkPages,retrieve} from './rag.mjs';

const vectorCache=new Map();
const TTL=10*60*1000, MAX_VECTORS=2400;
export function clearVectorCache(){vectorCache.clear();}
export function contextualQuery(question,history=[]){
  const previous=history.at(-1);
  const followup=/^(?:طيب|وكم|كم(?:\s|[؟?]|$)|وبالنسبه|بالنسبه|واذا|وهل|and\b|what about\b|how long\b|how much\b|how many\b|is it\b|does it\b|can it\b)|\b(?:it|that|those|them|they|its)\b|(?:هالشي|هاد|هاي|هيك)/i.test(question);
  return previous&&followup ? `${previous.question}\n${question}` : question;
}
function unit(values){
  if(!Array.isArray(values)||values.length<2||values.length>3072||values.some(v=>!Number.isFinite(v)))throw new Error('Invalid embedding');
  const magnitude=Math.hypot(...values);
  if(!magnitude)throw new Error('Empty embedding');
  return Float32Array.from(values,v=>v/magnitude);
}
export function cosine(a,b){if(a.length!==b.length)throw new Error('Embedding dimensions differ');return a.reduce((sum,v,i)=>sum+v*b[i],0);}
async function embed(texts,type,options,signal){
  const model=options.embeddingModel||'gemini-embedding-2';
  const requests=texts.map(text=>({model:`models/${model}`,content:{parts:[{text:`${type==='query'?'Query':'Document'} for retrieval: ${text}`}]},embedContentConfig:{outputDimensionality:768}}));
  const response=await options.fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:batchEmbedContents`,{method:'POST',headers:{'x-goog-api-key':options.key,'Content-Type':'application/json'},signal,body:JSON.stringify({requests})});
  if(!response.ok){const error=new Error('Semantic search unavailable');error.status=response.status;throw error;}
  const data=await response.json();
  if(!Array.isArray(data.embeddings)||data.embeddings.length!==texts.length)throw new Error('Invalid embedding response');
  return data.embeddings.map(e=>unit(e.values));
}
async function documentVectors(chunks,options,signal){
  // Cache only vectors and hashes; no document text or credentials are retained.
  const id=createHash('sha256').update(options.key).update('\0'+(options.embeddingModel||'gemini-embedding-2')).update(JSON.stringify(chunks.map(c=>[c.id,c.text]))).digest('hex');
  const now=Date.now();
  for(const [key,value] of vectorCache)if(now-value.time>TTL)vectorCache.delete(key);
  const cached=vectorCache.get(id);
  if(cached){vectorCache.delete(id);vectorCache.set(id,cached);return cached.vectors;}
  const vectors=new Array(chunks.length);let next=0;
  await Promise.all(Array.from({length:Math.min(3,Math.ceil(chunks.length/48))},async()=>{
    while(next<chunks.length){if(signal.aborted)throw new Error('Embedding timeout');const start=next;next+=48;const batch=chunks.slice(start,start+48);const result=await embed(batch.map(c=>c.text),'document',options,signal);result.forEach((v,i)=>vectors[start+i]=v);}
  }));
  vectorCache.set(id,{vectors,time:now});
  let count=[...vectorCache.values()].reduce((n,v)=>n+v.vectors.length,0);
  while(count>MAX_VECTORS){const key=vectorCache.keys().next().value;count-=vectorCache.get(key).vectors.length;vectorCache.delete(key);}
  return vectors;
}
export function fuseRanks(lexical,semantic,limit=8){
  const scores=new Map();
  for(const [list,weight] of [[lexical,1],[semantic,1.2]])list.forEach((chunk,i)=>{const old=scores.get(chunk.id)||{chunk,score:0};old.score+=weight/(30+i+1);scores.set(chunk.id,old);});
  const ranked=[...scores.values()].sort((a,b)=>b.score-a.score||a.chunk.page-b.chunk.page);
  // Prefer page diversity, but never discard relevant passages just because
  // several facts are on the same page (e.g. tables and one-page documents).
  const selected=[];const counts=new Map();
  for(const {chunk,score} of ranked){if((counts.get(chunk.page)||0)>=2)continue;selected.push({...chunk,score});counts.set(chunk.page,(counts.get(chunk.page)||0)+1);if(selected.length===limit)break;}
  for(const {chunk,score} of ranked){if(selected.length>=limit)break;if(!selected.some(c=>c.id===chunk.id))selected.push({...chunk,score});}
  return selected;
}
export function completeContext(allChunks,ranked){
  // Small documents fit in the answer budget: preserve all their evidence.
  if(allChunks.reduce((size,c)=>size+c.text.length,0)<=16000)return allChunks;
  // Long documents get neighboring chunks as well, so a retrieved heading
  // does not lose its dates, table rows or conditions at a chunk boundary.
  const selected=[...ranked];
  for(const chunk of ranked){
    const index=allChunks.findIndex(c=>c.id===chunk.id);
    for(const neighbor of [allChunks[index-1],allChunks[index+1]]){
      if(neighbor?.page===chunk.page&&!selected.some(c=>c.id===neighbor.id)&&selected.length<14)selected.push(neighbor);
    }
  }
  return selected;
}
export async function hybridRetrieve(pages,question,options){
  const lexical=retrieve(pages,question),chunks=chunkPages(pages);
  if(/لخص|ملخص|تلخيص|summari[sz]e|summary/i.test(question)||!chunks.length)return {chunks:completeContext(chunks,lexical),searchMode:'keyword',searchFallback:null};
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),Math.max(1,Math.min(9000,(options.deadline||Date.now()+9000)-Date.now())));
  try{
    const [vectors,[query]]=await Promise.all([documentVectors(chunks,options,controller.signal),embed([question],'query',options,controller.signal)]);
    const semantic=chunks.map((chunk,i)=>({...chunk,semanticScore:cosine(query,vectors[i])})).sort((a,b)=>b.semanticScore-a.semanticScore).slice(0,12);
    return {chunks:completeContext(chunks,fuseRanks(lexical,semantic)),searchMode:'hybrid',searchFallback:null};
  }catch(error){
    controller.abort();
    return {chunks:completeContext(chunks,lexical),searchMode:'keyword',searchFallback:error.status===429?'quota':'unavailable'};
  }finally{clearTimeout(timeout);}
}
