import {test,after,before} from 'node:test';
import assert from 'node:assert/strict';
import {server} from '../server.mjs';
let base;before(async()=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;});after(()=>new Promise(resolve=>server.close(resolve)));
test('UI and config are served without exposing secrets',async()=>{assert.equal((await fetch(base)).status,200);const config=await (await fetch(base+'/api/config')).json();assert.ok(['demo','ai'].includes(config.mode));assert.ok(!JSON.stringify(config).includes('OPENAI_API_KEY'));});
test('Arabic document QA returns source attribution',async()=>{const response=await fetch(base+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'demo',question:'ما مدة الإرجاع؟',pages:[{page:1,text:'مدة الإرجاع 14 يومًا من الاستلام.'}]})});const result=await response.json();assert.equal(response.status,200);assert.equal(result.mode,'demo');assert.equal(result.sources[0].page,1);});
test('invalid body is handled without crashing',async()=>{const response=await fetch(base+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'});assert.equal(response.status,400);assert.equal((await fetch(base+'/api/config')).status,200);});
test('foreign origins are rejected',async()=>{const response=await fetch(base+'/api/chat',{method:'POST',headers:{Origin:'https://example.com','Content-Type':'application/json'},body:'{}'});assert.equal(response.status,403);});
test('non-text page payload is rejected',async()=>{const response=await fetch(base+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:'test',pages:[{page:1,text:null}]})});assert.equal(response.status,400);});
