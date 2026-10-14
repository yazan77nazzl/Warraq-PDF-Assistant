import { getConfig } from '../lib/service.mjs';
export default function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'طريقة غير مدعومة.'});
  return res.status(200).json(getConfig());
}
