import { answerQuestion } from '../lib/service.mjs';
import {translate} from '../public/i18n.js';
export default async function handler(req,res){
  const language=req.headers['x-warraq-language']==='en'?'en':'ar';
  const fail=(status,message)=>res.status(status).json({error:translate(message,language)});
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return fail(405,'طريقة غير مدعومة.');
  if(!req.headers['content-type']?.startsWith('application/json'))return fail(415,'استخدم طلب JSON.');
  if(req.headers.origin){try{if(new URL(req.headers.origin).host!==req.headers.host)return fail(403,'الطلب من مصدر غير مسموح.');}catch{return fail(403,'مصدر الطلب غير صالح.');}}
  try{
    const data=typeof req.body==='string'?JSON.parse(req.body):req.body;
    if(JSON.stringify(data??{}).length>1000000)return fail(413,'النص كبير جدًا. اختر مستندًا أصغر.');
    return res.status(200).json(await answerQuestion(data));
  }catch(error){return fail(400,error.name==='TimeoutError'?'انتهت مهلة Gemini. حاول مرة أخرى.':error instanceof SyntaxError?'بيانات الطلب غير صالحة.':error.message);}
}
