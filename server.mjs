import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfig, answerQuestion } from './lib/service.mjs';
const root = path.dirname(fileURLToPath(import.meta.url));
try { process.loadEnvFile(path.join(root, '.env')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.pdf':'application/pdf', '.svg':'image/svg+xml', '.txt':'text/plain; charset=utf-8', '.bcmap':'application/octet-stream', '.ttf':'font/ttf', '.woff':'font/woff', '.wasm':'application/wasm' };
const port = Number(process.env.PORT || 4318);
function json(res, code, value) { res.writeHead(code, {'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store'}); res.end(JSON.stringify(value)); }
async function body(req) {
  let size = 0; const parts = [];
  for await (const part of req) { size += part.length; if (size > 5000000) throw new Error('الطلب كبير جدًا.'); parts.push(part); }
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
}
export const server = http.createServer(async (req,res) => {
  res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('Referrer-Policy','no-referrer');
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  if (req.method === 'GET' && url.pathname === '/api/config') return json(res,200,getConfig());
  if (req.method === 'POST' && url.pathname === '/api/chat') {
    const origin = req.headers.origin;
    if (origin && origin !== `http://127.0.0.1:${port}` && origin !== `http://localhost:${port}`) return json(res,403,{error:'الطلب من مصدر غير مسموح.'});
    if (!req.headers['content-type']?.startsWith('application/json')) return json(res,415,{error:'استخدم طلب JSON.'});
    try {
      const data = await body(req);
      return json(res,200,await answerQuestion(data));
    } catch(error) { return json(res,400,{error:error.name === 'TimeoutError' ? 'انتهت مهلة الإجابة. حاول مرة أخرى.' : error instanceof SyntaxError ? 'بيانات الطلب غير صالحة.' : error.message}); }
  }
  if (req.method !== 'GET') return json(res,405,{error:'طريقة غير مدعومة.'});
  try {
    const requested = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const file = path.resolve(root,'public','.'+requested); const publicRoot=path.join(root,'public')+path.sep;
    if (!file.startsWith(publicRoot)) return json(res,403,{error:'مسار غير مسموح.'});
    const data = await readFile(file);
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'}); res.end(data);
  } catch { json(res,404,{error:'الملف غير موجود.'}); }
});
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) server.listen(port,'127.0.0.1',()=>console.log(`Warraq is running at http://127.0.0.1:${port} (${getConfig().mode==='ai' ? 'Gemini configured' : 'extractive demo'})`));
