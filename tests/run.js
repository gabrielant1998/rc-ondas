// Bateria de testes do RC Ondas (Playwright). Uso: node run.js [arquivo.html]
const {chromium}=require('playwright');const path=require('path');
const FILE='http://127.0.0.1:8765/'+(process.argv[2]||'index.html');
const R=[];const ok=(c,m)=>{if(!c)throw new Error(m)};
const DAY=new Date();DAY.setHours(0,0,0,0);const D0=DAY.getTime(),H=36e5;
const base=(o={})=>Object.assign({cfg:{lim:{"Vários":1000,"Múltiplos":1000,"Itens Únicos":100,"Maiores/Pesados":10},and:true,gap:30,tol:15,turnos:{1:{ini:7,fim:16},2:{ini:16,fim:23}}},
 gals:["Galpão 1","Galpão 2","Galpão 3"],metas:{"Galpão 1":10000,"Galpão 2":8000,"Galpão 3":6000},
 ops:[{m:"CL001",n:"Ana Souza",t:1,g:"Galpão 1"},{m:"CL002",n:"Bruno Lima",t:1,g:"Galpão 1"},{m:"CL003",n:"Carla Dias",t:2,g:"Galpão 2"}],
 ges:[],waves:[],gal:"Galpão 1",off:false,man:{log:[]}},o);
function bigState(N){const TY=["Vários","Múltiplos","Itens Únicos","Maiores/Pesados"],ops=[],waves=[];
 for(let i=1;i<=60;i++)ops.push({m:"CL"+String(i).padStart(3,"0"),n:"Operador "+i+" Silva",t:i%2?1:2,g:"Galpão "+(1+i%3)});
 for(let k=0;k<N;k++){const o=ops[k%60],day=Math.floor(k/(N/60)),t=D0-day*24*H+(7+(k%14))*H+(k%60)*6e4;
  waves.push({id:"w"+k,wn:String(100000+k),op:o.m,opn:o.n,gal:o.g,ty:TY[k%4],qty:1+(k*7)%90,st:0,ts:t,fin:t,sync:1})}
 return base({ops,waves})}
async function page(b,state,opts={}){const ctx=await b.newContext({viewport:opts.vp||{width:1366,height:900}});const p=await ctx.newPage();
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

await T("03 Lote: 25 ondas numa tacada só pelo teclado",async()=>{const p=await page(b,base());await openReg(p,"CL002","Múltiplos");
 const rows=[];for(let i=0;i<25;i++)rows.push([7000+i,10+i]);await typeRows(p,rows);await p.click('#save');await p.waitForTimeout(300);
 const s=await st(p);ok(s.waves.length===25,"salvou "+s.waves.length);ok(new Set(s.waves.map(w=>w.id)).size===25,"ids repetidos");
 ok(new Set(s.waves.map(w=>w.wn)).size===25,"WN repetidos");const sum=s.waves.reduce((a,w)=>a+w.qty,0);
 const shown=await p.evaluate(()=>{go("painel");return document.querySelector("#kpis .num").textContent});ok(shown.replace(/\D/g,"")==String(sum),"painel "+shown+" ≠ "+sum);
 return `25 salvas, painel = ${shown}`});

await T("04 WN repetido no mesmo formulário é bloqueado",async()=>{const p=await page(b,base());await openReg(p,"CL001","Vários");
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

await T("11 Offline: registra, mostra pendentes e sincroniza sem duplicar",async()=>{const p=await page(b,base());await p.click('#net');
 await openReg(p,"CL001","Vários");await typeRows(p,[[6401,1],[6402,2],[6403,3]]);await p.click('#save');await p.waitForTimeout(200);
 let s=await st(p);ok(s.waves.length===3&&s.waves.every(w=>!w.sync),"não ficou pendente");ok((await p.textContent('#net')).includes("3 pendente"),"indicador: "+await p.textContent('#net'));
 await p.click('#net');await p.waitForTimeout(150);s=await st(p);ok(s.waves.length===3&&s.waves.every(w=>w.sync),"não sincronizou ou duplicou");return await p.textContent('#toast')});

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
 const s=await st(p);ok(s.gals[0]==="Galpão Norte"&&s.waves[0].gal==="Galpão Norte"&&s.metas["Galpão Norte"]===10000&&s.ops[0].g==="Galpão Norte","não acompanhou: "+JSON.stringify({g:s.gals[0],w:s.waves[0].gal,m:s.metas}))});

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
 ok(!(await p.isHidden('#login')),"entrou com senha errada");await p.click('#lX');await p.click('.tab[data-t="cfg"]');ok(!(await p.isHidden('#login')),"Config abriu sem login")});

await T("23 Filtro de turno: 1º + 2º = todos",async()=>{const S=bigState(3000);const p=await page(b,S);
 const r=await p.evaluate(()=>{const v=x=>{$("#turnoF").value=x;$("#gal").value="__all";renderAll();return +document.querySelector("#kpis .num").textContent.replace(/\D/g,"")};return[v(""),v("1"),v("2")]});
 ok(r[0]===r[1]+r[2],"todos="+r[0]+" 1º="+r[1]+" 2º="+r[2]);return JSON.stringify(r)});

await T("24 Desligar 'ondas em andamento' fecha as abertas sem perder quantidade",async()=>{const now=Date.now();
 const S=base({waves:[0,1,2].map(i=>({id:"o"+i,wn:"8"+i,op:"CL001",opn:"Ana Souza",gal:"Galpão 1",ty:"Vários",qty:10,st:1,ts:now,fin:null,sync:1}))});
 const p=await page(b,S);await p.click('.tab[data-t="cfg"]');await p.uncheck('#and');await p.waitForTimeout(150);const s=await st(p);
 ok(s.waves.every(w=>w.st===0&&w.fin&&w.auto)&&s.waves.reduce((a,w)=>a+w.qty,0)===30,"não fechou certo");
 await p.evaluate(()=>go("painel"));ok((await p.textContent('#kpis .num')).trim()==="30","painel não somou")});

await T("25 Celular (390px): registro completo sem erro e sem rolagem lateral",async()=>{const p=await page(b,base(),{vp:{width:390,height:844}});await openReg(p,"CL001","Itens Únicos");
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

await b.close();
const w=Math.max(...R.map(r=>r[1].length));for(const r of R)console.log((r[0]==="PASS"?"✅":"❌")+" "+r[1].padEnd(w)+"  "+r[2]);
console.log(`\n${R.filter(r=>r[0]==="PASS").length}/${R.length} passaram`)})();
