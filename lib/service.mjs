import { validatePages, retrieve, demoAnswer, generateAnswer,answerLanguage } from './rag.mjs';
import {hybridRetrieve,contextualQuery} from './search.mjs';
import {translate} from '../public/i18n.js';
import {planQuery} from './query.mjs';
export function getConfig(env = process.env) {
  return { mode: env.GEMINI_API_KEY?.trim() ? 'ai' : 'demo', serverConfigured:Boolean(env.GEMINI_API_KEY?.trim()), provider:'gemini', model:env.GEMINI_MODEL?.trim()||'gemini-3.5-flash-lite', embeddingModel:env.GEMINI_EMBEDDING_MODEL?.trim()||'gemini-embedding-2',languages:['ar','en'],maxPages:200, maxFileMb:20 };
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
  const started=Date.now(),settings=getConfig(env);
  const plan=ai?await planQuery(data.question,history,{key,model:settings.model,fetch:fetchImpl}):{standaloneQuestion:data.question,searchQuery:contextualQuery(data.question,history),queryRewritten:false};
  const query=plan.searchQuery;
  const search=ai?await hybridRetrieve(pages,query,{key,embeddingModel:settings.embeddingModel,fetch:fetchImpl}):{chunks:retrieve(pages,query),searchMode:'keyword',searchFallback:null};
  const {chunks}=search;
  const language=answerLanguage(data.question,data.language==='en'?'en':'ar');
  const result=ai?await generateAnswer(chunks,data.question,{key,model:settings.model,fetch:fetchImpl,history,answerLanguage:language,standaloneQuestion:plan.standaloneQuestion,referenceDate:new Date().toISOString().slice(0,10)}):demoAnswer(chunks,data.question,language);
  return {...result,mode:ai?'ai':'demo',provider:ai?'gemini':null,searchMode:search.searchMode,searchFallback:search.searchFallback,sources:result.sourceIds.map(id=>chunks.find(c=>c.id===id)).map(({id,page,text})=>({id,page,text})),elapsedMs:Date.now()-started};
 }catch(error){throw new Error(translate(error.message,data?.language==='en'?'en':'ar'));}
}


