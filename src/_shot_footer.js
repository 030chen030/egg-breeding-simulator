/* v10.5 核验：页脚精简 + 光环助手署名 */
const fs=require('fs'),path=require('path'),http=require('http');
const {chromium}=require('playwright-core');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'_shots');
function serve(dir){return new Promise(res=>{const s=http.createServer((q,r)=>{const f=path.join(dir,q.url==='/'?'index.html':decodeURIComponent(q.url.split('?')[0]));fs.readFile(f,(e,b)=>{if(e){r.writeHead(404);r.end();return;}r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(b);});});s.listen(0,'127.0.0.1',()=>res(s));});}
(async()=>{
  const srv=await serve(path.join(ROOT,'site'));
  const url=`http://127.0.0.1:${srv.address().port}/`;
  const b=await chromium.launch({channel:'chrome',headless:true});
  const errors=[];
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  for (const [label,vp,mob] of [['桌面',{width:1280,height:900},false],['手机',{width:390,height:844},true]]){
    const ctx=await b.newContext({viewport:vp,isMobile:mob,hasTouch:mob,deviceScaleFactor:2});
    const p=await ctx.newPage();
    p.on('pageerror',e=>errors.push(label+': '+e));
    await p.goto(url,{waitUntil:'networkidle'});await wait(900);
    const info=await p.evaluate(()=>{
      const f=document.querySelector('footer');
      f.scrollIntoView({block:'center'});
      const lines=getComputedStyle(f).lineHeight;
      const r=f.getBoundingClientRect();
      return {txt:f.textContent.replace(/\s+/g,' ').trim(), textLines:Math.round(r.height/parseFloat(lines)), h:+r.height.toFixed(1), lineHeight:lines, brs:f.querySelectorAll('br').length, links:[...f.querySelectorAll('a')].map(a=>a.textContent.trim()+' → '+a.href)};
    });
    await wait(400);
    console.log(`[${label}]`, JSON.stringify(info));
    const f=await p.$('footer');
    await f.screenshot({path:`${OUT}/Z1-${label}-页脚.png`});
    // 整页底部
    await p.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
    await wait(500);
    await p.screenshot({path:`${OUT}/Z2-${label}-页面底部.png`});
    await ctx.close();
  }
  console.log('pageerror:', errors.length, errors.slice(0,3).join(' | '));
  await b.close();srv.close();
})().catch(e=>{console.error('FATAL',e.stack||e.message||e);});
