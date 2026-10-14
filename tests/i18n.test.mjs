import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {english,translate} from '../public/i18n.js';
import chatHandler from '../api/chat.js';
test('every static Arabic interface text has an English translation',async()=>{
 const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
 const texts=[...html.matchAll(/>([^<>]*)</g)].map(m=>m[1].trim()).filter(text=>/[\u0600-\u06ff]/.test(text));
 for(const text of texts){assert.ok(english[text],`Missing translation: ${text}`);assert.ok(!/[\u0600-\u06ff]/.test(translate(text,'en')),text);}
 for(const match of html.matchAll(/(?:aria-label|placeholder|data-question)="([^"]*)"/g))if(/[\u0600-\u06ff]/.test(match[1]))assert.ok(english[match[1]],`Missing attribute translation: ${match[1]}`);
});
test('English API errors remain English even before a body can be parsed',async()=>{
 const res={setHeader(){},status(code){this.code=code;return this;},json(value){this.value=value;return this;}};
 await chatHandler({method:'POST',headers:{'content-type':'application/json','x-warraq-language':'en'},body:'{'},res);
 assert.equal(res.code,400);assert.equal(res.value.error,'Invalid request data.');
});
