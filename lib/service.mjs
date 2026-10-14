import { validatePages, retrieve, demoAnswer, generateAnswer } from './rag.mjs';
export function getConfig(env = process.env) {
  return { mode: env.GEMINI_API_KEY?.trim() ? 'ai' : 'demo', serverConfigured:Boolean(env.GEMINI_API_KEY?.trim()), provider:'gemini', model:env.GEMINI_MODEL?.trim()||'gemini-3.5-flash-lite', maxPages:200, maxFileMb:20 };
}
export async function answerQuestion(data, {env=process.env, fetchImpl=fetch}={}) {
  if (!data || typeof data.question !== 'string' || !data.question.trim() || data.question.length>1000) throw new Error('اكتب سؤالًا لا يزيد عن 1000 حرف.');
  const pages=validatePages(data.pages);
  if (data.key!==undefined && (typeof data.key!=='string' || data.key.length>500)) throw new Error('مفتاح Gemini غير صالح.');
  const key=data.key?.trim()||env.GEMINI_API_KEY?.trim()||'';
  if (key.startsWith('sk-')) throw new Error('هذا مفتاح OpenAI. استخدم مفتاح Gemini من Google AI Studio.');
  const ai=data.mode==='ai';
  if(ai&&!key) throw new Error('أضف مفتاح Gemini من زر تفعيل Gemini، أو في إعدادات Vercel.');
  if(ai&&!/^[A-Za-z0-9_.-]{15,400}$/.test(key)) throw new Error('صيغة مفتاح Gemini غير صالحة. انسخ قيمة المفتاح فقط من Google AI Studio، دون نص إضافي.');
  const started=Date.now(), chunks=retrieve(pages,data.question);
  const result=ai?await generateAnswer(chunks,data.question,{key,model:getConfig(env).model,fetch:fetchImpl}):demoAnswer(chunks,data.question);
  return {...result,mode:ai?'ai':'demo',provider:ai?'gemini':null,sources:result.sourceIds.map(id=>chunks.find(c=>c.id===id)).map(({id,page,text})=>({id,page,text})),elapsedMs:Date.now()-started};
}


