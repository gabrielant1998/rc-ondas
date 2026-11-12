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

await T("11 Offline: registra, mostra pendentes e sincroniza sem duplicar",async()=>{const p=await page(b,base());await p.click('#net');
 await openReg(p,"CL001","Pacote do mesmo");await typeRows(p,[[6401,1],[6402,2],[6403,3]]);await p.click('#save');await p.waitForTimeout(200);
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
 ok(r.txt.includes('Bruno Lima')&&r.txt.includes('Faltas a conferir'),'sem tabela de faltas');ok(r.extra.ms===15*60000,'extra '+r.extra.ms);ok(r.ref===10000,'meta '+r.ref);
 await p.evaluate(()=>{$('#iOp').value='CL002';individual()});ok((await p.textContent('#iBody')).includes('Falta: sem bipagem (conferir)'),'falta não sinalizada');
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

await T("42 Adicionar outra onda aparece só em Pacote do mesmo",async()=>{const p=await page(b,base());
 const r=await p.evaluate(()=>{const f=n=>{document.querySelector(`[data-ty="${n}"]`).click();return document.querySelector('#addRow').style.display};return [f('Vários artigos'),f('Pacote do mesmo'),f('Retrabalho')]});
 ok(r[0]==='none'&&r[1]==='block'&&r[2]==='none',r.join(' | '))});

await T("34 Gestão: meta coletiva soma produção uma vez e mantém tipos",async()=>{const now=Date.now(),waves=[{id:'a',wn:'a',op:'CL001',opn:'Ana Souza',gal:'Galpão 1',ty:'Vários artigos',qty:10,st:0,ts:now,fin:now,sync:1},{id:'b',wn:'b',op:'CL002',opn:'Bruno Lima',gal:'Galpão 1',ty:'Retrabalho',qty:20,st:0,ts:now,fin:now,sync:1}];
 const p=await page(b,base({waves}));await p.evaluate(()=>{go('ind');document.querySelector('[data-gs="mc"]').click()});const txt=await p.textContent('#coBody');ok(txt.includes('30')&&txt.includes('10.000')&&txt.includes('Retrabalho'),'coletiva: '+txt);
});

const HR=(h,m)=>{const d=new Date();d.setHours(h,m,0,0);return d.getTime()};
const WV=(id,wn,ty,qty,t,op='CL001',opn='Ana Souza',st=0)=>({id,wn,op,opn,gal:'Galpão 1',ty,qty,st,ts:t,fin:st===0?t:null,sync:1});
await T("43 Procurando em 3 etapas: pendente com SKU, encontrada vai ao histórico, baixa com nome",async()=>{
 const p=await page(b,base({waves:[WV('a','00123','Vários artigos',10,HR(9,0)),WV('b','456','Vários artigos',20,HR(9,10))]}));
 const prod=()=>p.evaluate(()=>prod(S.waves).reduce((a,w)=>a+w.qty,0));
 await p.evaluate(()=>go('op'));await p.click('#sub [data-s="pro"]');
 await p.fill('#prBip','123');await p.press('#prBip','Enter');ok(await p.isVisible('#prSku'),'formulário não abriu');
 await p.press('#prSku','Enter');ok((await p.textContent('#toast')).includes('SKU'),'deixou salvar sem SKU');
 await p.fill('#prSku','SKU-9');await p.fill('#prLoc','A-01');await p.press('#prLoc','Enter');
 const lista=await p.textContent('#prList');ok(lista.includes('123')&&lista.includes('SKU-9')&&lista.includes('A-01')&&lista.includes('Ana Souza'),'pendentes: '+lista);
 await p.evaluate(()=>go('painel'));const k=(await p.textContent('#kpis')).replace(/\s+/g,' ');ok(/Procurando1/.test(k),'painel não mostra 1 procurando: '+k.slice(0,300));
 ok(await prod()===20,'produção deveria ser 20, é '+await prod());
 await p.reload();const w=await p.evaluate(()=>S.waves.find(x=>x.id==='a'));ok(w.st===1&&w.sku==='SKU-9'&&w.loc==='A-01'&&w.hist.length===1,'não persistiu: '+JSON.stringify(w));
 await p.evaluate(()=>go('op'));await p.click('#sub [data-s="pro"]');
 await p.fill('#prBip','00123');await p.press('#prBip','Enter');ok(await p.isVisible('#prAOk')&&!(await p.isVisible('#prSku')),'segunda bipagem deveria pedir "encontrada"');
 await p.click('#prAOk');ok((await p.textContent('#prList')).includes('Nenhuma'),'ainda pendente');
 ok(await prod()===30,'produção deveria voltar a 30, é '+await prod());
 let h=(await p.textContent('#prHist')).replace(/\s+/g,' ');ok(h.includes('123')&&h.includes('SKU-9')&&h.includes('A-01')&&h.includes('Dar baixa')&&/\d\d\/\d\d\/\d\d/.test(h),'histórico: '+h);
 await p.fill('#prBip','123');await p.press('#prBip','Enter');ok(await p.isVisible('#prNome'),'terceira bipagem deveria pedir o nome');
 await p.press('#prNome','Enter');ok((await p.textContent('#toast')).includes('nome'),'deixou dar baixa sem nome');
 await p.fill('#prNome','Maria Souza');await p.press('#prNome','Enter');
 h=(await p.textContent('#prHist')).replace(/\s+/g,' ');ok(h.includes('Maria Souza')&&!h.includes('Dar baixa'),'baixa não apareceu: '+h);
 await p.fill('#prBip','123');await p.press('#prBip','Enter');ok(!(await p.isVisible('#prNome'))&&(await p.textContent('#prRes')).includes('já tem baixa'),'onda baixada deveria só informar');
 await p.fill('#prQ','maria');ok((await p.textContent('#prHist')).includes('123'),'pesquisa por nome não achou');
 await p.fill('#prQ','zzzz');ok((await p.textContent('#prHist')).includes('Nada encontrado'),'pesquisa sem resultado')});
await T("44 Procurando: WN inexistente e onda em difícil acesso não abrem formulário",async()=>{
 const p=await page(b,base({waves:[WV('a','900','Vários artigos',10,HR(9,0),'CL001','Ana Souza',2)]}));
 await p.evaluate(()=>go('op'));await p.click('#sub [data-s="pro"]');
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
 await p.evaluate(()=>go('op'));await p.click('#sub [data-s="ctl"]');await p.waitForTimeout(1200);
 const t=(await p.textContent('#ctlLive')).replace(/\s+/g,' ');
 ok(t.includes('Ana Souza')&&t.includes('Bruno Lima')&&!t.includes('Carla Dias'),'operadores: '+t);
 const el=await p.$$eval('#ctlLive [data-el]',a=>a.map(e=>e.textContent));ok(el.includes('05:01')||el.includes('05:02')||el.includes('05:00'),'tempos: '+el.join(','));
 await p.evaluate(()=>{S.waves.push({id:'z',wn:'9',op:'CL001',opn:'Ana Souza',gal:'Galpão 1',ty:'Retrabalho',qty:5,st:0,ts:Date.now()-1000,fin:Date.now()-1000,sync:1});renderAll()});
 const t2=(await p.textContent('#ctlLive')).replace(/\s+/g,' ');ok(t2.includes('Retrabalho')&&!t2.includes('Vários artigos'),'nova bipagem deveria substituir a anterior: '+t2)});
const CJ=()=>{const b0=HR(9,0);return[WV('a','1','Itens Únicos',10,b0),WV('b','2','Vários artigos',50,b0+500),WV('c','3','Vários artigos',40,b0+1000),WV('d','4','Retrabalho',5,b0+26.5*60000),WV('e','5','Itens Únicos',7,b0+46*60000)]};
await T("49 Conjuntos: ondas bipadas no mesmo instante contam uma vez, com um tempo só",async()=>{
 const p=await page(b,base({waves:CJ()}));
 const r=await p.evaluate(()=>durs(S.waves).map(c=>[c.w.ty,c.d,c.ondas,c.qty]));
 ok(r.length===2,'esperava 2 conjuntos medidos, vieram '+JSON.stringify(r));
 ok(r[0][0]==='Vários artigos'&&r[0][1]===26.5*60000-0&&r[0][2]===3&&r[0][3]===100,'conjunto 1: '+JSON.stringify(r[0]));
 ok(r[1][0]==='Retrabalho'&&r[1][1]===19.5*60000&&r[1][2]===1,'conjunto 2: '+JSON.stringify(r[1]))});
await T("50 Individual: tempo por tipo (mais rápido) e lista de conjuntos com tempo em minutos",async()=>{
 const p=await page(b,base({waves:CJ()}));
 await p.evaluate(()=>go('ind'));await p.selectOption('#iOp','CL001');const t=(await p.textContent('#iBody')).replace(/\s+/g,' ');
 ok(t.includes('Tempo por tipo de onda')&&t.includes('Conjuntos de ondas'),'sem cards');
 ok(t.includes('26 min 30 s')&&t.includes('19 min 30 s'),'sem tempos: '+t.slice(t.indexOf('Tempo por tipo'),t.indexOf('Tempo por tipo')+700));
 ok(/Retrabalho\d+19 min 30 s\d+mais rápido/.test(t),'Retrabalho deveria ser o mais rápido: '+t.slice(t.indexOf('Tempo por tipo'),t.indexOf('Tempo por tipo')+500))});
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
 ok(t.includes('Hora mais produtiva')&&t.includes('Mediana por hora')&&t.includes('9h'),'hora: '+t.slice(0,300));
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
await b.close();
const w=Math.max(...R.map(r=>r[1].length));for(const r of R)console.log((r[0]==="PASS"?"✅":"❌")+" "+r[1].padEnd(w)+"  "+r[2]);
console.log(`\n${R.filter(r=>r[0]==="PASS").length}/${R.length} passaram`)})();
