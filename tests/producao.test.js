// Testes da aba Produção (modo local). Uso: node tests/producao.test.js   (SHOT=pasta salva imagens)
const {chromium}=require('playwright');
const FILE='http://127.0.0.1:8765/index.html';
const R=[];const ok=(c,m)=>{if(!c)throw new Error(m)};
const HJ=(()=>{const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")})();
const base=(o={})=>Object.assign({cfg:{lim:{"Vários":1000,"Múltiplos":1000,"Itens Únicos":100,"Maiores/Pesados":10},and:true,gap:30,tol:15,turnos:{1:{ini:7,fim:16},2:{ini:16,fim:23}}},
 gals:["RC","G2"],metasDia:{},ops:[{m:"CL001",n:"Coleta Um",t:1,g:"RC"},{m:"CL009",n:"Zé Coleta",t:1,g:"RC"}],
 prodPes:[{id:"p1",m:"PR001",n:"Ana Souza",g:"RC"},{id:"p2",m:"PR002",n:"Bruno Lima",g:"RC"},{id:"p3",m:"PR003",n:"Carla Dias",g:"RC"}],
 ges:[],waves:[],gal:"RC",off:false,man:{log:[]}},o);
async function page(b,state,vp){const ctx=await b.newContext({viewport:vp||{width:1366,height:900}});const p=await ctx.newPage();p.errors=[];p.on('pageerror',e=>p.errors.push(e.message));
 await p.addInitScript(()=>{window.__semFesta=1});
 await ctx.addInitScript(([s])=>{if(!sessionStorage.__seeded){sessionStorage.__seeded=1;localStorage.clear();if(s)localStorage.setItem("rcondas.v2",s)}},[state?JSON.stringify(state):null]);
 await p.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.abort());await p.goto(FILE);await p.waitForTimeout(200);return p}
const st=p=>p.evaluate(()=>JSON.parse(localStorage.getItem("rcondas.v2")));
async function T(name,fn){if(process.env.ONLY&&!process.env.ONLY.split(",").some(k=>name.startsWith(k+" ")))return;const t0=Date.now();try{await fn();R.push(["PASS",name,Date.now()-t0])}catch(e){R.push(["FALHA",name,e.message.slice(0,1500)])}}
async function dis(p){await p.evaluate(()=>{go('ind');document.querySelector('#gsub [data-gs="pd"]').click();document.querySelector('#pdEqSeg [data-pde="pes"]').click()});await p.waitForTimeout(120)}
async function emb(p,v){await p.evaluate(v=>{go('ind');document.querySelector('#gsub [data-gs="pd"]').click();document.querySelector('#pdEqSeg [data-pde="'+v+'"]').click()},v);await p.waitForTimeout(150)}
async function posto(p,nome,andar,at,extra){await dis(p);await p.fill('#pdDq',nome);await p.waitForTimeout(80);
 await p.locator('#pdDl [data-pded]').first().click();await p.check(`.pdEd input[name="pdA4"][value="${andar}-${at}"]`);
 if(extra)await extra();await p.click('.pdEd [type="submit"]');await p.waitForTimeout(120)}
async function bipar(p,cod,wns){await p.click('.tab[data-t="prod"]');await p.evaluate(()=>pdSubPr('bip'));const cur=await p.inputValue('#pdP');if(cur!==cod){await p.fill('#pdP',cod);await p.waitForTimeout(80)}
 for(const w of wns){await p.fill('#pdW',String(w));await p.press('#pdW','Enter');await p.waitForTimeout(60)}}
(async()=>{const b=await chromium.launch();const SHOT=process.env.SHOT;

await T("P01 Abas: Operação virou Coleta e Produção aparece com Bipar e Distribuição",async()=>{const p=await page(b,base());
 const tabs=await p.$$eval('.tab[data-t]',x=>x.map(e=>e.textContent.trim()));ok(tabs.includes("Coleta")&&tabs.includes("Produção")&&!tabs.includes("Operação"),"abas: "+tabs);
 await p.click('.tab[data-t="prod"]');ok(await p.isVisible('#pdP'),'campo do operador');ok((await p.textContent('#ttl')).includes('Produção'),'título');ok(!(await p.isVisible('#pdDisV')),'Produção não deveria mostrar o cadastro');
 await dis(p);ok(await p.isVisible('#pdDisV'),'pessoas da produção na Equipe');ok(!(await p.evaluate(()=>document.getElementById('gsPd').classList.contains('hide'))),'subaba escondida');
 ok(!p.errors.length,p.errors.join(';'))});

await T("P02 Sem posto: a pessoa não consegue bipar e vê o aviso",async()=>{const p=await page(b,base());await p.click('.tab[data-t="prod"]');
 await p.fill('#pdP','Ana');await p.waitForTimeout(80);await p.locator('#pdSug [data-pdsug]').first().click();await p.waitForTimeout(60);
 ok((await p.textContent('#pdWho')).includes('ainda não tem posto'),'sem aviso');ok(!(await p.isVisible('#pdW')),'campo de onda visível sem posto');
 const s=await st(p);ok(!(s.prodB||[]).length,'gravou')});

await T("P03 Distribuição + primeira bipagem registra presença; a segunda não duplica",async()=>{const p=await page(b,base({waves:[{id:"w1",wn:"5001",op:"CL002",opn:"Bruno Lima",gal:"RC",ty:"Vários",qty:3,st:0,ts:Date.now()-36e5,fin:Date.now()-36e5,sync:1}]}));
 await p.click('.tab[data-t="prod"]');await posto(p,'Ana','terreo','mesa');
 ok((await p.textContent('#pdDl')).includes('Térreo'),'posto não aparece na lista');
 await bipar(p,'PR001',['0005001','7002']);const s=await st(p);
 ok(s.prodB.length===2,'bipagens '+s.prodB.length);ok(Object.keys(s.prodP).length===1,'presenças '+Object.keys(s.prodP).length);
 const L=await p.textContent('#pdL');ok(L.includes('Coletada')&&L.includes('Não coletada'),'status de coleta: '+L);
 ok((await p.textContent('#pdN')).includes('2 ondas'),'contador');
 if(SHOT){await p.fill('#pdW','7003');await p.press('#pdW','Enter');await p.waitForTimeout(80);await p.screenshot({path:SHOT+'/p_bipar.png'})}});

await T("P04 Mesma onda: repetida na Mesa é recusada; na Máquina é aceita",async()=>{const p=await page(b,base());await p.click('.tab[data-t="prod"]');
 await posto(p,'Ana','terreo','mesa');await posto(p,'Bruno','mezanino','maquina');
 await bipar(p,'PR001',['900']);await bipar(p,'PR001',['900']);ok((await p.textContent('#pdMsg')).includes('já embalada'),'sem aviso de repetida');
 await p.click('#pdTroca');await bipar(p,'PR002',['900']);const s=await st(p);
 ok(s.prodB.length===2,'bipagens '+s.prodB.length);ok(s.prodB.map(x=>x.at).sort().join()==='maquina,mesa','atividades')});

await T("P05 Troca de posto preserva o histórico das ondas anteriores",async()=>{const p=await page(b,base());await p.click('.tab[data-t="prod"]');
 await posto(p,'Ana','terreo','mesa');await bipar(p,'PR001',['100']);
 await p.evaluate(()=>{S.prodA.forEach(a=>a.ini-=36e5);S.prodB.forEach(x=>x.em-=30*6e4);save()});
 await posto(p,'Ana','mezanino','maquina');await bipar(p,'PR001',['101']);const s=await st(p);
 const a=s.prodB.find(x=>x.wn==='100'),c=s.prodB.find(x=>x.wn==='101');ok(a.andar==='terreo'&&a.at==='mesa','antiga mudou: '+JSON.stringify(a));ok(c.andar==='mezanino'&&c.at==='maquina','nova: '+JSON.stringify(c));
 ok(s.prodA.length===2&&s.prodA.filter(x=>!x.fim).length===1,'histórico de postos '+JSON.stringify(s.prodA));
 await dis(p);await p.fill('#pdDq','Ana');await p.locator('#pdDl [data-pded]').first().click();ok((await p.textContent('.pdHist')).includes('Térreo'),'histórico não aparece')});

await T("P06 Turnos: editar horários (digitados) e criar turno que passa da meia-noite",async()=>{const p=await page(b,base());await p.click('.tab[data-t="prod"]');await dis(p);
 const f='[data-pdt="1"]';await p.fill(f+' [name="s"]','15:00');await p.fill(f+' [name="ii"]','11:00');await p.fill(f+' [name="if"]','12:00');await p.click(f+' [type="submit"]');await p.waitForTimeout(80);
 let s=await st(p);ok(s.prodT[0].sai==='15:00'&&s.prodT[0].ii==='11:00','turno 1 '+JSON.stringify(s.prodT[0]));
 await p.fill(f+' [name="ii"]','16:00');await p.fill(f+' [name="if"]','17:00');await p.click(f+' [type="submit"]');await p.waitForTimeout(60);s=await st(p);ok(s.prodT[0].ii==='11:00','aceitou intervalo fora do turno');
 await p.click('[data-pdtn]');await p.fill('[data-pdt="novo"] [name="n"]','Noite');await p.fill('[data-pdt="novo"] [name="e"]','22:00');await p.fill('[data-pdt="novo"] [name="s"]','06:00');await p.click('[data-pdt="novo"] [type="submit"]');await p.waitForTimeout(80);
 s=await st(p);ok(s.prodT.length===3&&s.prodT[2].nome==='Noite','novo turno');
 const dia=await p.evaluate(()=>{const d=new Date();d.setHours(2,0,0,0);return pdDia(d.getTime(),{tu:3,ent:"",sai:""})});
 const ontem=await p.evaluate(()=>dk(Date.now()-864e5));ok(dia===ontem,'madrugada no dia errado: '+dia);
 if(SHOT)await p.screenshot({path:SHOT+'/p_dist.png',fullPage:true})});

await T("P07 Horário individual exige entrada e saída e fica salvo no posto",async()=>{const p=await page(b,base());await p.click('.tab[data-t="prod"]');
 await posto(p,'Carla','mezanino','mesa',async()=>{await p.fill('.pdEd [name="pdE"]','08:00')});let s=await st(p);ok(!(s.prodA||[]).length,'salvou só com entrada');
 await p.fill('.pdEd [name="pdS"]','17:00');await p.click('.pdEd [type="submit"]');await p.waitForTimeout(80);s=await st(p);ok(s.prodA[0].ent==='08:00'&&s.prodA[0].sai==='17:00','horário individual');
 ok((await p.textContent('#pdDl')).includes('08:00 às 17:00 (individual)'),'lista')});

await T("P08 Pessoas da Coleta não aparecem na Produção (nem na busca, nem na distribuição, nem pelo código)",async()=>{const p=await page(b,base());await p.click('.tab[data-t="prod"]');
 await p.fill('#pdP','Zé');await p.waitForTimeout(80);ok(!(await p.locator('#pdSug [data-pdsug]').count()),'apareceu pessoa da Coleta na busca');
 await p.fill('#pdP','CL001');await p.waitForTimeout(80);ok(!(await p.isVisible('#pdW')),'código da Coleta abriu a bipagem');
 await dis(p);const t=await p.textContent('#pdDl');ok(!t.includes('Coleta Um')&&!t.includes('Zé Coleta')&&t.includes('Ana Souza'),'distribuição: '+t);
 await p.click('.tab[data-t="op"]');await p.fill('#opIn','Ana');await p.waitForTimeout(80);ok(!(await p.locator('#opSug [data-sug]').count()),'pessoa da Produção apareceu na Coleta')});

await T("P11 Cadastro da produção: cadastrar, código repetido recusado, editar e remover mantendo o histórico",async()=>{const p=await page(b,base({prodPes:[]}));await p.click('.tab[data-t="prod"]');await dis(p);
 ok((await p.textContent('#pdDl')).includes('Nenhuma pessoa cadastrada'),'estado vazio');
 await p.click('#pdNovaB');ok((await p.inputValue('#pdNovaF [name="c"]'))==='PR001','código sugerido');await p.fill('#pdNovaF [name="n"]','Diego Ramos');await p.click('#pdNovaF [type="submit"]');await p.waitForTimeout(80);
 ok(!((await st(p)).prodPes||[]).length,'cadastrou sem posto');ok((await p.$$('#pdNovaF input[name="pdA4"]')).length===4,'4 postos no cadastro');
 await p.check('#pdNovaF input[name="pdA4"][value="mezanino-maquina"]');await p.click('#pdNovaF [type="submit"]');await p.waitForTimeout(80);
 ok((await st(p)).prodA.some(a=>a.andar==='mezanino'&&a.at==='maquina'&&!a.fim),'posto do cadastro');
 let s=await st(p);ok(s.prodPes.length===1&&s.prodPes[0].m==='PR001'&&s.prodPes[0].n==='Diego Ramos','cadastro '+JSON.stringify(s.prodPes));ok(s.ops.length===2,'mexeu na Coleta');
 await p.click('#pdNovaB');await p.fill('#pdNovaF [name="n"]','Elisa');await p.check('#pdNovaF input[name="pdA4"][value="terreo-mesa"]');await p.fill('#pdNovaF [name="c"]','pr001');await p.click('#pdNovaF [type="submit"]');await p.waitForTimeout(80);
 s=await st(p);ok(s.prodPes.length===1,'aceitou código repetido');await p.fill('#pdNovaF [name="c"]','PR002');await p.click('#pdNovaF [type="submit"]');await p.waitForTimeout(80);s=await st(p);ok(s.prodPes.length===2,'segunda pessoa');
 await p.fill('#pdDq','Diego');await p.locator('#pdDl [data-pded]').first().click();await p.check('.pdEd input[name="pdA4"][value="terreo-mesa"]');await p.click('.pdEd [type="submit"]');await p.waitForTimeout(80);
 await p.locator('#pdDl [data-pded]').first().click();await p.fill('.pdEd [name="n"]','Diego R. Ramos');await p.click('.pdEd [data-pdcad]');await p.waitForTimeout(80);s=await st(p);ok(s.prodPes[0].n==='Diego R. Ramos','editar nome');
 await bipar(p,'PR001',['555']);await dis(p);await p.fill('#pdDq','Diego');if(!(await p.isVisible('.pdEd [data-pdrm]')))await p.locator('#pdDl [data-pded]').first().click();
 await p.click('.pdEd [data-pdrm]');await p.click('.pdEd [data-pdrm]');await p.waitForTimeout(80);s=await st(p);
 ok(s.prodPes.length===1&&!s.prodPes.some(x=>x.m==='PR001'),'não removeu');ok(s.prodB.length===1,'apagou bipagem');ok(s.prodA.filter(a=>!s.prodPes.some(x=>x.id===a.oid)).every(a=>a.fim),'posto ficou aberto');
 if(SHOT){await p.click('#pdNovaB');await p.fill('#pdNovaF [name="n"]','Fabiana Costa');await p.screenshot({path:SHOT+'/p_cad.png'})}});

await T("P09 Gestor sem permissão de configuração não vê Distribuição",async()=>{const p=await page(b,base({ges:[{n:"Gil",u:"gil@x",g:"RC",adm:false,pC:false,pI:true,pR:true}]}));await p.click('.tab[data-t="prod"]');
 ok(!(await p.evaluate(()=>pdGestor())),'gestor sem permissão');ok(!(await p.$('#prod #pdDisV')),'distribuição dentro da Produção');ok(await p.isVisible('#pdP'),'bipar deveria continuar público')});

await T("P10 Celular: sem rolagem horizontal na Produção",async()=>{const p=await page(b,base(),{width:390,height:844});await p.click('.tab[data-t="prod"]');
 await posto(p,'Ana','terreo','mesa');await bipar(p,'PR001',['123456789']);let w=await p.evaluate(()=>document.documentElement.scrollWidth);ok(w<=391,'bipar '+w);
 if(SHOT)await p.screenshot({path:SHOT+'/p_cel.png'});
 await dis(p);await p.locator('#pdDl [data-pded]').first().click();await p.click('#pdNovaB');w=await p.evaluate(()=>document.documentElement.scrollWidth);const ov=await p.evaluate(()=>[...document.querySelectorAll('#pdDisV *')].filter(e=>e.getBoundingClientRect().right>392).slice(0,3).map(e=>{let o=[],x=e;for(let i=0;i<7&&x;i++,x=x.parentElement){const r=x.getBoundingClientRect();o.push(x.tagName+'.'+(x.className||'')+'['+(x.getAttribute('name')||x.getAttribute('type')||'')+'] '+Math.round(r.left)+'-'+Math.round(r.right))}return o.join(' < ')}).join(' || '));ok(w<=391,'distribuição '+w+' '+ov)});

await T("P12 Equipe › Pessoas da produção: filtro Térreo Mesa, Térreo Máquina, Mezanino Mesa, Mezanino Máquina",async()=>{const p=await page(b,base());
 await posto(p,'Ana','terreo','mesa');await posto(p,'Bruno','terreo','maquina');await posto(p,'Carla','mezanino','maquina');await p.fill('#pdDq','');await p.waitForTimeout(60);
 const chips=await p.$$eval('#pdDf button',x=>x.map(e=>e.textContent.replace(/\s+/g,' ').trim()));
 ok(JSON.stringify(chips)===JSON.stringify(["Todos 3","Térreo Mesa 1","Térreo Máquina 1","Mezanino Mesa 0","Mezanino Máquina 1","Sem posto 0"]),'chips '+chips);
 await p.click('#pdDf [data-pdf="terreo-maquina"]');let t=await p.textContent('#pdDl');ok(t.includes('Bruno')&&!t.includes('Ana')&&!t.includes('Carla'),'filtro: '+t);
 await p.click('#pdDf [data-pdf="mezanino-mesa"]');ok((await p.textContent('#pdDl')).includes('Ninguém neste filtro'),'vazio');
 await p.click('#pdNovaB');ok(await p.isChecked('#pdNovaF input[value="mezanino-mesa"]'),'cadastro herda o filtro');
 if(SHOT)await p.screenshot({path:SHOT+'/p_eq.png'});ok(!p.errors.length,p.errors.join(';'))});

await T("P13 Metas por hora (Mesa e Máquina), Equipe e Individual com meta, Painel público do dia",async()=>{const p=await page(b,base());
 await posto(p,'Ana','terreo','mesa');await posto(p,'Bruno','terreo','maquina');await bipar(p,'PR001',['201','202','203']);await bipar(p,'PR002',['301','302']);
 await emb(p,'eq');ok(await p.isVisible('#pdMetaF'),'form de metas');ok((await p.textContent('#pdDesV')).includes('Sem meta por hora cadastrada'),'sem meta');
 await p.fill('#pdMetaF [name="mesa"]','10');await p.fill('#pdMetaF [name="maquina"]','20,5');await p.click('#pdMetaF [type="submit"]');await p.waitForTimeout(120);
 let s=await st(p);ok(s.prodMetas.length===2&&s.prodMetas.find(m=>m.at==='maquina').h===20.5&&s.prodMetas[0].ini===HJ,'metas '+JSON.stringify(s.prodMetas));
 let t=await p.textContent('#pdDesV');ok(t.includes('5ondas embaladas')||t.replace(/\s/g,'').includes('5ondasembaladas'),'placar '+t.slice(0,120));ok(t.includes('Meta até agora')&&t.includes('% da meta'),'meta no placar');
 await p.fill('#pdMetaF [name="ini"]',await p.evaluate(()=>dk(Date.now()-864e5)));await p.fill('#pdMetaF [name="mesa"]','12');await p.click('#pdMetaF [type="submit"]');await p.waitForTimeout(100);s=await st(p);ok(s.prodMetas.length===2&&s.prodMetas.find(m=>m.at==='mesa').h===10,'aceitou meta retroativa');
 const calc=await p.evaluate(()=>{const h=Math.floor(Date.now()/36e5)*36e5-2*36e5,B=[{oid:'x',nm:'X',andar:'terreo',at:'mesa',em:h+60000,dia:hoje()},{oid:'x',nm:'X',andar:'terreo',at:'mesa',em:h+120000,dia:hoje()},{oid:'y',nm:'Y',andar:'terreo',at:'maquina',em:h+36e5+5000,dia:hoje()}];const r=pdStats(B);return[r.meta,r.hrs,r.n]});
 ok(Math.abs(calc[0]-30.5)<1e-9&&calc[1]===2&&calc[2]===3,'cálculo da meta '+calc);
 await emb(p,'ind');t=await p.textContent('#pdDesV');ok(t.includes('Ana Souza')&&t.includes('Bruno Lima')&&t.includes('Produção individual'),'individual '+t.slice(0,200));ok((await p.$$('#pdDesV svg rect')).length===2,'barras por pessoa');
 await p.selectOption('#pdPs',{label:'Ana Souza'});await p.waitForTimeout(100);t=await p.textContent('#pdDesV');ok(t.includes('Produção de Ana Souza')&&t.includes('Terreo Mesa'.replace('Terreo','Térreo')),'pessoa '+t.slice(0,200));
 if(SHOT)await p.screenshot({path:SHOT+'/p_ind.png',fullPage:true});
 await p.selectOption('#pdPs','');await emb(p,'eq');if(SHOT)await p.screenshot({path:SHOT+'/p_equipe.png',fullPage:true});
 await p.click('.tab[data-t="prod"]');await p.evaluate(()=>pdSubPr('pn'));await p.evaluate(()=>pdRender());await p.waitForTimeout(100);t=await p.textContent('#pdPnV');
 ok(t.includes('Ondas por hora')&&t.includes('Postos')&&t.includes('Última hora'),'painel '+t.slice(0,200));
 await p.click('#pdPnV [data-pdfp="terreo-maquina"]');ok((await p.textContent('#pdPnV .placar .num')).trim()==='2','filtro do painel');
 if(SHOT)await p.screenshot({path:SHOT+'/p_painel.png',fullPage:true});ok(!p.errors.length,p.errors.join(';'))});

await T("P14 Celular: painel e embalagem sem rolagem horizontal",async()=>{const p=await page(b,base(),{width:390,height:844});
 await posto(p,'Ana','terreo','mesa');await bipar(p,'PR001',['201','202']);await p.evaluate(()=>pdSubPr('pn'));await p.evaluate(()=>pdRender());await p.waitForTimeout(80);
 let w=await p.evaluate(()=>document.documentElement.scrollWidth);ok(w<=391,'painel '+w);if(SHOT)await p.screenshot({path:SHOT+'/p_painel_cel.png',fullPage:true});
 for(const v of ['eq','ind']){await emb(p,v);w=await p.evaluate(()=>document.documentElement.scrollWidth);ok(w<=391,v+' '+w)}ok(!p.errors.length,p.errors.join(';'))});

await b.close();let f=0;R.forEach(([s,n,i])=>{if(s!=="PASS")f++;console.log((s==="PASS"?"✅ ":"❌ ")+n+"  "+(s==="PASS"?"("+i+"ms)":i))});console.log("\n"+(R.length-f)+"/"+R.length+" passaram");process.exit(f?1:0)})();
