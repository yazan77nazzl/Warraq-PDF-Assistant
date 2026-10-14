import { answerQuestion } from '../lib/service.mjs';
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'طريقة غير مدعومة.'});
  if(!req.headers['content-type']?.startsWith('application/json'))return res.status(415).json({error:'استخدم طلب JSON.'});
  if(req.headers.origin){try{if(new URL(req.headers.origin).host!==req.headers.host)return res.status(403).json({error:'الطلب من مصدر غير مسموح.'});}catch{return res.status(403).json({error:'مصدر الطلب غير صالح.'});}}
  try{
    const data=typeof req.body==='string'?JSON.parse(req.body):req.body;
    if(JSON.stringify(data??{}).length>1000000)return res.status(413).json({error:'النص كبير جدًا. اختر مستندًا أصغر.'});
    return res.status(200).json(await answerQuestion(data));
  }catch(error){return res.status(400).json({error:error.name==='TimeoutError'?'انتهت مهلة Gemini. حاول مرة أخرى.':error instanceof SyntaxError?'بيانات الطلب غير صالحة.':error.message});}
}
