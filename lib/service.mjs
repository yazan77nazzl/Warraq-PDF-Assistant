import { validatePages, retrieve, demoAnswer, generateAnswer,answerLanguage } from './rag.mjs';
import {hybridRetrieve,contextualQuery} from './search.mjs';
import {translate} from '../public/i18n.js';
import {planQuery,needsPlanning} from './query.mjs';
import {rerankEvidence,compactEvidence,needsReview,reviewAnswer} from './quality.mjs';
import {answerCacheKey,getCachedAnswer,cacheAnswer} from './answer-cache.mjs';
import {chunkPages} from './rag.mjs';
export function getConfig(env = process.env) {
  return { mode: env.GEMINI_API_KEY?.trim() ? 'ai' : 'demo', serverConfigured:Boolean(env.GEMINI_API_KEY?.trim()), provider:'gemini', model:env.GEMINI_MODEL?.trim()||'gemini-3.5-flash-lite', embeddingModel:env.GEMINI_EMBEDDING_MODEL?.trim()||'gemini-embedding-2',languages:['ar','en'],formats:['pdf','docx','txt','pptx'],qualityVersion:4,maxPages:200, maxFileMb:20 };
}
export async function answerQuestion(data, {env=process.env, fetchImpl=fetch}={}) {
 try{
  if (!data || typeof data.question !== 'string' || !data.question.trim() || data.question.length>1000) throw new Error('اكتب سؤالًا لا يزيد عن 1000 حرف.');
  const pages=validatePages(data.pages);
  if (data.key!==undefined && (typeof data.key!=='string' || data.key.length>500)) throw new Error('مفتاح Gemini غير صالح.');
  const key=data.key?.trim()||env.GEMINI_API_KEY?.trim()||'';
  if (key.startsWith('sk-')) throw new Error('هذا مفتاح OpenAI. استخدم مفتاح Gemini من Google AI Studio.');
  const ai=data.mode==='ai';
  if(ai&&!key) throw new Error('أضف مفتاح Gemini من زر تفعيل Gemini، أو في إعدادات Vercel.');
  if(ai&&!/^[A-Za-z0-9_.-]{15,400}$/.test(key)) throw new Error('صيغة مفتاح Gemini غير صالحة. انسخ قيمة المفتاح فقط من Google AI Studio، دون نص إضافي.');
  if(data.history!==undefined&&(!Array.isArray(data.history)||data.history.length>4||data.history.some(h=>!h||typeof h.question!=='string'||h.question.length>1000||typeof h.answer!=='string'||h.answer.length>2000)))throw new Error('سجل المحادثة غير صالح.');
  const history=(data.history||[]).map(({question,answer})=>({question:question.trim(),answer:answer.trim()}));
  const started=Date.now(),settings=getConfig(env),deadline=started+48000,referenceDate=new Date().toISOString().slice(0,10);
  const documentType=['docx','pptx','txt'].includes(data.documentType)?data.documentType:'pdf',language=answerLanguage(data.question,data.language==='en'?'en':'ar');
  const relevantHistory=needsPlanning(data.question,history)?history:[];
  const counts={generationRequests:0,embeddingRequests:0,cacheHit:false};
  const measuredFetch=(url,options)=>{if(url.includes(':generateContent'))counts.generationRequests++;if(url.includes(':batchEmbedContents'))counts.embeddingRequests++;return fetchImpl(url,options);};
  const options={key,model:settings.model,embeddingModel:settings.embeddingModel,fetch:measuredFetch,history:relevantHistory,answerLanguage:language,documentType,referenceDate,deadline};
  const cacheKey=ai?answerCacheKey({...data,pages,documentType},key,settings,relevantHistory,referenceDate):null;
  const cached=ai?getCachedAnswer(cacheKey):null;
  if(cached){const {sourceSpans,...answer}=cached;return {...answer,sources:sourceSpans.map(s=>({id:s.id,page:s.page,text:pages.find(p=>p.page===s.page).text.slice(s.start,s.end)})),elapsedMs:Date.now()-started,usage:{...counts,cacheHit:true}};}
  const plan=ai?await planQuery(data.question,relevantHistory,options):{standaloneQuestion:data.question,searchQuery:contextualQuery(data.question,history),queryRewritten:false};
  options.standaloneQuestion=plan.standaloneQuestion;
  let search=ai?await hybridRetrieve(pages,plan.searchQuery,options):{chunks:retrieve(pages,plan.searchQuery),searchMode:'keyword',searchFallback:null};
  let chunks=compactEvidence(rerankEvidence(plan.searchQuery,search.chunks));
  let result=ai?await generateAnswer(chunks,data.question,options):demoAnswer(chunks,data.question,language);
  if(ai&&needsReview(data.question,result))result=await reviewAnswer(result,chunks,data.question,options);
  else result.verification=ai?'self-check':'extractive';
  let searchPasses=1;
  const documentSize=pages.reduce((n,p)=>n+p.text.length,0),contextSize=chunks.reduce((n,c)=>n+c.text.length,0);
  if(ai&&result.notFound&&contextSize<documentSize*.9&&deadline-Date.now()>15000){
    const expanded=await hybridRetrieve(pages,result.nextQuery||plan.standaloneQuestion,options);
    const used=new Set(chunks.map(c=>c.id));
    const additional=expanded.chunks.filter(c=>!used.has(c.id));
    // Include unseen passages for a single broader pass, without repeating the same context.
    for(const candidate of chunkPages(pages))if(!used.has(candidate.id)&&!additional.some(c=>c.id===candidate.id)&&additional.length<12)additional.push(candidate);
    chunks=compactEvidence([...search.chunks,...additional].slice(0,28));
    result=await generateAnswer(chunks,data.question,options);
    result=await reviewAnswer(result,chunks,data.question,options);
    searchPasses=2;
  }
  const {nextQuery,...answer}=result;
  const sources=result.sourceIds.map(id=>chunks.find(c=>c.id===id)).map(({id,page,text})=>({id,page,text}));
  const output={...answer,mode:ai?'ai':'demo',provider:ai?'gemini':null,searchMode:search.searchMode,searchFallback:search.searchFallback,searchPasses,sources,elapsedMs:Date.now()-started,usage:counts};
  if(ai&&!result.notFound&&result.verification!=='unavailable'){
    const {sources,elapsedMs,usage,...cachedOutput}=output;
    cacheAnswer(cacheKey,{...cachedOutput,sourceSpans:sources.map(s=>{const start=Number(s.id.split('-').at(-1));return {id:s.id,page:s.page,start,end:start+s.text.length};})});
  }
  return output;
 }catch(error){throw new Error(translate(error.message,data?.language==='en'?'en':'ar'));}
}


