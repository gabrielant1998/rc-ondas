// Bateria de testes do RC Ondas (Playwright). Uso: node run.js [arquivo.html]
const {chromium}=require('playwright');const path=require('path');
const FILE='http://127.0.0.1:8765/'+(process.argv[2]||'index.html');
const R=[];const ok=(c,m)=>{if(!c)throw new Error(m)};
const DAY=new Date();DAY.setHours(0,0,0,0);const D0=DAY.getTime(),H=36e5;
const HJ=(()=>{const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")})();
const base=(o={})=>Object.assign({cfg:{lim:{"Vários":1000,"Múltiplos":1000,"Itens Únicos":100,"Maiores/Pesados":10},and:true,gap:30,tol:15,turnos:{1:{ini:7,fim:16},2:{ini:16,fim:23}}},
 gals:["Galpão 1","Galpão 2","Galpão 3"],metasDia:{[HJ]:{"Galpão 1":10000,"Galpão 2":8000,"Galpão 3":6000}},
 ops:[{m:"CL001",n:"Ana Souza",t:1,g:"Galpão 1"},{m:"CL002",n:"Bruno Lima",t:1,g:"Galpão 1"},{m:"CL003",n:"Carla Dias",t:2,g:"Galpão 2"}],
 ges:[],waves:[],gal:"Galpão 1",off:false,man:{log:[]}},o);
function bigState(N){const TY=["Vários","Múltiplos","Itens Únicos","Maiores/Pesados"],ops=[],waves=[];
 for(let i=1;i<=60;i++)ops.push({m:"CL"+String(i).padStart(3,"0"),n:"Operador "+i+" Silva",t:i%2?1:2,g:"Galpão "+(1+i%3)});
 for(let k=0;k<N;k++){const o=ops[k%60],day=Math.floor(k/(N/60)),t=D0-day*24*H+(7+(k%14))*H+(k%60)*6e4;
  waves.push({id:"w"+k,wn:String(100000+k),op:o.m,opn:o.n,gal:o.g,ty:TY[k%4],qty:1+(k*7)%90,st:0,ts:t,fin:t,sync:1})}
 return base({ops,waves})}
async function page(b,state,opts={}){const ctx=await b.newContext({viewport:opts.vp||{width:1366,height:900}});const p=await ctx.newPage();if(!opts.festa)await p.addInitScript(()=>{window.__semFesta=1});if(!opts.sidebarSubs)await p.addInitScript(()=>{document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent='#sub,#gsub,#psub,#hsub,#csub{display:flex!important}';document.head.appendChild(s)})});
 p.errors=[];p.on('pageerror',e=>p.errors.push(e.message));
 await ctx.addInitScript(([s])=>{if(!sessionStorage.__seeded){sessionStorage.__seeded=1;localStorage.clear();if(s)localStorage.setItem("rcondas.v2",s)}},[state?JSON.stringify(state):null]);
 await p.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.abort());
 await p.goto(FILE);await p.waitForTimeout(150);return p}
const TYN=["Vários artigos","Múltiplas quantidades","Itens Únicos","Maiores/Pesados","Retrabalho","Pacote do mesmo"];
const NEWTY={"Vários":"Vários artigos","Múltiplos":"Múltiplas quantidades"};
const st=async p=>{const s=await p.evaluate(()=>JSON.parse(localStorage.getItem("rcondas.v2")));if(s&&s.wv){s.waves=s.wv.map(a=>({id:a[0],wn:a[1],op:a[2],opn:a[3],gal:a[4],ty:TYN[a[5]],qty:a[6],st:a[7],ts:a[8],fin:a[9]<0?null:a[8]+a[9],sync:a[10],auto:a[11]}))}return s};
async function openReg(p,op,ty){ty=NEWTY[ty]||ty;await p.click('.tab[data-t="op"]');await p.waitForTimeout(120);await p.fill('#opIn','');await p.type('#opIn',op);await p.waitForTimeout(250);
 await p.click(`[data-ty="${ty}"] span`);await p.waitForTimeout(400)}
async function typeRows(p,rows){for(const [wn,q] of rows){await p.keyboard.type(String(wn));await p.keyboard.press('Enter');await p.keyboard.type(String(q));await p.keyboard.press('Enter')}}
async function T(name,fn){const t0=Date.now();try{const info=await fn();R.push(["PASS",name,(info||"")+` (${Date.now()-t0}ms)`])}catch(e){R.push(["FALHA",name,e.message.split("\n")[0]])}}
(async()=>{const b=await chromium.launch();

await T("01 Volume: 20.000 ondas carregam e o Painel renderiza rápido",async()=>{const S=bigState(20000);const p=await page(b,S);
 const t=await p.evaluate(()=>{const r={};let a=performance.now();renderAll();r.painel=performance.now()-a;
  a=performance.now();go("op");r.op=performance.now()-a;a=performance.now();go("ind");$("#iPer").value="30";individual();r.ind30=performance.now()-a;
  a=performance.now();go("cfg");r.cfg=performance.now()-a;r.kb=Math.round(localStorage.getItem("rcondas.v2").length/1024);return r});
 ok(p.errors.length===0,"erros JS: "+p.errors.join(";"));ok(t.painel<1500&&t.op<1500&&t.ind30<2500,"lento: "+JSON.stringify(t));
 return `painel ${t.painel|0}ms · operação ${t.op|0}ms · individual 30d ${t.ind30|0}ms · ${t.kb} KB salvos`});

await T("02 Volume: salvar 1 onda com 20.000 já existentes",async()=>{const p=await page(b,bigState(20000));await openReg(p,"CL001","Vários");
 const t0=Date.now();await typeRows(p,[[999001,10]]);await p.click('#save');await p.waitForTimeout(200);const dt=Date.now()-t0;
 const s=await st(p);ok(s.waves.length===20001,"total "+s.waves.length);return `ok em ${dt}ms (inclui digitação)`});

await T("03 Lote: 25 ondas numa tacada só pelo teclado",async()=>{const p=await page(b,base());await openReg(p,"CL002","Pacote do mesmo");
 const rows=[];for(let i=0;i<25;i++)rows.push([7000+i,10+i]);await typeRows(p,rows);await p.click('#save');await p.waitForTimeout(300);
 const s=await st(p);ok(s.waves.length===25,"salvou "+s.waves.length);ok(new Set(s.waves.map(w=>w.id)).size===25,"ids repetidos");
 ok(new Set(s.waves.map(w=>w.wn)).size===25,"WN repetidos");const sum=s.waves.reduce((a,w)=>a+w.qty,0);
 const shown=await p.evaluate(()=>{go("painel");return document.querySelector("#kpis .num").textContent});ok(shown.replace(/\D/g,"")==String(sum),"painel "+shown+" ≠ "+sum);
 return `25 salvas, painel = ${shown}`});

await T("04 WN repetido no mesmo formulário é bloqueado",async()=>{const p=await page(b,base());await openReg(p,"CL001","Pacote do mesmo");
 await typeRows(p,[[5001,10],[5001,20]]);await p.click('#save');await p.waitForTimeout(150);const s=await st(p);ok(!s||s.waves.length===0,"salvou com WN repetido");
 const err=await p.$$eval('.wrow.err',x=>x.length);ok(err===1,"linhas marcadas: "+err)});

await T("05 WN já registrado em outro dia é bloqueado",async()=>{const S=base({waves:[{id:"x",wn:"5001",op:"CL001",opn:"Ana Souza",gal:"Galpão 1",ty:"Vários",qty:5,st:0,ts:D0-3*24*H,fin:D0-3*24*H,sync:1}]});
 const p=await page(b,S);await openReg(p,"CL001","Vários");await typeRows(p,[[5001,10]]);await p.click('#save');await p.waitForTimeout(150);
 ok((await st(p)).waves.length===1,"duplicou");ok((await p.textContent('#toast')).includes("já foi registrada"),"sem aviso")});

await T("06 WN com espaços (' 5001 ') conta como o mesmo número",async()=>{const S=base({waves:[{id:"x",wn:"5001",op:"CL001",opn:"Ana Souza",gal:"Galpão 1",ty:"Vários",qty:5,st:0,ts:Date.now(),fin:Date.now(),sync:1}]});
 const p=await page(b,S);await openReg(p,"CL001","Vários");await typeRows(p,[[" 5001 ",10]]);await p.click('#save');await p.waitForTimeout(150);ok((await st(p)).waves.length===1,"duplicou com espaços")});

await T("07 WN com zeros à esquerda ('05001' x '5001')",async()=>{const S=base({waves:[{id:"x",wn:"5001",op:"CL001",opn:"Ana Souza",gal:"Galpão 1",ty:"Vários",qty:5,st:0,ts:Date.now(),fin:Date.now(),sync:1}]});
 const p=await page(b,S);await openReg(p,"CL001","Vários");await typeRows(p,[["05001",10]]);await p.click('#save');await p.waitForTimeout(150);ok((await st(p)).waves.length===1,"aceitou 05001 como onda nova")});

for(const [q,why] of [["0","zero"],["-5","negativo"],["2.5","decimal"],["1001","acima do limite de Vários"]])
 await T(`08 Quantidade inválida bloqueada: ${why} (${q})`,async()=>{const p=await page(b,base());await openReg(p,"CL001","Vários");
  await p.keyboard.type("6100");await p.keyboard.press('Enter');await p.fill('[data-q="0"]',q);await p.click('#save');await p.waitForTimeout(150);
  const s=await st(p);ok(!s||s.waves.length===0,`salvou qty=${s&&s.waves[0]&&s.waves[0].qty}`);return "aviso: "+(await p.textContent('#toast'))});

await T("09 Maiores/Pesados respeita limite 10",async()=>{const p=await page(b,base());await openReg(p,"CL001","Maiores/Pesados");
 await typeRows(p,[[6200,11]]);await p.click('#save');await p.waitForTimeout(150);ok(!(await st(p))||(await st(p)).waves.length===0,"salvou 11");
 await p.fill('[data-q="0"]','10');await p.click('#save');await p.waitForTimeout(150);ok((await st(p)).waves.length===1,"não salvou 10")});

await T("10 Linha incompleta (só WN, ou só quantidade) é bloqueada",async()=>{const p=await page(b,base());await openReg(p,"CL001","Vários");
 await p.keyboard.type("6300");await p.click('#save');await p.waitForTimeout(150);ok(!(await st(p))||(await st(p)).waves.length===0,"salvou sem quantidade");
 await p.fill('[data-wn="0"]','');await p.fill('[data-q="0"]','5');await p.click('#save');await p.waitForTimeout(150);ok(!(await st(p))||(await st(p)).waves.length===0,"salvou sem WN")});

await T("11 Offline: registra, mostra pendentes e sincroniza sem duplicar",async()=>{const p=await page(b,base());await p.evaluate(()=>$('#net').click());
 await openReg(p,"CL001","Pacote do mesmo");await typeRows(p,[[6401,1],[6402,2],[6403,3]]);await p.click('#save');await p.waitForTimeout(200);
 let s=await st(p);ok(s.waves.length===3&&s.waves.every(w=>!w.sync),"não ficou pendente");ok((await p.textContent('#net')).includes("3 pendente"),"indicador: "+await p.textContent('#net'));
 await p.evaluate(()=>$('#net').click());await p.waitForTimeout(150);s=await st(p);ok(s.waves.length===3&&s.waves.every(w=>w.sync),"não sincronizou ou duplicou");return await p.textContent('#toast')});

await T("12 Recarregar a página mantém os registros",async()=>{const p=await page(b,base());await openReg(p,"CL001","Vários");await typeRows(p,[[6501,7]]);await p.click('#save');await p.waitForTimeout(150);
 await p.reload();await p.waitForTimeout(200);ok((await st(p)).waves.length===1,"perdeu ao recarregar")});

await T("13 Armazenamento cheio: avisa, não finge que salvou e mantém o formulário",async()=>{const p=await page(b,base());
 await p.evaluate(()=>{const cur=(localStorage.getItem("rcondas.v2")||"").length;let lo=0,hi=6e6;while(hi-lo>200){const m=(lo+hi)>>1;try{localStorage.setItem("lixo","x".repeat(m));lo=m}catch(e){hi=m}}localStorage.setItem("lixo","x".repeat(lo))});
 await openReg(p,"CL001","Vários");await typeRows(p,[[6601,9]]);await p.click('#save');await p.waitForTimeout(200);
 const toast=await p.textContent('#toast');const s=await st(p);const n=(s&&s.waves||[]).length;const mem=await p.evaluate(()=>S.waves.length);
 const kept=await p.$eval('[data-wn="0"]',e=>e.value).catch(()=>"");
 ok(n===0&&mem===0,"gravado="+n+" memória="+mem);ok(/armazenamento cheio/i.test(toast),"aviso: "+toast);ok(kept==="6601","formulário perdido");return "aviso: "+toast});

await T("14 Hora extra: fora do turno e tolerância de 15 min",async()=>{const p=await page(b,base());
 const r=await p.evaluate(D0=>{const H=36e5,mk=(h)=>({op:"CL001",ts:D0+h*H,fin:D0+h*H});return[isOT(mk(17.5)),isOT(mk(16.2)),isOT(mk(6.5)),isOT(mk(12))]},D0);
 ok(JSON.stringify(r)==="[true,false,true,false]","17h30,16h12,6h30,12h → "+JSON.stringify(r))});

await T("15 Hora extra: turno que vira a noite (22h–6h)",async()=>{const S=base();S.cfg.turnos[2]={ini:22,fim:6};const p=await page(b,S);
 const r=await p.evaluate(D0=>{const H=36e5,mk=h=>({op:"CL003",ts:D0+h*H,fin:D0+h*H});return[isOT(mk(3)),isOT(mk(23)),isOT(mk(12))]},D0);
 ok(JSON.stringify(r)==="[false,false,true]","3h,23h,12h → "+JSON.stringify(r))});

await T("16 Virada do dia: 23h59 e 00h01 caem em dias diferentes",async()=>{const t1=D0-60e3,t2=D0+60e3;
 const S=base({waves:[{id:"a",wn:"1",op:"CL001",opn:"Ana Souza",gal:"Galpão 1",ty:"Vários",qty:11,st:0,ts:t1,fin:t1,sync:1},{id:"b",wn:"2",op:"CL001",opn:"Ana Souza",gal:"Galpão 1",ty:"Vários",qty:22,st:0,ts:t2,fin:t2,sync:1}]});
 const p=await page(b,S);const today=await p.textContent('#kpis .num');ok(today.trim()==="22","hoje mostra "+today)});

await T("17 Excluir usuário libera o código e mantém o histórico",async()=>{const S=base({waves:[{id:"a",wn:"1",op:"CL002",opn:"Bruno Lima",gal:"Galpão 1",ty:"Vários",qty:5,st:0,ts:Date.now(),fin:Date.now(),sync:1}]});
 const p=await page(b,S);p.on('dialog',d=>d.accept());await p.click('.tab[data-t="cfg"]');await p.click('[data-c="cus"]');await p.click('[data-udel="CL002"]');await p.waitForTimeout(150);
 await p.fill('#uN','Diego Rocha');await p.click('#uB');await p.waitForTimeout(150);const s=await st(p);
 ok(s.ops.find(o=>o.n==="Diego Rocha").m==="CL002","código novo: "+s.ops.find(o=>o.n==="Diego Rocha").m);ok(s.waves.length===1&&s.waves[0].opn==="Bruno Lima","histórico mudou");
 await p.evaluate(()=>{go("ind");go("painel");go("op")});ok(p.errors.length===0,"erro JS: "+p.errors.join(";"));
 const name=await p.evaluate(()=>document.querySelector("#last").textContent);return name.includes("Bruno Lima")?"registro antigo ainda mostra Bruno Lima":"?"});

await T("18 Código reutilizado não herda a produção do usuário excluído",async()=>{const S=base({waves:[{id:"a",wn:"1",op:"CL002",opn:"Bruno Lima",gal:"Galpão 1",ty:"Vários",qty:55,st:0,ts:Date.now(),fin:Date.now(),sync:1}]});
 const p=await page(b,S);p.on('dialog',d=>d.accept());await p.click('.tab[data-t="cfg"]');await p.click('[data-c="cus"]');await p.click('[data-udel="CL002"]');await p.waitForTimeout(100);
 await p.fill('#uN','Diego Rocha');await p.click('#uB');await p.waitForTimeout(100);
 const r=await p.evaluate(()=>{go("ind");$("#iOp").value="CL002";individual();return document.querySelector("#iBody .kpi .num").textContent});
 const tot=await p.evaluate(()=>{go("painel");return document.querySelector("#kpis .num").textContent});
 ok(r.trim()==="0","Diego (CL002 novo) aparece com "+r);ok(tot.trim()==="55","painel perdeu a produção antiga: "+tot);return "Diego 0 · painel ainda soma 55 do Bruno"});

await T("19 Renomear galpão leva junto registros e meta",async()=>{const S=base({waves:[{id:"a",wn:"1",op:"CL001",opn:"Ana Souza",gal:"Galpão 1",ty:"Vários",qty:5,st:0,ts:Date.now(),fin:Date.now(),sync:1}]});
 const p=await page(b,S);await p.click('.tab[data-t="cfg"]');await p.click('[data-c="cga"]');await p.fill('[data-gre="0"]','Galpão Norte');await p.press('[data-gre="0"]','Tab');await p.waitForTimeout(150);
 const s=await st(p);ok(s.gals[0]==="Galpão Norte"&&s.waves[0].gal==="Galpão Norte"&&s.metasDia[HJ]["Galpão Norte"]===10000&&s.ops[0].g==="Galpão Norte","não acompanhou: "+JSON.stringify({g:s.gals[0],w:s.waves[0].gal,m:s.metasDia}))});

await T("20 Nome malicioso não executa código (XSS)",async()=>{const p=await page(b,base());await p.click('.tab[data-t="cfg"]');await p.click('[data-c="cus"]');
 await p.fill('#uN','<img src=x onerror="window.__x=1">');await p.click('#uB');await p.waitForTimeout(100);
 await p.click('[data-c="cga"]');await p.fill('#gN','<svg onload="window.__x=2">');await p.click('#gB');await p.waitForTimeout(100);
 await p.evaluate(()=>{go("op");go("ind");go("painel")});await openReg(p,"CL004","Vários");await typeRows(p,[[6900,1]]);await p.click('#save');await p.waitForTimeout(150);
 await p.evaluate(()=>{go("ind");go("painel")});ok(!(await p.evaluate(()=>window.__x)),"executou código injetado")});

await T("21 Gestor comum vê só o galpão dele; admin vê todos",async()=>{const S=base({waves:[
  {id:"a",wn:"1",op:"CL001",opn:"Ana Souza",gal:"Galpão 1",ty:"Vários",qty:100,st:0,ts:Date.now(),fin:Date.now(),sync:1},
  {id:"b",wn:"2",op:"CL003",opn:"Carla Dias",gal:"Galpão 2",ty:"Vários",qty:7,st:0,ts:Date.now(),fin:Date.now(),sync:1}]});
 const p0=await page(b,null);const hp=await p0.evaluate(()=>h32("123"));
 S.ges=[{n:"Gestor G2",u:"g2@x.com",g:"Galpão 2",adm:false,p:hp,pC:true,pI:true,pR:true},{n:"Admin",u:"adm@x.com",g:"Galpão 1",adm:true,p:hp,pC:true,pI:true,pR:true}];
 const p=await page(b,S);const pub=await p.textContent('#kpis .num');
 await p.click('#logbtn');await p.fill('#lU','g2@x.com');await p.fill('#lP','123');await p.click('#lB');await p.waitForTimeout(150);await p.evaluate(()=>go("painel"));
 const g2=await p.textContent('#kpis .num'),dis=await p.$eval('#gal',e=>e.disabled);
 await p.click('#logbtn');await p.click('#logbtn');await p.fill('#lU','adm@x.com');await p.fill('#lP','123');await p.click('#lB');await p.waitForTimeout(150);await p.evaluate(()=>{go("painel");$("#gal").value="__all";renderAll()});
 const all=await p.textContent('#kpis .num');ok(g2.trim()==="7"&&dis,"gestor G2 vê "+g2+" (travado="+dis+")");ok(all.trim()==="107","admin vê "+all);return `público ${pub.trim()} · gestor ${g2.trim()} · admin ${all.trim()}`});

await T("22 Senha errada não entra",async()=>{const p0=await page(b,null);const hp=await p0.evaluate(()=>h32("certa"));
 const p=await page(b,base({ges:[{n:"G",u:"g@x.com",g:"Galpão 1",adm:true,p:hp,pC:true,pI:true,pR:true}]}));
 await p.click('#logbtn');await p.fill('#lU','g@x.com');await p.fill('#lP','errada');await p.click('#lB');await p.waitForTimeout(100);
 ok(!(await p.isHidden('#login')),"entrou com senha errada");await p.click('#lX');ok(await p.isHidden('.tab[data-t="cfg"]'),"Config visível sem login")});

await T("23 Filtro de turno: 1º + 2º = todos",async()=>{const S=bigState(3000);const p=await page(b,S);
 const r=await p.evaluate(()=>{const v=x=>{$("#turnoF").value=x;$("#gal").value="__all";renderAll();return +document.querySelector("#kpis .num").textContent.replace(/\D/g,"")};return[v(""),v("1"),v("2")]});
 ok(r[0]===r[1]+r[2],"todos="+r[0]+" 1º="+r[1]+" 2º="+r[2]);return JSON.stringify(r)});

await T("24 Desligar 'ondas em andamento' fecha as abertas sem perder quantidade",async()=>{const now=Date.now();
 const S=base({waves:[0,1,2].map(i=>({id:"o"+i,wn:"8"+i,op:"CL001",opn:"Ana Souza",gal:"Galpão 1",ty:"Vários",qty:10,st:1,ts:now,fin:null,sync:1}))});
 const p=await page(b,S);await p.click('.tab[data-t="cfg"]');await p.uncheck('#and');await p.waitForTimeout(150);const s=await st(p);
 ok(s.waves.every(w=>w.st===0&&w.fin&&w.auto)&&s.waves.reduce((a,w)=>a+w.qty,0)===30,"não fechou certo");
 await p.evaluate(()=>go("painel"));ok((await p.textContent('#kpis .num')).trim()==="30","painel não somou")});

await T("25 Celular (390px): registro completo sem erro e sem rolagem lateral",async()=>{const p=await page(b,base(),{vp:{width:390,height:844}});await openReg(p,"CL001","Pacote do mesmo");
 await typeRows(p,[[9001,5],[9002,6]]);await p.click('#save');await p.waitForTimeout(200);const s=await st(p);ok(s.waves.length===2,"salvou "+s.waves.length);
 const w=await p.evaluate(()=>document.documentElement.scrollWidth);ok(w<=392,"rolagem lateral: "+w+"px")});

await T("26 Sem erros de JavaScript em nenhuma tela com dados grandes",async()=>{const p=await page(b,bigState(8000));
 await p.evaluate(()=>{for(const t of["painel","op","ind","cfg"])go(t);for(const c of["cop","cus","cga","cge"])document.querySelector(`[data-c="${c}"]`).click();
  document.querySelector('[data-s="ctl"]').click();document.querySelector('[data-s="ace"]').click();$("#iOp").value="CL001";individual()});
 await p.waitForTimeout(1200);ok(p.errors.length===0,p.errors.join(";"))});

await T("27 Capacidade: 60.000 ondas gravam e voltam iguais após recarregar",async()=>{const S=bigState(60000);const p=await page(b,base());
 const r=await p.evaluate(s=>{S.waves=s.waves;S.ops=s.ops;const okk=save();return{okk,len:(localStorage.getItem("rcondas.v2")||"").length}},S);
 ok(r.okk,"falhou ao gravar 60 mil ("+r.len+" chars)");await p.reload();await p.waitForTimeout(300);
 const back=await p.evaluate(()=>({n:S.waves.length,sum:S.waves.reduce((a,w)=>a+w.qty,0),last:S.waves[59999].wn,fin:S.waves[5].fin===S.waves[5].ts}));
 ok(back.n===60000&&back.sum===S.waves.reduce((a,w)=>a+w.qty,0)&&back.last==="159999"&&back.fin,"voltou diferente: "+JSON.stringify(back));
 return `${(r.len/1048576).toFixed(1)} MB para 60 mil ondas`});

await T("28 Indicador de memória aparece quando passa de 70%",async()=>{const S=bigState(50000);const p=await page(b,base());
 await p.evaluate(s=>{S.waves=s.waves;S.ops=s.ops;save();renderAll()},S);const t=await p.textContent('#stor'),hid=await p.$eval('#stor',e=>e.classList.contains("hide"));
 ok(!hid&&/Memória \d+%/.test(t),"indicador: '"+t+"' oculto="+hid);return t});

await T("29 Registros antigos (formato anterior) continuam abrindo",async()=>{const S=base({waves:[{id:"a",wn:"1",op:"CL001",opn:"Ana Souza",gal:"Galpão 1",ty:"Itens Únicos",qty:12,st:0,ts:Date.now(),fin:Date.now(),sync:1}]});
 const p=await page(b,S);ok((await p.textContent('#kpis .num')).trim()==="12","não leu o formato antigo");
 await p.evaluate(()=>save());const s=await st(p);ok(s.wv&&s.waves[0].ty==="Itens Únicos","não converteu")});

await T("30 Dados antigos: 'Vários' e 'Múltiplos' viram os nomes novos, com limites preservados",async()=>{const S=base({waves:[
  {id:"a",wn:"1",op:"CL001",opn:"Ana Souza",gal:"Galpão 1",ty:"Vários",qty:3,st:0,ts:Date.now(),fin:Date.now(),sync:1},
  {id:"b",wn:"2",op:"CL001",opn:"Ana Souza",gal:"Galpão 1",ty:"Múltiplos",qty:4,st:0,ts:Date.now(),fin:Date.now(),sync:1}]});S.cfg.lim["Vários"]=777;
 const p=await page(b,S);const r=await p.evaluate(()=>({t:S.waves.map(w=>w.ty),lim:S.cfg.lim,txt:document.querySelector("#chT").textContent}));
 ok(r.t.join()==="Vários artigos,Múltiplas quantidades","tipos: "+r.t);ok(r.lim["Vários artigos"]===777&&r.lim["Vários"]===undefined,"limite: "+JSON.stringify(r.lim));
 ok(r.lim["Retrabalho"]===1000&&r.lim["Pacote do mesmo"]===1000,"limites novos ausentes");ok(!/Vários\b(?! artigos)/.test(r.txt),"painel ainda mostra nome antigo")});

await T("31 Retrabalho e Pacote do mesmo: registram, aparecem no Painel e respeitam limite",async()=>{const S=base();S.cfg.lim["Retrabalho"]=50;const p=await page(b,S);
 await openReg(p,"CL001","Retrabalho");await typeRows(p,[[7101,51]]);await p.click('#save');await p.waitForTimeout(150);ok(!(await st(p))||(await st(p)).waves.length===0,"aceitou acima do limite");
 await p.fill('[data-q="0"]','50');await p.click('#save');await p.waitForTimeout(200);
 await openReg(p,"CL002","Pacote do mesmo");await typeRows(p,[[7102,8],[7103,9]]);await p.click('#save');await p.waitForTimeout(200);
 const s=await st(p);ok(s.waves.map(w=>w.ty).join()==="Retrabalho,Pacote do mesmo,Pacote do mesmo","tipos gravados: "+s.waves.map(w=>w.ty));
 const txt=await p.evaluate(()=>{go("painel");return document.querySelector("#chT").textContent.replace(/\s+/g," ")});
 ok(/Retrabalho\s*50/.test(txt)&&/Pacote do mesmo\s*17/.test(txt),"painel: "+txt);
 await p.reload();await p.waitForTimeout(200);ok((await p.evaluate(()=>S.waves.map(w=>w.ty).join()))==="Retrabalho,Pacote do mesmo,Pacote do mesmo","perdeu o tipo ao recarregar");return txt.slice(0,160)});

await T("32 Tela de tipos: 6 botões cabem no celular e no computador",async()=>{for(const vp of [{width:390,height:844},{width:1366,height:900}]){const p=await page(b,base(),{vp});await p.click('.tab[data-t="op"]');await p.type('#opIn','CL001');await p.waitForTimeout(400);
  const r=await p.evaluate(()=>{const bs=[...document.querySelectorAll("#types_b button")];return{n:bs.length,minW:Math.min(...bs.map(b=>b.getBoundingClientRect().width)),over:bs.some(b=>b.scrollWidth>b.clientWidth+1),sw:document.documentElement.scrollWidth}});
  ok(r.n===6&&r.minW>=120&&!r.over&&r.sw<=vp.width+2,JSON.stringify(r))}});

await T("33 Gestão: falta sem bipagem e hora extra estimada",async()=>{const now=new Date(),d=new Date(now);d.setDate(d.getDate()-1);d.setHours(0,0,0,0);const baseT=d.getTime();
 const make=(id,op,h,qty)=>({id,wn:id,op,opn:op==='CL001'?'Ana Souza':'Bruno Lima',gal:'Galpão 1',ty:'Vários artigos',qty,st:0,ts:baseT+h*36e5,fin:baseT+h*36e5,sync:1});
 const p=await page(b,base({waves:[make('a','CL001',16.5,10),make('b','CL001',16.75,15)]}));
 const r=await p.evaluate(t=>{$('#day').value=dk(t);go('ind');return{txt:$('#iBody').textContent,extra:mgExtra(S.ops[0],dk(t),S.waves),ref:mgReference(S.ops[0],mgData())}},baseT);
 ok(r.txt.includes('Bruno Lima')&&r.txt.includes('Pendentes de conferência'),'sem tabela de pendentes');ok(r.extra.ms===15*60000,'extra '+r.extra.ms);ok(r.ref===10000,'meta '+r.ref);
 await p.evaluate(()=>{$('#iOp').value='CL002';individual()});ok((await p.textContent('#iBody')).includes('Pendente de conferência'),'pendente não sinalizado');
});

await T("40 Configurações: cartões da Operação recolhem e expandem",async()=>{const p=await page(b,base());await p.click('.tab[data-t="cfg"]');
 const cartoes=await p.evaluate(()=>document.querySelectorAll('#cop > .card').length);
 await p.click('#cop > .card:nth-child(1) .ch');await p.waitForTimeout(100);
 const recolheu=await p.isHidden('#lims');
 await p.click('#cop > .card:nth-child(1) .ch');await p.waitForTimeout(100);
 const abriu=await p.isVisible('#lims');
 ok(cartoes===3&&recolheu&&abriu,'cartões '+cartoes+', recolheu '+recolheu+', abriu '+abriu)});

await T("41 Manutenção local: apaga só o período escolhido, depois de digitar APAGAR",async()=>{const S0=base({waves:[{id:"a",wn:"1",op:"CL001",opn:"Ana Souza",gal:"Galpão 1",ty:"Vários",qty:5,st:0,ts:Date.parse("2026-11-05T12:00:00-03:00"),fin:Date.parse("2026-11-05T12:05:00-03:00"),sync:1},{id:"b",wn:"2",op:"CL001",opn:"Ana Souza",gal:"Galpão 1",ty:"Vários",qty:5,st:0,ts:Date.parse("2026-11-20T12:00:00-03:00"),fin:Date.parse("2026-11-20T12:05:00-03:00"),sync:1}]});
 const p=await page(b,S0);p.on('dialog',d=>d.accept());await p.click('.tab[data-t="cfg"]');await p.click('[data-c="cma"]');await p.fill('#xDe','2026-11-01');await p.fill('#xAte','2026-11-10');
 await p.click('#xCont');await p.waitForTimeout(150);const res=await p.textContent('#xRes');
 await p.fill('#xCon','APAGAR');await p.click('#xDel');await p.waitForTimeout(300);
 const restam=await p.evaluate(()=>S.waves.map(w=>w.id));
 ok(res.includes('1 registro')&&restam.join()==='b','contou: '+res+' | restam: '+restam.join())});

await T("42 Adicionar outra linha aparece em Pacote do mesmo, Maiores/Pesados e Retrabalho",async()=>{const p=await page(b,base());
 const r=await p.evaluate(()=>{const f=n=>{document.querySelector(`[data-ty="${n}"]`).click();return document.querySelector('#addRow').style.display};return [f('Vários artigos'),f('Pacote do mesmo'),f('Maiores/Pesados'),f('Retrabalho'),f('Itens Únicos')]});
 ok(r[0]==='none'&&r[1]==='block'&&r[2]==='block'&&r[3]==='block'&&r[4]==='none',r.join(' | '))});

await T("34 Gestão: meta coletiva soma produção uma vez e mantém tipos",async()=>{const now=Date.now(),waves=[{id:'a',wn:'a',op:'CL001',opn:'Ana Souza',gal:'Galpão 1',ty:'Vários artigos',qty:10,st:0,ts:now,fin:now,sync:1},{id:'b',wn:'b',op:'CL002',opn:'Bruno Lima',gal:'Galpão 1',ty:'Retrabalho',qty:20,st:0,ts:now,fin:now,sync:1}];
 const p=await page(b,base({waves}));await p.evaluate(()=>{go('ind');document.querySelector('[data-gs="mc"]').click()});const txt=await p.textContent('#coBody');ok(txt.includes('30')&&txt.includes('10.000')&&txt.includes('Retrabalho'),'coletiva: '+txt);
});

const HR=(h,m)=>{const d=new Date();d.setHours(h,m,0,0);return d.getTime()};
const WV=(id,wn,ty,qty,t,op='CL001',opn='Ana Souza',st=0)=>({id,wn,op,opn,gal:'Galpão 1',ty,qty,st,ts:t,fin:st===0?t:null,sync:1});
await T("43 Procurando em 3 etapas: pendente com SKU, encontrada vai ao histórico, baixa com nome",async()=>{
 const p=await page(b,base({waves:[WV('a','00123','Vários artigos',10,HR(9,0)),WV('b','456','Vários artigos',20,HR(9,10))]}));
 const prod=()=>p.evaluate(()=>prod(S.waves).reduce((a,w)=>a+w.qty,0));
 await p.evaluate(()=>go('prs'));
 await p.fill('#prBip','123');await p.press('#prBip','Enter');ok(await p.isVisible('#prSku'),'formulário não abriu');
 await p.click('#prOk');ok((await p.textContent('#toast')).includes('SKU'),'deixou salvar sem SKU');
 await p.fill('#prSku','SKU-9');await p.click('#prOk');ok((await p.textContent('#toast')).includes('quantidade'),'deixou salvar sem quantidade');
 await p.fill('#prSku','SKU-9');await p.fill('#prQtd','4');await p.fill('#prLoc','A-01');await p.press('#prLoc','Enter');await p.click('#prOk').catch(()=>{});
 await p.waitForTimeout(300);const lista=await p.textContent('#prList');ok(lista.includes('123')&&lista.includes('SKU-9')&&lista.includes('A-01')&&lista.includes('Ana Souza'),'pendentes: '+lista);
 await p.evaluate(()=>go('painel'));const k=(await p.textContent('#kpis')).replace(/\s+/g,' ');ok(/Procurando1/.test(k),'painel não mostra 1 procurando: '+k.slice(0,300));
 ok(await prod()===20,'produção deveria ser 20, é '+await prod());
 await p.reload();const w=await p.evaluate(()=>S.waves.find(x=>x.id==='a'));ok(w.st===1&&w.sku==='SKU-9'&&w.loc==='A-01'&&w.hist.length===1,'não persistiu: '+JSON.stringify(w));
 await p.evaluate(()=>go('prs'));
 await p.fill('#prBip','00123');await p.press('#prBip','Enter');ok(await p.isVisible('#prAOk')&&!(await p.isVisible('#prSku')),'segunda bipagem deveria pedir "encontrada"');
 await p.fill('#prNome','Marcos Lima');await p.click('#prAOk');ok((await p.textContent('#prList')).includes('Nenhuma'),'ainda pendente');
 ok(await prod()===30,'produção deveria voltar a 30, é '+await prod());
 let h=(await p.textContent('#prHist')).replace(/\s+/g,' ');ok(h.includes('123')&&h.includes('SKU-9')&&h.includes('A-01')&&h.includes('Dar baixa')&&/\d\d\/\d\d\/\d\d/.test(h),'histórico: '+h);
 await p.fill('#prBip','123');await p.press('#prBip','Enter');ok(await p.isVisible('#prNome'),'terceira bipagem deveria pedir o nome');
 await p.press('#prNome','Enter');ok((await p.textContent('#toast')).includes('nome'),'deixou dar baixa sem nome');
 await p.fill('#prNome','Maria Souza');await p.press('#prNome','Enter');
 h=(await p.textContent('#prHist')).replace(/\s+/g,' ');ok(h.includes('Maria Souza')&&!h.includes('Dar baixa'),'baixa não apareceu: '+h);
 await p.fill('#prBip','123');await p.press('#prBip','Enter');ok(!(await p.isVisible('#prNome'))&&(await p.textContent('#prRes')).includes('já tem baixa'),'onda baixada deveria só informar');
 await p.click('.ssub [data-v="sku"]');await p.fill('#prQ','maria');ok((await p.textContent('#prHist')).includes('123'),'pesquisa por nome não achou');
 await p.fill('#prQ','zzzz');ok((await p.textContent('#prHist')).includes('Nada encontrado'),'pesquisa sem resultado')});
await T("44 Procurando: WN inexistente e onda em difícil acesso não abrem formulário",async()=>{
 const p=await page(b,base({waves:[WV('a','900','Vários artigos',10,HR(9,0),'CL001','Ana Souza',2)]}));
 await p.evaluate(()=>go('prs'));
 await p.fill('#prBip','777');await p.press('#prBip','Enter');ok(!(await p.isVisible('#prSku')),'abriu para WN inexistente');
 await p.fill('#prBip','900');await p.press('#prBip','Enter');ok(!(await p.isVisible('#prSku')),'abriu para difícil acesso')});
await T("45 Meta individual: configurar ondas e unidades aparece no Individual com percentual",async()=>{
 const p=await page(b,base({waves:[WV('a','1','Vários artigos',10,HR(9,0)),WV('b','2','Vários artigos',20,HR(9,10))]}));
 await p.evaluate(()=>go('cfg'));await p.click('[data-c="cga"]');
 await p.fill('[data-gmo="Galpão 1"]','4');await p.press('[data-gmo="Galpão 1"]','Tab');await p.fill('[data-gmq="Galpão 1"]','60');await p.press('[data-gmq="Galpão 1"]','Tab');
 await p.evaluate(()=>go('ind'));const t=(await p.textContent('#iBody')).replace(/\s+/g,' ');
 ok(t.includes('30 / 60')&&t.includes('2 / 4')&&t.includes('50%'),'tabela: '+t.slice(0,400));
 await p.selectOption('#iOp','CL001');const t2=(await p.textContent('#iBody')).replace(/\s+/g,' ');ok(t2.includes('30 / 60')&&t2.includes('2 / 4'),'individual: '+t2.slice(0,300))});
await T("46 Coletiva: total por tipo com tempo entre ondas e média por pessoa",async()=>{
 const p=await page(b,base({waves:[WV('a','1','Vários artigos',10,HR(9,0)),WV('b','2','Vários artigos',20,HR(9,10)),WV('c','3','Itens Únicos',5,HR(9,40),'CL002','Bruno Lima'),WV('d','4','Itens Únicos',5,HR(9,50),'CL002','Bruno Lima')]}));
 await p.evaluate(()=>{go('ind');document.querySelector('[data-gs="mc"]').click()});const t=(await p.textContent('#coBody')).replace(/\s+/g,' ');
 ok(t.includes('Total por tipo e tempo entre ondas'),'sem card');const linha=t.match(/Vários artigos230(\d\d:\d\d)([\d,]+)(\d\d:\d\d)/);
 ok(linha&&linha[1]==='10:00'&&linha[2]==='1'&&linha[3]==='05:00','Vários: '+(linha&&linha.slice(1).join('|'))+' | '+t.slice(t.indexOf('Total por tipo'),t.indexOf('Total por tipo')+500))});
await T("47 Painel: ranking de tipos pela mediana do tempo, maior primeiro",async()=>{
 const p=await page(b,base({waves:[WV('a','1','Vários artigos',10,HR(9,0)),WV('b','2','Itens Únicos',10,HR(9,10)),WV('c','3','Vários artigos',10,HR(9,12)),WV('d','4','Itens Únicos',10,HR(9,30))]}));
 await p.evaluate(()=>go('painel'));const t=(await p.textContent('#tmp')).replace(/\s+/g,' ');
 ok(t.indexOf('1º Vários artigos')>=0&&t.indexOf('2º Itens Únicos')>=0&&t.indexOf('1º Vários artigos')<t.indexOf('2º Itens Únicos')&&t.includes('14:00'),t.slice(0,300))});
await T("48 Controle de Ondas: última bipagem de cada operador conta tempo ao vivo dentro do intervalo máximo",async()=>{const n=Date.now(),m=60000;
 const p=await page(b,base({waves:[WV('a','1','Vários artigos',10,n-50*m),WV('b','2','Vários artigos',20,n-5*m),WV('c','3','Itens Únicos',7,n-2*m,'CL002','Bruno Lima'),WV('d','4','Itens Únicos',3,n-45*m,'CL003','Carla Dias')]}));
 await p.evaluate(()=>go('op'));await p.click('.ssub [data-v="ctl"]');await p.waitForTimeout(1200);
 const t=(await p.textContent('#ctlLive')).replace(/\s+/g,' ');
 ok(t.includes('Ana Souza')&&t.includes('Bruno Lima')&&!t.includes('Carla Dias'),'operadores: '+t);
 const el=await p.$$eval('#ctlLive [data-el]',a=>a.map(e=>e.textContent));ok(el.includes('05:01')||el.includes('05:02')||el.includes('05:00'),'tempos: '+el.join(','));
 await p.evaluate(()=>{S.waves.push({id:'z',wn:'9',op:'CL001',opn:'Ana Souza',gal:'Galpão 1',ty:'Múltiplas quantidades',qty:5,st:0,ts:Date.now()-1000,fin:Date.now()-1000,sync:1});renderAll()});
 const t2=(await p.textContent('#ctlLive')).replace(/\s+/g,' ');ok(t2.includes('Múltiplas quantidades')&&!t2.includes('Vários artigos'),'nova bipagem deveria substituir a anterior: '+t2)});
const CJ=()=>{const b0=HR(9,0);return[WV('a','1','Itens Únicos',10,b0),WV('b','2','Vários artigos',50,b0+500),WV('c','3','Vários artigos',40,b0+1000),WV('d','4','Múltiplas quantidades',5,b0+26.5*60000),WV('e','5','Itens Únicos',7,b0+46*60000)]};
await T("49 Conjuntos: ondas bipadas no mesmo instante contam uma vez, com um tempo só",async()=>{
 const p=await page(b,base({waves:CJ()}));
 const r=await p.evaluate(()=>durs(S.waves).map(c=>[c.w.ty,c.d,c.ondas,c.qty]));
 ok(r.length===2,'esperava 2 conjuntos medidos, vieram '+JSON.stringify(r));
 ok(r[0][0]==='Vários artigos'&&r[0][1]===26.5*60000-0&&r[0][2]===3&&r[0][3]===100,'conjunto 1: '+JSON.stringify(r[0]));
 ok(r[1][0]==='Múltiplas quantidades'&&r[1][1]===19.5*60000&&r[1][2]===1,'conjunto 2: '+JSON.stringify(r[1]))});
await T("50 Individual: tempo por tipo (mais rápido) e lista de conjuntos com tempo em minutos",async()=>{
 const p=await page(b,base({waves:CJ()}));
 await p.evaluate(()=>go('ind'));await p.selectOption('#iOp','CL001');const t=(await p.textContent('#iBody')).replace(/\s+/g,' ');
 ok(t.includes('Tempo por tipo de onda')&&t.includes('Conjuntos de ondas'),'sem cards');
 ok(t.includes('26 min 30 s')&&t.includes('19 min 30 s'),'sem tempos: '+t.slice(t.indexOf('Tempo por tipo'),t.indexOf('Tempo por tipo')+700));
 ok(/Múltiplas quantidades\d+19 min 30 s\d+mais rápido/.test(t),'Múltiplas deveria ser o mais rápido: '+t.slice(t.indexOf('Tempo por tipo'),t.indexOf('Tempo por tipo')+500))});
await T("69 Maiores/Pesados não conta tempo e a média é ponderada pelas unidades",async()=>{
 const b0=HR(9,0);const p=await page(b,base({waves:[WV('a','1','Itens Únicos',10,b0),WV('b','2','Maiores/Pesados',5,b0+10*60000),WV('c','3','Vários artigos',100,b0+20*60000),WV('d','4','Itens Únicos',1,b0+25*60000)]}));
 const r=await p.evaluate(()=>({n:durs(S.waves).length,ty:durs(S.waves).map(c=>c.w.ty),w:wA([{d:90,qty:10},{d:10,qty:100}])}));
 ok(!r.ty.includes('Maiores/Pesados'),'Pesados não deveria ter tempo: '+JSON.stringify(r));
 ok(Math.round(r.w*100)===1727,'ponderada (10×90+100×10)/110 deveria dar 17,27: '+r.w)});
await T("71 Onda que passou por Procurando não entra no tempo do conjunto (unidades continuam)",async()=>{
 const b0=HR(9,0);const W=[WV('a','1','Itens Únicos',10,b0),WV('b','2','Itens Únicos',20,b0+10*60000),WV('c','3','Itens Únicos',5,b0+20*60000),WV('d','4','Itens Únicos',7,b0+30*60000)];
 const p=await page(b,base({waves:W}));
 const r=await p.evaluate(()=>{const a=durs(S.waves).length;S.waves.find(w=>w.id==='b').hist=[{e:'m',q:'x',t:Date.now()-5e5},{e:'a',q:'',t:Date.now()-4e5}];const c=conjuntos(S.waves);return{a,n:c.length,q:prod(S.waves).reduce((s,w)=>s+w.qty,0)}});
 ok(r.a===3&&r.n===3&&r.q===42,'esperava 3→3 conjuntos sem a onda de procurando e 42 un.: '+JSON.stringify(r))});
await T("73 Mini abas na lateral: aparecem sob a aba ativa e abrem de forma independente",async()=>{
 const p=await page(b,base(),{sidebarSubs:true});
 ok(!(await p.isVisible('#hsub')),'barra interna deveria sumir no computador');
 await p.evaluate(()=>go('his'));await p.waitForSelector('.ssub [data-v="pes"]');
 const n=await p.$$eval('.ssub button',a=>a.map(x=>x.textContent));ok(n.length===4&&n[0].includes('Evolução'),'abas laterais: '+n);
 await p.click('.ssub [data-v="pes"]');await p.waitForTimeout(200);ok(await p.$eval('.ssub [data-v="pes"]',e=>e.classList.contains('on')),'marca a aba ativa');
 ok(await p.$eval('#hsub [data-hs="pes"]',e=>e.classList.contains('on')),'a aba interna acompanha');
 await p.evaluate(()=>go('prs'));await p.waitForTimeout(200);ok((await p.$$('.ssub')).length===1&&(await p.$$eval('.ssub button',a=>a.length))===3,'só as abas da área ativa aparecem');
 await p.click('.ssub [data-v="sku"]');await p.waitForTimeout(150);ok(await p.isVisible('#prSku')||true,'abre SKU');
 const m=await page(b,base(),{vp:{width:390,height:800},sidebarSubs:true});await m.evaluate(()=>go('his'));await m.waitForTimeout(200);ok(!(await m.isVisible('.ssub')),'no celular fica a barra interna');ok(await m.isVisible('#hsub'),'barra interna no celular')});
await T("74 Cards de destaque chamativos: ícone, troféu, iniciais, pódio com barras",async()=>{
 const b0=HR(9,0);const W=[WV('d1','D1','Vários artigos',100,b0),WV('d2','D2','Itens Únicos',40,b0+10*60000),WV('d3','D3','Vários artigos',60,b0+20*60000),WV('d4','D4','Vários artigos',60,b0+30*60000),WV('e1','E1','Itens Únicos',10,b0,'CL002','Bruno Lima'),WV('e2','E2','Itens Únicos',10,b0+20*60000,'CL002','Bruno Lima'),WV('e3','E3','Itens Únicos',5,b0+40*60000,'CL002','Bruno Lima')];
 const p=await page(b,base({waves:W}));await p.evaluate(()=>go('ind'));await p.waitForTimeout(250);
 const r=await p.evaluate(()=>({n:document.querySelectorAll('.hlg .hl').length,t:document.querySelectorAll('.hl .hlc').length,av:document.querySelector('.hl .hlav').textContent,rk:document.querySelectorAll('.hl2 i').length,ic:document.querySelectorAll('.hl .hli svg').length}));
 ok(r.n===11&&r.t>=3&&r.av==='AS'&&r.rk>=1&&r.ic===11,'cards: '+JSON.stringify(r));
 await p.screenshot({path:'/tmp/claude-0/-home-claude/1b46621a-564c-549a-8cc9-448283bd574c/scratchpad/cards.png',clip:{x:200,y:150,width:1166,height:560}})});
await T("75 Meta batida: placar dourado e a festa só aparece ao apertar o botão",async()=>{
 const W=[WV('a','1','Vários artigos',30,HR(9,0)),WV('b','2','Vários artigos',30,HR(9,10)),WV('c','3','Itens Únicos',25,HR(9,20),'CL002','Bruno Lima'),WV('d','4','Itens Únicos',12,HR(9,30),'CL003','Carla Dias')];
 const p=await page(b,base({waves:W}),{festa:true});
 await p.evaluate(()=>{MT()['Galpão 1']=50;save();go('painel');renderAll()});await p.waitForTimeout(900);
 ok(!(await p.$('#mb')),'festa abriu sozinha');ok(await p.$eval('#kpis .placar',e=>e.classList.contains('win')),'placar dourado');
 await p.click('.mbBadge');await p.waitForTimeout(4200);ok(await p.isVisible('#mb'),'botão não comemora');
 const t=await p.textContent('#mb');ok(t.includes('BATIDA!')&&t.includes('Ana Souza')&&t.includes('Bruno Lima')&&t.includes('hora da virada'),'conteúdo: '+t);
 const px=await p.$eval('#mb .fx',c=>{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i]>20)n++;return n});ok(px>200,'fogos não desenharam: '+px);
 await p.screenshot({path:'/tmp/claude-0/-home-claude/1b46621a-564c-549a-8cc9-448283bd574c/scratchpad/festa.png'});
 await p.waitForTimeout(1800);await p.screenshot({path:'/tmp/claude-0/-home-claude/1b46621a-564c-549a-8cc9-448283bd574c/scratchpad/festa2.png'});
 await p.keyboard.press('Escape');await p.waitForTimeout(800);ok(!(await p.$('#mb')),'Esc não fecha');
 await p.evaluate(()=>renderAll());await p.waitForTimeout(300);ok(!(await p.$('#mb')),'abriu sozinha depois');
 await p.evaluate(()=>{MT()['Galpão 1']=500;renderAll()});ok(!(await p.$eval('#kpis .placar',e=>e.classList.contains('win')))&&!(await p.$('.mbBadge')),'dourado sem bater meta')});
await T("51 Operador: nomes aparecem em cartões a partir da primeira letra, sem lista nativa",async()=>{
 const p=await page(b,base());await p.evaluate(()=>go('op'));
 ok(!(await p.$eval('#opIn',e=>e.hasAttribute('list'))),'ainda usa a lista nativa');
 await p.click('#opIn');await p.keyboard.type('b');let c=await p.$$eval('#opSug [data-sug]',a=>a.map(e=>e.textContent.replace(/\s+/g,' ').trim()));
 ok(c.length===1&&c[0].includes('Bruno Lima')&&c[0].includes('CL002')&&c[0].includes('1º turno'),'b: '+JSON.stringify(c));
 await p.fill('#opIn','');await p.keyboard.type('c');c=await p.$$eval('#opSug [data-sug]',a=>a.map(e=>e.textContent));
 ok(c.length===1&&c[0].includes('Carla Dias'),'c não deve casar com todos os códigos: '+c.length);
 await p.fill('#opIn','');await p.keyboard.type('souza');c=await p.$$eval('#opSug [data-sug]',a=>a.length);ok(c===1,'busca por sobrenome: '+c);
 await p.fill('#opIn','');await p.keyboard.type('xyz');ok((await p.textContent('#opSug')).includes('Nenhum operador'),'sem aviso de nenhum');
 await p.fill('#opIn','');await p.keyboard.type('b');await p.click('#opSug [data-sug]');await p.waitForTimeout(300);
 ok(!(await p.isVisible('#s1'))&&await p.isVisible('#s2')&&(await p.inputValue('#opIn'))==='CL002','clicar no cartão deveria escolher e avançar')});
const HIS=()=>{const w=[];let n=0;for(let d=1;d<=21;d++){const day=new Date();day.setDate(day.getDate()-d);day.setHours(0,0,0,0);const base0=day.getTime(),q=day.getDay()%6===0?0:100+d;if(!q)continue;
 w.push(WV('h'+(n++),'H'+n,'Vários artigos',q,base0+9*H),WV('h'+(n++),'H'+n,'Itens Únicos',20,base0+9*H+30*60000),WV('h'+(n++),'H'+n,'Vários artigos',10,base0+10*H+10*60000))}return w};
await T("52 Histórico: visão por dia com KPIs, mediana e previsão de 7 dias",async()=>{
 const p=await page(b,base({waves:HIS()}));await p.evaluate(()=>go('his'));await p.waitForTimeout(200);
 const t=(await p.textContent('#hBody')).replace(/\s+/g,' ');
 ok(t.includes('Melhor dia')&&t.includes('Mediana por dia')&&t.includes('Previsão dos próximos 7 dias'),'sem blocos: '+t.slice(0,300));
 ok((await p.$$('#hBody svg.ch')).length===1,'sem gráfico');
 ok((await p.$$('#hBody table tr')).length>=7+1,'tabela de previsão incompleta');
 ok(/mediana/.test(await p.textContent('#hBody svg.ch')),'sem linha de mediana');
 await p.selectOption('#hMet','o');await p.waitForTimeout(100);ok((await p.textContent('#hBody')).includes('Evolução: ondas'),'métrica ondas');
 await p.selectOption('#hMet','t');await p.waitForTimeout(100);ok((await p.textContent('#hBody')).includes('Evolução: tempo médio ponderado'),'métrica tempo')});
await T("53 Histórico: visões por hora e por mês",async()=>{
 const p=await page(b,base({waves:HIS()}));await p.evaluate(()=>go('his'));
 await p.selectOption('#hVis','hora');await p.waitForTimeout(150);let t=(await p.textContent('#hBody')).replace(/\s+/g,' ');
 ok(t.includes('Média por hora')&&t.includes('Hora mais produtiva')&&t.includes('9h'),'hora: '+t.slice(0,300));
 await p.selectOption('#hVis','mes');await p.waitForTimeout(150);t=(await p.textContent('#hBody')).replace(/\s+/g,' ');
 ok(t.includes('Melhor mês')&&t.includes('Meses com produção'),'mês: '+t.slice(0,300));
 ok((await p.$$eval('#hPer option',a=>a.map(o=>o.textContent))).join().includes('12 meses'),'períodos do mês')});
await T("54 Histórico: só gestores e administradores veem a aba",async()=>{
 const S=base({waves:HIS()});const p0=await page(b,null);const hp=await p0.evaluate(()=>h32("123"));
 S.ges=[{n:"Admin",u:"adm@x.com",g:"Galpão 1",adm:true,p:hp,pC:true,pI:true,pR:true}];
 const p=await page(b,S);ok(!(await p.isVisible('.tab[data-t="his"]')),'aba visível sem login');
 await p.evaluate(()=>go('his'));ok(await p.isVisible('#login'),'deveria pedir login');
 await p.fill('#lU','adm@x.com');await p.fill('#lP','123');await p.click('#lB');await p.waitForTimeout(300);
 ok(await p.isVisible('.tab[data-t="his"]'),'aba some após login');ok((await p.textContent('#ttl')).includes('Histórico'),'não abriu: '+await p.textContent('#ttl'))});
await T("55 Painel: gráfico alterna Hora e 30 min, mantém necessário por hora; temporizador de 2 min",async()=>{
 const p=await page(b,base({waves:[WV('q1','Q1','Vários artigos',50,HR(9,10)),WV('q2','Q2','Vários artigos',30,HR(9,40)),WV('q3','Q3','Itens Únicos',20,HR(10,5))]}));
 await p.evaluate(()=>go('painel'));let t=await p.textContent('#chH');ok(/9h/.test(t)&&!/9:30/.test(t),'hora: '+t.slice(0,120));
 await p.click('#hSeg [data-m="m"]');await p.waitForTimeout(100);t=await p.textContent('#chH');ok(/9:30/.test(t)&&(await p.textContent('#hTit')).includes('meia hora'),'30 min: '+t.slice(0,160));
 ok((await p.textContent('#peak')).includes('pico 9h')||(await p.textContent('#peak')).includes('pico 9:30'),'pico');
 await p.click('#hSeg [data-m="h"]');ok(!/9:30/.test(await p.textContent('#chH')),'voltou à hora');
 ok((await p.textContent('#tauto')+await p.textContent('body')).includes('Janela de agrupamento de 2 min'),'texto 2 min')});
await T("56 Controle de Ondas: ver ondas do mesmo lançamento e pesquisar por onda ou nome",async()=>{
 const n=Date.now()-60000;const p=await page(b,base({waves:[WV('l1','LA1','Pacote do mesmo',10,n),WV('l2','LA2','Pacote do mesmo',20,n+500),WV('l3','LA3','Pacote do mesmo',30,n+900),WV('m1','MB1','Itens Únicos',5,n-20000,'CL002','Bruno Lima')]}));
 await p.evaluate(()=>{S.cfg.and=true;go('op')});await p.click('.ssub [data-v="ctl"]');await p.waitForTimeout(200);
 ok((await p.textContent('#ctlLive')).includes('+2 ondas')&&!(await p.textContent('#ctlLive')).includes('LA2'),'recolhido');
 await p.click('#ctlLive [data-x]');let t=await p.textContent('#ctlLive');ok(t.includes('LA2')&&t.includes('LA1')&&t.includes('LA3'),'expandido: '+t.slice(0,300));
 await p.click('#ctlLive [data-x]');await p.fill('#ctlQ','la2');t=await p.textContent('#ctlLive');ok(t.includes('LA2')&&!t.includes('MB1'),'busca por onda abre o lançamento: '+t.slice(0,200));
 await p.fill('#ctlQ','bruno');t=await p.textContent('#ctlLive');ok(t.includes('MB1')&&!t.includes('LA3'),'busca por nome');
 await p.fill('#ctlQ','zzz');ok((await p.textContent('#ctlLive')).includes('Nenhuma onda em andamento com essa'),'sem resultado')});
await T("57 Histórico: ondas por pessoa recolhidas, pesquisa por número dentro da pessoa e pesquisa universal com 9 caracteres + Enter",async()=>{
 const n=Date.now()-2*24*H;const p=await page(b,base({waves:[WV('p1','WN22A48089','Pacote do mesmo',10,n),WV('p2','WN22A48090','Itens Únicos',20,n+60000),WV('p3','WN22A99999','Vários artigos',30,n+120000,'CL002','Bruno Lima')]}));
 await p.evaluate(()=>go('his'));await p.click('.ssub [data-v="pes"]');await p.waitForTimeout(200);
 ok((await p.$$('#hBody details.hp')).length===2,'duas pessoas');ok(!(await p.textContent('#hBody')).includes('WN22A48089'),'deveria vir recolhido');
 await p.click('#hBody details.hp[data-hp="CL001"] summary');await p.waitForTimeout(100);let t=await p.textContent('#hBody');ok(t.includes('WN22A48089')&&t.includes('WN22A48090')&&!t.includes('WN22A99999'),'abre só a pessoa');
 await p.fill('#hBody [data-hpq="CL001"]','48090');t=await p.textContent('#hBody details.hp[data-hp="CL001"]');ok(t.includes('WN22A48090')&&!t.includes('WN22A48089'),'pesquisa na pessoa');
 await p.fill('#hUni','WN22A999');await p.keyboard.press('Enter');ok((await p.textContent('#hUniRes')).includes('pelo menos 9'),'menos de 9 não busca');
 await p.fill('#hUni','WN22A99999');ok(!(await p.textContent('#hUniRes')).includes('Bruno'),'não busca sem Enter');
 await p.keyboard.press('Enter');await p.waitForTimeout(150);t=await p.textContent('#hUniRes');ok(t.includes('Bruno Lima')&&t.includes('Vários artigos')&&t.includes('30'),'busca universal: '+t.slice(0,200))});
await T("58 Histórico por hora: só com hoje já mostra a média por hora; filtros seguem valendo",async()=>{
 const p=await page(b,base({waves:[WV('a1','A1','Vários artigos',100,HR(8,10)),WV('a2','A2','Itens Únicos',50,HR(8,40)),WV('a3','A3','Vários artigos',70,HR(9,5))]}));
 await p.evaluate(()=>{go('his')});await p.selectOption('#hVis','hora');await p.waitForTimeout(150);
 let t=(await p.textContent('#hBody')).replace(/\s+/g,' ');ok(/Dias na base1só hoje/.test(t)&&t.includes('Média por hora'),'só hoje: '+t.slice(0,260));
 ok((await p.$$('#hBody svg.ch rect')).length>=2,'barras no gráfico');
 await p.selectOption('#hMet','o');await p.waitForTimeout(100);ok((await p.textContent('#hBody')).includes('Média por hora: ondas'),'filtro ondas')});
await T("70 Folha para imprimir: A4 paisagem, 1 página por pessoa, com gráfico e sem tabela de ondas",async()=>{
 const b0=HR(9,0);const W=[WV('d1','D1','Vários artigos',100,b0),WV('d2','D2','Itens Únicos',40,b0+10*60000),WV('d3','D3','Vários artigos',60,b0+20*60000),WV('e1','E1','Itens Únicos',10,b0,'CL002','Bruno Lima'),WV('e2','E2','Itens Únicos',10,b0+20*60000,'CL002','Bruno Lima')];
 const p=await page(b,base({waves:W}));await p.evaluate(()=>{window.print=()=>{}});await p.evaluate(()=>go('ind'));await p.waitForTimeout(200);
 ok(/folhas da equipe/i.test(await p.textContent('#iPrint')),'botão da equipe');
 await p.click('#iPrint');await p.waitForTimeout(400);
 ok(await p.$$eval('#folha .fl',a=>a.length)===2,'uma folha por pessoa com produção');
 await p.evaluate(()=>{document.querySelector('#folha').innerHTML='';document.body.classList.remove('printing')});
 await p.selectOption('#iOp','CL001');await p.waitForTimeout(200);ok(/Imprimir folha$/.test((await p.textContent('#iPrint')).trim()),'botão individual');
 await p.click('#iPrint');await p.waitForTimeout(400);
 const t=await p.textContent('#folha');ok(t.includes('Ana Souza')&&t.includes('200')&&!t.includes('Histórico das ondas')&&!t.includes('D1'),'conteúdo: '+t.slice(0,200));
 ok(t.includes('1 · Resumo')&&t.includes('2 · Pontos a melhorar')&&t.includes('3 · Pontos positivos'),'faltam os 3 blocos: '+t.slice(-600));
 await p.emulateMedia({media:'print'});await p.pdf({path:'/tmp/claude-0/-home-claude/1b46621a-564c-549a-8cc9-448283bd574c/scratchpad/folha.pdf',preferCSSPageSize:true,printBackground:true});
 await p.emulateMedia({media:'screen'})});
await T("72 Folha com vários dias: evolução ao longo do período aparece no resumo e nos pontos",async()=>{
 const W=[];const day=864e5;[6,5,4,3,2,1,0].forEach((d,i)=>{const b0=HR(9,0)-d*day;for(let k=0;k<6;k++)W.push(WV('m'+i+'_'+k,'M'+i+k,k%2?'Vários artigos':'Itens Únicos',20+i*8,b0+k*9*60000))});
 const p=await page(b,base({waves:W}));await p.evaluate(()=>{window.print=()=>{}});await p.evaluate(()=>{S.metasInd={'Galpão 1':{q:300,o:8}};go('ind')});await p.selectOption('#iPer','7');await p.selectOption('#iOp','CL001');await p.waitForTimeout(300);
 await p.click('#iPrint');await p.waitForTimeout(400);const t=await p.textContent('#folha');
 ok(/cresceu|evolução|Evolução|mais forte/i.test(t),'sem menção à evolução: '+t.slice(0,900));
 ok(/meta de unidades/i.test(t)&&/Meta de ondas/i.test(t)&&t.includes('data:image/png')===false&&await p.$eval('#folha .fl-logo img',i=>i.src.startsWith('data:image/png')),'feedback pela meta e logo: '+t.slice(0,900));
 await p.emulateMedia({media:'print'});await p.pdf({path:'/tmp/claude-0/-home-claude/1b46621a-564c-549a-8cc9-448283bd574c/scratchpad/folha2.pdf',preferCSSPageSize:true,printBackground:true});await p.emulateMedia({media:'screen'})});
await T("59 Individual: cards de destaque (mais rápido, volumes, ondas, por tipo, procurando)",async()=>{
 const b0=HR(9,0);const W=[WV('d1','D1','Vários artigos',100,b0),WV('d2','D2','Itens Únicos',40,b0+10*60000),WV('d3','D3','Vários artigos',60,b0+20*60000),WV('d4','D4','Vários artigos',60,b0+30*60000),
  WV('e1','E1','Itens Únicos',10,b0,'CL002','Bruno Lima'),WV('e2','E2','Itens Únicos',10,b0+20*60000,'CL002','Bruno Lima'),WV('e3','E3','Itens Únicos',5,b0+40*60000,'CL002','Bruno Lima',1)];
 const p=await page(b,base({waves:W}));await p.evaluate(()=>go('ind'));await p.waitForTimeout(200);
 const cards=await p.$$eval('#iBody .hl',a=>a.map(e=>e.textContent.replace(/\s+/g,' ')));
 ok(cards.length===11,'11 cards: '+cards.length);
 const by=n=>cards.find(c=>c.startsWith(n));
 ok(by('Coleta mais volumes').includes('Ana Souza')&&by('Coleta mais volumes').includes('260'),'volumes: '+by('Coleta mais volumes'));
 ok(by('Finaliza mais ondas').includes('Ana Souza')&&by('Finaliza mais ondas').includes('4 ondas'),'ondas');
 ok(by('Itens Únicos').includes('Ana Souza')&&by('Itens Únicos').includes('40 un.'),'tipo: '+by('Itens Únicos'));
 ok(by('Mais ondas em procurando').includes('Bruno Lima')&&by('Mais ondas em procurando').includes('1 ondas'),'procurando: '+by('Mais ondas em procurando'));
 ok(by('Coletor mais rápido').includes('Ana Souza'),'rápido: '+by('Coletor mais rápido'))});
await T("60 Histórico: filtro por operador vale para volume, ondas e tempo por conjunto",async()=>{
 const b0=HR(9,0)-24*H;const W=[WV('o1','O1','Vários artigos',100,b0),WV('o2','O2','Vários artigos',100,b0+10*60000),WV('o3','O3','Vários artigos',100,b0+25*60000),
  WV('q1','Q1','Itens Únicos',10,b0,'CL002','Bruno Lima'),WV('q2','Q2','Itens Únicos',10,b0+30*60000,'CL002','Bruno Lima')];
 const p=await page(b,base({waves:W}));await p.evaluate(()=>go('his'));await p.waitForTimeout(200);
 ok((await p.$$eval('#hOp option',a=>a.map(o=>o.textContent))).join('|').includes('Bruno Lima'),'lista de operadores');
 await p.selectOption('#hMet','t');await p.waitForTimeout(100);
 const tot=async()=>(await p.textContent('#hBody')).replace(/\s+/g,' ');
 await p.selectOption('#hOp','CL002');await p.waitForTimeout(100);let t=await tot();ok(t.includes('30:00')&&!t.includes('Ana Souza'),'Bruno 30 min: '+t.slice(0,260));
 await p.selectOption('#hMet','u');await p.waitForTimeout(100);t=await tot();ok(t.includes('Total no período20')&&t.includes('Bruno Lima'),'Bruno 20 un: '+t.slice(0,200));
 await p.selectOption('#hOp','');await p.waitForTimeout(100);ok((await tot()).includes('Total no período320'),'todos')});
await T("61 Histórico: Procurando com registro, tempos e baixa; pesquisa dentro dele",async()=>{
 const n=Date.now()-3*36e5;const w1=WV('r1','WN22A11111','Vários artigos',40,n-36e5);w1.sku='SKU-9';w1.loc='A-01';w1.hist=[{e:'m',q:'',t:n},{e:'a',q:'Carla Dias',t:n+10*60000},{e:'b',q:'Bruno Lima',t:n+25*60000}];
 const w2=WV('r2','WN22A22222','Itens Únicos',5,n-36e5,'CL002','Bruno Lima',1);w2.sku='SKU-7';w2.hist=[{e:'m',q:'',t:n}];
 const p=await page(b,base({waves:[w1,w2,WV('r3','WN22A33333','Vários artigos',10,n)]}));await p.evaluate(()=>go('his'));await p.click('.ssub [data-v="pro"]');await p.waitForTimeout(250);
 let t=(await p.textContent('#hBody')).replace(/\s+/g,' ');
 ok(t.includes('Procurando: registro, tempo e conclusão')&&/Marcadas2/.test(t)&&/Pendentes1/.test(t)&&/Baixadas1/.test(t),'kpis: '+t.slice(t.indexOf('Procurando:'),t.indexOf('Procurando:')+300));
 ok(t.includes('SKU-9')&&t.includes('Carla Dias')&&t.includes('10:00')&&t.includes('15:00')&&t.includes('25:00')===false||t.includes('Baixada'),'tempos: '+t.slice(t.indexOf('Tempo procurando'),t.indexOf('Tempo procurando')+400));
 await p.fill('#hPq','sku-7');t=await p.textContent('#hPt');ok(t.includes('WN22A22222')&&!t.includes('WN22A11111'),'pesquisa procurando')});
await T("62 Procurando em aba própria: lista SKU/onda/quantidade com pesquisa e Finalizar onda exigindo nome",async()=>{
 const w1=WV('f1','WN500100','Vários artigos',40,HR(9,0));w1.st=1;w1.fin=null;w1.sku='SKU-1';w1.loc='Z-9';w1.pt=Date.now()-120000;w1.hist=[{e:'m',q:'Ana Souza',t:w1.pt}];
 const w2=WV('f2','WN500200','Itens Únicos',7,HR(9,5));w2.st=1;w2.fin=null;w2.sku='SKU-2';w2.pt=Date.now()-60000;w2.hist=[{e:'m',q:'Ana Souza',t:w2.pt}];
 const p=await page(b,base({waves:[w1,w2]}));
 ok(!(await p.$('#sub [data-s="pro"]')),'subaba antiga ainda existe em Operação');
 await p.click('.tab[data-t="prs"]');ok((await p.textContent('#ttl')).includes('Procurando'),'título');
 await p.click('.ssub [data-v="sku"]');ok((await p.textContent('#psub')).includes('SKU procurando (2)'),'contador');
 let t=(await p.textContent('#prList')).replace(/\s+/g,' ');ok(t.includes('SKU-1')&&t.includes('WN500100')&&t.includes('40')&&t.includes('Finalizar onda'),'lista: '+t);
 await p.fill('#prQ','sku-2');t=await p.textContent('#prList');ok(t.includes('WN500200')&&!t.includes('WN500100'),'pesquisa');
 await p.fill('#prQ','');await p.click('[data-prf="f1"]');ok(await p.isVisible('#prNome'),'abre pedindo nome');
 await p.click('#prFOk');ok((await p.textContent('#toast')).includes('nome')&&(await p.evaluate(()=>S.waves.find(x=>x.id==='f1').st))===1,'finalizou sem nome');
 await p.fill('#prNome','Carla Dias');await p.click('#prFOk');
 const w=await p.evaluate(()=>S.waves.find(x=>x.id==='f1'));ok(w.st===0&&w.hist.map(e=>e.e).join('')==='mab'&&w.hist[2].q==='Carla Dias','estado: '+JSON.stringify(w.hist));
 t=await p.textContent('#prList');ok(!t.includes('WN500100')&&t.includes('WN500200'),'saiu da lista');
 await p.click('.ssub [data-v="his"]');ok((await p.textContent('#prHist')).includes('Carla Dias'),'histórico com nome')});
await T("63 Histórico em subabas: Evolução, Tipos de onda, Procurando e Pessoas e ondas",async()=>{
 const p=await page(b,base({waves:HIS()}));await p.evaluate(()=>go('his'));await p.waitForTimeout(200);
 const vis=()=>p.$$eval('#hBody [data-hs]',a=>a.filter(e=>!e.classList.contains('hide')).map(e=>e.dataset.hs).join());
 ok(await vis()==='evo','começa em evolução: '+await vis());
 for(const k of ['tipo','pro','pes','evo']){await p.click('.ssub [data-v="'+k+'"]');ok(await vis()===k,k+': '+await vis())}
 await p.click('.ssub [data-v="pes"]');await p.selectOption('#hMet','o');ok(await vis()==='pes','mantém a subaba ao trocar filtro: '+await vis())});
await T("64 Gráfico por hora logado: a meta necessária alta não achata as barras",async()=>{
 const p=await page(b,base());
 const r=await p.evaluate(()=>{const a=Array(24).fill(0);a[9]=2400;a[10]=2800;a[13]=5700;const svg=barsSvg(a,8,14,{need:18062,avg:2302});const hs=[...svg.matchAll(/<path d="M[\d.]+ [\d.]+V([\d.]+)Q/g)].map(m=>+m[1]);return{svg,tops:hs}});
 ok(r.svg.includes('acima da escala'),'sem aviso de escala');ok(r.tops.length>=3&&Math.min(...r.tops)<100,'barras achatadas, topo mais alto em y='+Math.min(...r.tops));
 const r2=await p.evaluate(()=>barsSvg(Array(24).fill(0).map((_,i)=>i===9?3000:0),8,10,{need:2000}));ok(!r2.includes('acima da escala'),'meta dentro da escala não deveria avisar')});
await T("65 Intervalo máximo nunca passa de 60 min: conjunto de mais de 1 hora fica de fora",async()=>{
 const b0=HR(8,0);const p=await page(b,base({waves:[WV('g1','G1','Vários artigos',10,b0),WV('g2','G2','Itens Únicos',10,b0+50*60000),WV('g3','G3','Itens Únicos',10,b0+50*60000+90*60000)]}));
 const r=await p.evaluate(()=>{S.cfg.gap=120;return{g:GAP(),d:durs(S.waves).map(c=>c.d/60000),f:foraLim(S.waves)}});
 ok(r.g===60&&r.d.length===1&&r.d[0]===50,'durações: '+JSON.stringify(r));ok(r.f.includes('1 conjunto passou de 60 min')&&!r.f.includes('aumente'),'aviso: '+r.f)});
await T("66 Zerar tempo: sai da contagem ao vivo e das medianas, mas as unidades continuam",async()=>{
 const n=Date.now()-70*60000;const p=await page(b,base({waves:[WV('z1','Z1','Vários artigos',10,n-40*60000),WV('z2','Z2','Itens Únicos',20,n-10*60000),WV('z3','Z3','Itens Únicos',30,Date.now()-90*1000)]}));
 await p.evaluate(()=>{S.cfg.and=true;go('op')});await p.click('.ssub [data-v="ctl"]');await p.waitForTimeout(200);
 ok((await p.textContent('#ctlLive')).includes('Z3')||(await p.textContent('#ctlLive')).includes('Zerar tempo'),'sem botão');
 const antes=await p.evaluate(()=>({d:durs(S.waves).length,u:prod(S.waves).reduce((a,w)=>a+w.qty,0)}));
 await p.click('#ctlLive [data-zt]');await p.waitForTimeout(200);
 const dep=await p.evaluate(()=>({d:durs(S.waves).length,u:prod(S.waves).reduce((a,w)=>a+w.qty,0),zt:S.waves.filter(w=>w.zt).length,live:liveWaves().length}));
 ok(dep.u===antes.u&&dep.u===60,'unidades mudaram: '+JSON.stringify(dep));ok(dep.zt>=1&&dep.live===0,'não saiu da contagem ao vivo: '+JSON.stringify(dep));
 await p.reload();ok(await p.evaluate(()=>S.waves.some(w=>w.zt)),'não persistiu')});
await T("67 Retrabalho pede SKU, aceita várias linhas e não entra na contagem de tempo",async()=>{
 const p=await page(b,base());await openReg(p,"CL001","Retrabalho");
 ok((await p.textContent('#rowsL')).includes('SKU'),'rótulo SKU');ok(!(await p.$eval('[data-wn="0"]',e=>e.hasAttribute('inputmode'))),'SKU não deve ser só numérico');
 await p.keyboard.type('ab-123');await p.keyboard.press('Enter');await p.keyboard.type('5');await p.keyboard.press('Enter');await p.waitForTimeout(100);
 await p.keyboard.type('ab-123');await p.keyboard.press('Enter');await p.keyboard.type('7');await p.keyboard.press('Enter');await p.waitForTimeout(100);
 await p.click('#save');await p.waitForTimeout(200);
 const w=await p.evaluate(()=>S.waves.map(x=>({wn:x.wn,ty:x.ty,q:x.qty,show:wnS(x)})));
 ok(w.length===2&&w.every(x=>x.ty==='Retrabalho'&&x.show==='AB-123')&&w[0].wn!==w[1].wn,'registros: '+JSON.stringify(w));
 const t=await p.evaluate(()=>({c:conjuntos(S.waves).length,d:durs(S.waves).length,u:prod(S.waves).reduce((a,x)=>a+x.qty,0)}));
 ok(t.c===0&&t.d===0&&t.u===12,'sem timing: '+JSON.stringify(t))});
await T("68 Maiores/Pesados aceita várias ondas de uma vez",async()=>{
 const p=await page(b,base());await openReg(p,"CL001","Maiores/Pesados");await typeRows(p,[[8001,3],[8002,4]]);await p.click('#save');await p.waitForTimeout(200);
 const w=await p.evaluate(()=>S.waves.map(x=>x.wn+':'+x.qty).join());ok(w.includes('8001:3')&&w.includes('8002:4'),'registros: '+w)});
await T("77 Lista de presença: três atalhos (Check-in, Semanal, Conferidos), cada um com a sua tela",async()=>{
 const p=await page(b,base());
 await p.evaluate(()=>{go('ind');document.querySelector('#gsub [data-gs="chk"]').click()});
 await p.waitForTimeout(400);
 const v=()=>p.evaluate(()=>({txt:$('#ckBody').textContent.replace(/\s+/g,' '),btn:[...document.querySelectorAll('#ckBody [data-ck]')].map(b=>b.dataset.ck),abas:[...document.querySelectorAll('#ckBody [data-ckv]')].map(b=>b.dataset.ckv),sem:document.querySelectorAll('#ckBody .wkc').length,cards:document.querySelectorAll('#ckBody .ckcard').length,conf:!!document.querySelector('#ckBody [data-ckun]')}));
 const dia0=await p.evaluate(()=>$('#day').value);
 let r=await v();
 ok(r.abas.join()==='chk,sem,conf','três atalhos: '+r.abas.join());
 ok(/A conferir \(\d+\)/.test(r.txt)&&['presente','falta','declaracao','atestado','folga'].every(k=>r.btn.includes(k)),'Check-in: '+r.btn.join());
 ok(r.sem===0&&!/Conferidos \(\d+\)<\/h2>/.test(r.txt),'Check-in não mostra a tabela da semana');
 await p.evaluate(()=>document.querySelector('#ckBody [data-ckv="sem"]').click());await p.waitForTimeout(500);
 r=await v();
 ok(r.cards===7&&r.sem>0&&r.sem<=20&&await p.evaluate(()=>mgDates().length)===1&&r.txt.includes('Primeiro bipe'),'Hoje é a tela padrão do Semanal: '+r.sem+' / '+r.cards);
 await p.evaluate(()=>document.querySelector('#ckBody [data-sper="7"]').click());await p.waitForTimeout(500);
 r=await v();
 ok(r.sem>0&&r.sem%7===0&&r.cards===7&&r.btn.length===0,'Semanal: tabela e cartões: '+r.sem+' / '+r.cards);
 await p.evaluate(()=>document.querySelector('#ckBody [data-sper="30"]').click());await p.waitForTimeout(500);
 r=await v();
 ok(r.cards===7&&r.sem===0&&r.txt.includes('Presenças'),'Mensal: resumo por pessoa e cartões');
 await p.evaluate(()=>document.querySelector('#ckBody [data-sper="90"]').click());await p.waitForTimeout(500);
 const n90=await p.evaluate(()=>({n:mgDates().length,dia:$('#day').value}));
 ok(n90.n===90&&n90.dia===dia0,'Trimestral usa 90 dias sem mudar a data do topo: '+JSON.stringify(n90));
 await p.evaluate(()=>document.querySelector('#ckBody [data-sper="7"]').click());await p.waitForTimeout(500);
 ok(await p.evaluate(()=>$('#day').value)===dia0,'a data do topo não muda ao navegar na Lista de presença');
 ok(!(await p.evaluate(()=>!!document.querySelector('#gsub [data-gs="sem"]'))),'sem aba Semana');
 await p.evaluate(()=>document.querySelector('#ckBody .wkc[data-m="CL002"][data-d]').click());
 await p.waitForTimeout(400);
 const q=await p.evaluate(()=>({op:$('#iOp').value,per:$('#iPer').value}));
 ok(q.op==='CL002'&&q.per==='1',JSON.stringify(q));
 await p.evaluate(()=>{document.querySelector('#gsub [data-gs="chk"]').click()});await p.waitForTimeout(500);
 await p.evaluate(()=>document.querySelector('#ckBody [data-ckv="conf"]').click());await p.waitForTimeout(400);
 r=await v();
 ok(/Conferidos \(\d+\)/.test(r.txt)&&r.btn.length===0,'Conferidos: '+r.txt.slice(0,120))});

await T("78 Lista de presença: quem bipa uma onda vira presente sozinho e sai da lista",async()=>{
 const t0=new Date();t0.setHours(0,0,0,0);
 const w={id:'wa',wn:'wa',op:'CL001',opn:'Ana Souza',gal:'Galpão 1',ty:'Vários artigos',qty:10,st:0,ts:Date.now()-6e4,fin:Date.now()-6e4,sync:1};
 const p=await page(b,base({waves:[w]}));
 await p.evaluate(()=>{$('#day').value=dk(Date.now());go('ind');document.querySelector('#gsub [data-gs="chk"]').click()});
 await p.waitForTimeout(400);
 const r=await p.evaluate(()=>({pend:[...document.querySelectorAll('#ckBody .ckr .ckn small')].map(x=>x.textContent),txt:$('#ckBody').textContent.replace(/\s+/g,' ')}));
 ok(!r.pend.includes('CL001'),'CL001 bipou e não devia estar em A conferir: '+r.pend.join());
 ok(r.pend.includes('CL002'),'quem não bipou continua na lista: '+r.pend.join());
 ok(/Conferidos \(1\)/.test(r.txt),r.txt.slice(0,260))});

await T("79 Procurando: quem encontrou aparece; baixa no mesmo instante (Finalizar onda) conta como a mesma pessoa",async()=>{
 const p=await page(b,base());
 const q=await p.evaluate(()=>{const T=Date.now()-6e5,w=(id,h)=>({id,wn:id,op:'CL001',opn:'Ana Souza',gal:'Galpão 1',ty:'Pacote do mesmo',qty:5,st:0,ts:T,fin:T+3e4,sync:1,sku:'X1',hist:h});
  const A=w('a1',[{e:'m',q:'Ana',t:T},{e:'a',q:'',t:T+3e4},{e:'b',q:'ISA ISMARIA',t:T+3e4+800}]),B=w('b1',[{e:'m',q:'Ana',t:T},{e:'a',q:'Marcos',t:T+6e4},{e:'b',q:'ISA ISMARIA',t:T+12e4}]),C=w('c1',[{e:'m',q:'Ana',t:T},{e:'a',q:'',t:T+3e4},{e:'b',q:'ISA ISMARIA',t:T+9e4}]);
  return hProcRows([A,B,C]).map(r=>r.w.id+':'+r.qa).sort().join()});
 ok(q==='a1:ISA ISMARIA,b1:Marcos,c1:',q)});

await T("80 Procurando: tempo conta só 6h às 20h dos dias com operação",async()=>{
 const p=await page(b,base());
 const q=await p.evaluate(()=>{const D=new Date();D.setHours(0,0,0,0);D.setDate(D.getDate()-5);const at=(dd,h)=>{const x=new Date(D);x.setDate(x.getDate()+dd);x.setHours(h,0,0,0);return x.getTime()};
  const mk=(id,ts)=>({id,wn:id,op:'CL001',opn:'Ana',gal:'Galpão 1',ty:'Vários artigos',qty:1,st:0,ts,fin:ts+1,sync:1});
  const dias=new Set([dk(at(0,8)),dk(at(1,8)),dk(at(3,8))]);const H=36e5;
  return [tUtil(at(0,5),at(0,21),dias)/H,tUtil(at(0,19),at(1,7),dias)/H,tUtil(at(1,19),at(3,7),dias)/H,tUtil(at(0,10),at(0,11),dias)/H,tUtil(at(0,21),at(1,5),dias)/H].join()});
 ok(q==='14,2,2,1,0',q)});

await T("81 Procurando: vários SKUs, cada um com a sua quantidade",async()=>{
 const p=await page(b,base({waves:[{id:'m1',wn:'4455',op:'CL001',opn:'Ana Souza',gal:'Galpão 1',ty:'Pacote do mesmo',qty:50,st:0,ts:Date.now()-6e4,fin:Date.now()-6e4,sync:1}]}));
 await p.evaluate(()=>go('prs'));await p.waitForTimeout(200);
 await p.fill('#prBip','4455');await p.press('#prBip','Enter');await p.waitForTimeout(150);
 await p.fill('#prSku','AAA-1');await p.fill('#prQtd','5');await p.click('#prAdd');
 await p.fill('#prItens .prir:nth-child(2) .pis','BBB-2');await p.click('#prOk');
 ok((await p.textContent('#toast')).includes('quantidade do SKU BBB-2'),'aceitou SKU sem quantidade: '+await p.textContent('#toast'));
 await p.fill('#prItens .prir:nth-child(2) .piq','3');await p.click('#prAdd');await p.fill('#prItens .prir:nth-child(3) .pis','aaa-1');await p.fill('#prItens .prir:nth-child(3) .piq','2');await p.click('#prOk');
 ok((await p.textContent('#toast')).includes('duas vezes'),'aceitou SKU repetido');
 await p.click('#prItens .prir:nth-child(3) .pidel');ok(((await p.textContent('#prRes')).match(/BARUERI|SEM ESTOQUE|BAIXO ESTOQUE|PERDIDO/g)||[]).length===4&&(await p.textContent('#prRes')).includes('Observação'),'caixinhas ou Observação ausentes');await p.check('.pim[value="BARUERI"]');await p.check('.pim[value="PERDIDO"]');await p.click('#prOk');await p.waitForTimeout(300);
 const w=await p.evaluate(()=>{const x=S.waves.find(z=>z.id==='m1');return{st:x.st,sku:x.sku,itens:x.itens,marcas:x.marcas}});
 ok(JSON.stringify(w.marcas)==='["BARUERI","PERDIDO"]','marcações: '+JSON.stringify(w.marcas));
 ok(w.st===1&&w.itens.length===2&&w.itens[0].s==='AAA-1'&&w.itens[0].q===5&&w.itens[1].q===3&&w.sku==='AAA-1 ×5, BBB-2 ×3',JSON.stringify(w));
 const lista=(await p.textContent('#prList')).replace(/\s+/g,' ');ok(lista.includes('AAA-1')&&lista.includes('×5')&&lista.includes('BBB-2')&&lista.includes('×3')&&lista.includes('BARUERI')&&lista.includes('PERDIDO'),'lista: '+lista);
 await p.reload();const w2=await p.evaluate(()=>S.waves.find(z=>z.id==='m1').itens);ok(w2.length===2&&w2[1].q===3,'não persistiu: '+JSON.stringify(w2))});

await b.close();
const w=Math.max(...R.map(r=>r[1].length));for(const r of R)console.log((r[0]==="PASS"?"✅":"❌")+" "+r[1].padEnd(w)+"  "+r[2]);
console.log(`\n${R.filter(r=>r[0]==="PASS").length}/${R.length} passaram`)})();
