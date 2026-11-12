// Testes do modo servidor do RC Ondas, com um Supabase de mentira (em memória).
// As regras reais do banco são testadas em supabase/tests/rls_test.sql.
const {chromium}=require('playwright');
const PAGE='http://127.0.0.1:8765/'+(process.argv[2]||'index.html')+'?srv=1';
const HOST='https://fiqintmclivzckmfjeml.supabase.co';
const R=[];const ok=(c,m)=>{if(!c)throw new Error(m)};
const G1='00000000-0000-4000-8000-0000000000a1',G2='00000000-0000-4000-8000-0000000000a2';
const normWN=s=>{s=String(s).replace(/\s+/g,'');return /^\d+$/.test(s)?s.replace(/^0+(?=\d)/,''):s.toUpperCase()};
const HJ=(()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')})();
function banco(){return{down:false,expiresIn:3600,calls:{rpc:0,refresh:0},seq:1,
 galpoes:[{id:G1,nome:'Galpão 1'},{id:G2,nome:'Galpão 2'}],metas:[{galpao_id:G1,data:HJ,meta:2000}],
 tipos:[['Vários artigos',1000],['Múltiplas quantidades',1000],['Itens Únicos',100],['Maiores/Pesados',10],['Retrabalho',1000],['Pacote do mesmo',1000]].map((t,i)=>({nome:t[0],limite:t[1],ordem:i+1})),
 config:[{id:true,turno1_ini:7,turno1_fim:16,turno2_ini:16,turno2_fim:23,intervalo_max_min:30,tolerancia_min:15,ondas_em_andamento:true}],
 operadores:[{id:'00000000-0000-4000-8000-0000000000b1',codigo:'CL001',nome:'Ana Souza',turno:1,galpao_id:G1,excluido_em:null},
             {id:'00000000-0000-4000-8000-0000000000b2',codigo:'CL002',nome:'Carla Dias',turno:2,galpao_id:G2,excluido_em:null}],
 gestores:[{email:'adm@x.com',nome:'Admin',galpao_id:null,admin:true,pode_config:true,pode_individual:true,pode_registros:true},
           {email:'g2@x.com',nome:'Gestor G2',galpao_id:G2,admin:false,pode_config:true,pode_individual:true,pode_registros:true}],
 users:{'adm@x.com':{pw:'senha1234',ok:true},'g2@x.com':{pw:'senha1234',ok:true},'fora@x.com':{pw:'senha1234',ok:true},'novo@x.com':{pw:'senha1234',ok:false}},
 tokens:{},refs:{},ondas:[],pedidos:[],pedidoInfo:{}}}
function fake(db){const cors={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,PATCH,PUT,DELETE,OPTIONS'};
 const J=(route,status,body)=>route.fulfill({status,headers:Object.assign({'content-type':'application/json'},cors),body:body===undefined?'':JSON.stringify(body)});
 const sessao=email=>{const n=db.seq++;db.tokens['tok'+n]=email;db.refs['ref'+n]=email;return{access_token:'tok'+n,refresh_token:'ref'+n,expires_in:db.expiresIn,user:{email}}};
 return async route=>{const req=route.request(),u=new URL(req.url()),m=req.method();
  if(m==='OPTIONS')return route.fulfill({status:204,headers:cors});
  if(db.down)return J(route,500,{message:'servidor fora do ar'});
  const bearer=(req.headers()['authorization']||'').replace('Bearer ','');
  const email=db.tokens[bearer]||null;if(/^tok/.test(bearer)&&!email)return J(route,401,{message:'JWT expired',code:'PGRST301'});
  const g=email?db.gestores.find(x=>x.email===email):null;
  const body=req.postData()?JSON.parse(req.postData()):null,p=u.pathname,q=u.searchParams;
  const eq=k=>{const v=q.get(k);return v&&v.startsWith('eq.')?v.slice(3):null};
  const escopo=gal=>g&&(g.admin||g.galpao_id===gal);
  // ---- auth
  if(p==='/auth/v1/token'){
   if(q.get('grant_type')==='refresh_token'){db.calls.refresh++;const e=db.refs[body.refresh_token];if(!e)return J(route,400,{error_code:'refresh_token_not_found',msg:'Invalid Refresh Token'});delete db.refs[body.refresh_token];return J(route,200,sessao(e))}
   const us=db.users[body.email];if(!us||us.pw!==body.password)return J(route,400,{error_code:'invalid_credentials',msg:'Invalid login credentials'});
   if(!us.ok)return J(route,400,{error_code:'email_not_confirmed',msg:'Email not confirmed'});return J(route,200,sessao(body.email))}
  if(p==='/auth/v1/signup'){db.users[body.email]=db.users[body.email]||{pw:body.password,ok:false};if(db.semConfirmacao){db.users[body.email].ok=true;return J(route,200,sessao(body.email))}return J(route,200,{id:'u',email:body.email})}
  if(p==='/auth/v1/recover')return J(route,200,{});
  if(p==='/auth/v1/logout'){delete db.tokens[bearer];return route.fulfill({status:204,headers:cors})}
  if(p==='/auth/v1/user')return email?J(route,200,{email}):J(route,401,{msg:'no'});
  // ---- rest
  const t=p.replace('/rest/v1/','');
  if(t==='rpc/painel_publico'){
   const selected=db.ondas.filter(w=>w.status===0&&(!body.p_galpao||w.galpao_id===body.p_galpao)&&(!body.p_turno||db.operadores.find(o=>o.id===w.operador_id)?.turno===body.p_turno)&&[new Date(w.registrada_em).getFullYear(),String(new Date(w.registrada_em).getMonth()+1).padStart(2,'0'),String(new Date(w.registrada_em).getDate()).padStart(2,'0')].join('-')===body.p_dia);
   const group=(key,more)=>Object.values(selected.reduce((a,w)=>{const k=key(w);if(!a[k])a[k]=more(w);a[k].qtd+=w.quantidade;a[k].ondas++;return a},{}));
   const tipos=group(w=>w.tipo,w=>({tipo:w.tipo,qtd:0,ondas:0})),gals=group(w=>w.galpao_id,w=>({nome:db.galpoes.find(g=>g.id===w.galpao_id).nome,qtd:0,ondas:0,pessoas:0}));
   return J(route,200,{total:selected.reduce((n,w)=>n+w.quantidade,0),ondas:selected.length,pessoas:new Set(selected.map(w=>w.operador_id)).size,extra_un:0,extra_ondas:0,dur_ms:0,dur_n:0,dur_tipos:[],horas:[],tipos,galpoes:gals})}
  if(t==='rpc/registrar_ondas'){db.calls.rpc++;return J(route,200,body.lote.map(o=>{
    if(db.ondas.some(x=>x.id===o.id))return{id:o.id,resultado:'ja_existia',detalhe:null};
    if(db.ondas.some(x=>normWN(x.wn)===normWN(o.wn)))return{id:o.id,resultado:'wn_repetido',detalhe:'A onda '+o.wn+' já foi registrada'};
    const op=db.operadores.find(x=>x.id===o.operador_id&&!x.excluido_em);if(!op)return{id:o.id,resultado:'recusada',detalhe:'Operador não encontrado ou excluído'};
    const lim=(db.tipos.find(x=>x.nome===o.tipo)||{}).limite;if(!lim||o.quantidade>lim)return{id:o.id,resultado:'recusada',detalhe:'Quantidade '+o.quantidade+' acima do limite de '+lim+' para '+o.tipo};
    db.ondas.push({id:o.id,wn:o.wn,operador_id:o.operador_id,galpao_id:op.galpao_id,tipo:o.tipo,quantidade:o.quantidade,status:o.status||0,registrada_em:o.registrada_em,concluida_em:o.concluida_em,encerrada_auto:false});
    return{id:o.id,resultado:'ok',detalhe:null}}))}
  if(m==='GET'){
   if(t==='galpoes')return J(route,200,db.galpoes.slice().sort((a,b)=>a.nome.localeCompare(b.nome)));
   if(t==='tipos_onda')return J(route,200,db.tipos);
   if(t==='config')return J(route,200,db.config);
   if(t==='operadores')return J(route,200,db.operadores.filter(o=>!o.excluido_em||escopo(o.galpao_id)).sort((a,b)=>a.codigo.localeCompare(b.codigo)));
   if(t==='gestores')return J(route,200,!g?[]:g.admin?db.gestores:[g]);
   if(t==='ondas'){if(!email)return J(route,401,{message:'permission denied for table ondas',code:'42501'});
    const de=(q.get('registrada_em')||'gte.').slice(4),off=+q.get('offset')||0,lim=+q.get('limit')||1000;
    return J(route,200,db.ondas.filter(o=>escopo(o.galpao_id)&&o.registrada_em>=de).sort((a,b)=>a.registrada_em<b.registrada_em?-1:1).slice(off,off+lim))}}
  const podeC=gal=>g&&g.pode_config&&(g.admin||g.galpao_id===gal);
  if(t==='operadores'&&m==='POST'){if(!podeC(body.galpao_id))return J(route,403,{code:'42501',message:'new row violates row-level security policy'});
   if(db.operadores.some(o=>!o.excluido_em&&(o.codigo===body.codigo||o.nome.toLowerCase()===body.nome.toLowerCase())))return J(route,409,{code:'23505',message:'duplicate key value'});
   const row=Object.assign({id:'00000000-0000-4000-8000-'+String(db.seq++).padStart(12,'0'),excluido_em:null},body);db.operadores.push(row);return J(route,201,[row])}
  if(t==='operadores'&&m==='PATCH'){const o=db.operadores.find(x=>x.id===eq('id'));if(!o||!podeC(o.galpao_id))return J(route,200,[]);Object.assign(o,body);return J(route,200,[o])}
  if(t==='galpoes'&&m==='POST'){if(!(g&&g.admin))return J(route,403,{code:'42501',message:'rls'});const row=Object.assign({id:'00000000-0000-4000-8000-'+String(db.seq++).padStart(12,'0')},body);db.galpoes.push(row);return J(route,201,[row])}
  if(t==='galpoes'&&m==='PATCH'){const o=db.galpoes.find(x=>x.id===eq('id'));if(!o||!(g&&(g.admin||(g.pode_config&&g.galpao_id===o.id))))return J(route,200,[]);Object.assign(o,body);return J(route,200,[o])}
  if(t==='galpoes'&&m==='DELETE'){const o=db.galpoes.find(x=>x.id===eq('id'));if(!o||!(g&&g.admin))return J(route,200,[]);
   if(db.operadores.some(x=>x.galpao_id===o.id)||db.ondas.some(x=>x.galpao_id===o.id))return J(route,409,{code:'23503',message:'violates foreign key constraint'});db.galpoes=db.galpoes.filter(x=>x!==o);return J(route,200,[o])}
  if(t==='tipos_onda'&&m==='PATCH'){const o=db.tipos.find(x=>x.nome===eq('nome'));if(!o||!(g&&g.admin))return J(route,200,[]);Object.assign(o,body);return J(route,200,[o])}
  if(t==='config'&&m==='PATCH'){if(!(g&&g.admin))return J(route,200,[]);Object.assign(db.config[0],body);return J(route,200,db.config)}
  if(t==='gestores'&&m==='POST'){if(!(g&&g.admin))return J(route,403,{code:'42501',message:'rls'});if(db.gestores.some(x=>x.email===body.email))return J(route,409,{code:'23505',message:'dup'});db.gestores.push(body);return J(route,201,[body])}
  if(t==='gestores'&&m==='DELETE'){const o=db.gestores.find(x=>x.email===eq('email'));if(!o||!(g&&g.admin))return J(route,200,[]);db.gestores=db.gestores.filter(x=>x!==o);return J(route,200,[o])}
  if(t==='ondas'&&(m==='PATCH'||m==='DELETE')){const alvo=db.ondas.filter(o=>(eq('id')?o.id===eq('id'):o.status!==0)&&g&&g.pode_registros&&escopo(o.galpao_id));
   if(m==='DELETE')db.ondas=db.ondas.filter(o=>!alvo.includes(o));else alvo.forEach(o=>Object.assign(o,body));return J(route,200,alvo)}
  if(t==='rpc/solicitar_acesso'&&m==='POST'){if(!email)return J(route,401,{message:'sem sessao'});if(!db.gestores.some(x=>x.email===email)&&!db.pedidos.includes(email))db.pedidos.push(email);const inf=db.pedidoInfo[email]||{};if(body&&body.p_nome)inf.nome=body.p_nome;if(body&&body.p_galpao)inf.galpao_id=body.p_galpao;db.pedidoInfo[email]=inf;return route.fulfill({status:204,headers:cors})}
  if(t==='rpc/aceitar_solicitacao'&&m==='POST'){if(!(g&&g.admin))return J(route,403,{code:'42501',message:'Sem permissao'});db.gestores.push({email:body.p_email,nome:body.p_nome,galpao_id:body.p_galpao,admin:body.p_admin,pode_config:body.p_pc,pode_individual:body.p_pi,pode_registros:body.p_pr});db.pedidos=db.pedidos.filter(x=>x!==body.p_email);return route.fulfill({status:204,headers:cors})}
  if(t==='solicitacoes_gestor'){if(!(g&&g.admin))return J(route,200,[]);
   if(m==='GET')return J(route,200,db.pedidos.map(e=>({email:e,criado_em:'2026-11-11T20:12:00Z',nome:(db.pedidoInfo[e]||{}).nome||null,galpao_id:(db.pedidoInfo[e]||{}).galpao_id||null})));
   if(m==='DELETE'){const e=eq('email'),had=db.pedidos.includes(e);db.pedidos=db.pedidos.filter(x=>x!==e);return J(route,200,had?[{email:e}]:[])}}
  if(t==='metas_diarias'){
   if(m==='GET')return J(route,200,!g?[]:db.metas.filter(x=>x.data===eq('data')&&escopo(x.galpao_id)));
   if(m==='POST'){if(!podeC(body.galpao_id))return J(route,403,{code:'42501',message:'rls'});const i=db.metas.findIndex(x=>x.galpao_id===body.galpao_id&&x.data===body.data);if(i>=0)db.metas[i]=body;else db.metas.push(body);return J(route,201,[body])}
   if(m==='DELETE'){const gid=eq('galpao_id'),dt=eq('data');if(!podeC(gid))return J(route,200,[]);const had=db.metas.filter(x=>x.galpao_id===gid&&x.data===dt);db.metas=db.metas.filter(x=>!had.includes(x));return J(route,200,had)}}
  if(t==='rpc/marcar_procurando'&&m==='POST'){const n=x=>String(x).replace(/^0+/,'');const o=db.ondas.find(x=>n(x.wn)===n(body.p_wn));
   if(!body.p_sku||!String(body.p_sku).trim())return J(route,400,{code:'22023',message:'Informe o SKU (até 40 caracteres)'});
   if(!o)return J(route,404,{code:'P0002',message:'Onda '+body.p_wn+' não está registrada'});
   const op=db.operadores.find(x=>x.id===o.operador_id);o.procura_hist=(o.procura_hist||[]).concat({e:'m',q:op?op.nome:'',t:new Date().toISOString()});
   Object.assign(o,{status:1,concluida_em:null,procura_sku:body.p_sku,procura_local:body.p_local,procura_nome:op?op.nome:'',procura_em:new Date().toISOString()});
   return J(route,200,{id:o.id,wn:o.wn,tipo:o.tipo,quantidade:o.quantidade,galpao_id:o.galpao_id,operador_id:o.operador_id,registrada_em:o.registrada_em,procura_em:o.procura_em,procura_nome:o.procura_nome,procura_hist:o.procura_hist})}
  if(t==='rpc/encontrar_procurando'&&m==='POST'){const o=db.ondas.find(x=>x.wn===body.p_wn&&x.status===1);if(o){o.status=0;o.concluida_em=new Date().toISOString();o.procura_hist.push({e:'a',t:new Date().toISOString()})}return J(route,200,!!o)}
  if(t==='rpc/zerar_tempo_ondas'&&m==='POST'){const ws=(body.p_wns||[]).map(x=>String(x).replace(/^0+/,''));const hit=db.ondas.filter(o=>o.status===0&&ws.includes(String(o.wn).replace(/^0+/,'')));if(!hit.length)return J(route,404,{code:'P0002',message:'onda_nao_encontrada'});hit.forEach(o=>o.tempo_zerado=true);return J(route,200,hit.length)}
  if(t==='rpc/baixar_procurando'&&m==='POST'){if(!body.p_nome||body.p_nome.trim().length<2)return J(route,400,{code:'22023',message:'Informe o nome de quem fez (2 a 80 caracteres)'});
   const o=db.ondas.find(x=>x.wn===body.p_wn&&x.status===0&&!x.procura_achou_por&&(x.procura_hist||[]).slice(-1)[0]&&x.procura_hist.slice(-1)[0].e==='a');
   if(o){o.procura_achou_por=body.p_nome;o.procura_hist.push({e:'b',q:body.p_nome,t:new Date().toISOString()})}return J(route,200,!!o)}
  if(t==='rpc/apagar_ondas'&&m==='POST'){if(!(g&&g.admin))return J(route,403,{code:'42501',message:'Somente o administrador pode apagar registros'});
   const ini=Date.parse(body.p_de+'T00:00:00-03:00'),fim=Date.parse(body.p_ate+'T00:00:00-03:00')+864e5;
   const alvo=db.ondas.filter(o=>{const t0=Date.parse(o.registrada_em);return t0>=ini&&t0<fim&&(!body.p_galpao||o.galpao_id===body.p_galpao)});
   if(!body.p_so_contar)db.ondas=db.ondas.filter(o=>!alvo.includes(o));
   return J(route,200,alvo.length)}
  return J(route,404,{message:'rota não simulada: '+m+' '+p})}}
async function page(b,db,opts={}){const ctx=await b.newContext({viewport:opts.vp||{width:1366,height:900}});const p=await ctx.newPage();if(!opts.festa)await p.addInitScript(()=>{window.__semFesta=1});if(!opts.sidebarSubs)await p.addInitScript(()=>{document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent='#sub,#gsub,#psub,#hsub,#csub{display:flex!important}';document.head.appendChild(s)})});
 p.errors=[];p.on('pageerror',e=>p.errors.push(e.message));p.on('dialog',d=>d.accept());
 await p.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.abort());await p.route(HOST+'/**',fake(db));
 if(opts.antigo)await ctx.addInitScript(s=>{if(!sessionStorage.__a){sessionStorage.__a=1;localStorage.setItem('rcondas.v2',s)}},JSON.stringify(opts.antigo));
 await p.goto(PAGE);await p.waitForTimeout(450);return p}
async function reg(p,op,ty,rows){await p.click('.tab[data-t="op"]');await p.waitForTimeout(100);await p.fill('#opIn','');await p.type('#opIn',op);await p.waitForTimeout(260);
 await p.click(`[data-ty="${ty}"] span`);await p.waitForTimeout(420);
 for(const [wn,q] of rows){await p.keyboard.type(String(wn));await p.keyboard.press('Enter');await p.keyboard.type(String(q));await p.keyboard.press('Enter')}
 await p.click('#save');await p.waitForTimeout(450)}
async function login(p,email,pw){await p.click('#logbtn');await p.fill('#lU',email);await p.fill('#lP',pw);await p.click('#lB');await p.waitForTimeout(600)}
const num=p=>p.evaluate(()=>(document.querySelector('#kpis .num')||{}).textContent);
async function T(name,fn){const t0=Date.now();try{const i=await fn();R.push(['PASS',name,(i||'')+` (${Date.now()-t0}ms)`])}catch(e){R.push(['FALHA',name,e.message.split('\n')[0]])}}
(async()=>{const b=await chromium.launch();

await T('S01 Público: carrega cadastros do banco e abre no Painel',async()=>{const db=banco();const p=await page(b,db);
 const r=await p.evaluate(()=>({ops:S.ops.map(o=>o.m).join(),gals:S.gals.join(),view,temId:!!S.ops[0].id}));
 ok(r.ops==='CL001,CL002'&&r.gals==='Galpão 1,Galpão 2'&&r.view==='painel'&&r.temId,JSON.stringify(r));ok(p.errors.length===0,p.errors.join(';'))});

await T('S02 Público: Painel aberto e gestão exige login',async()=>{const db=banco(),agora=new Date().toISOString();db.ondas.push({id:'a',wn:'123',operador_id:db.operadores[0].id,galpao_id:G1,tipo:'Vários artigos',quantidade:31,status:0,registrada_em:agora,concluida_em:agora});const p=await page(b,db);
 await p.click('.tab[data-t="painel"]');ok(await p.isHidden('#login'),'painel pediu login');ok((await num(p)).trim()==='31','painel não trouxe o total');ok((await p.evaluate(()=>S.waves.filter(w=>w.srv).length))===0,'expôs ondas individuais');
 for(const t of['ind','cfg']){ok(await p.isHidden(`.tab[data-t="${t}"]`),t+' fica oculta sem login')}
 ok((await p.evaluate(()=>view))==='painel','saiu do painel')});

await T('S03 Público registra 3 ondas e elas chegam ao banco',async()=>{const db=banco();const p=await page(b,db);await reg(p,'CL001','Pacote do mesmo',[[5001,10],[5002,20],[5003,30]]);
 ok(db.ondas.length===3,'banco tem '+db.ondas.length);ok(db.ondas.every(o=>o.galpao_id===G1&&/^[0-9a-f-]{36}$/.test(o.id)),'galpão/id errado');
 const s=await p.evaluate(()=>S.waves.map(w=>w.sync+':'+(w.err||'')).join());ok(s==='1:,1:,1:','local: '+s);return (await p.textContent('#net')).trim()});

await T('S04 Sem internet: guarda na fila e envia quando volta, sem duplicar',async()=>{const db=banco();const p=await page(b,db);await p.click('#net');
 await reg(p,'CL001','Pacote do mesmo',[[6001,5],[6002,6]]);ok(db.ondas.length===0,'enviou offline');ok(/2 pendentes/.test(await p.textContent('#net')),'indicador: '+await p.textContent('#net'));
 await p.reload();await p.waitForTimeout(500);ok((await p.evaluate(()=>S.waves.filter(w=>!w.sync).length))===2,'fila perdida ao recarregar');
 await p.click('#net');await p.waitForTimeout(600);ok(db.ondas.length===2,'banco tem '+db.ondas.length);
 await p.evaluate(()=>{S.waves.forEach(w=>w.sync=0);return push()});await p.waitForTimeout(300);ok(db.ondas.length===2,'duplicou no reenvio: '+db.ondas.length);
 ok((await p.evaluate(()=>S.waves.filter(w=>!w.sync||w.err).length))===0,'ficou pendente ou com erro após reenvio')});

await T('S05 Servidor fora do ar: nada se perde e reenvia depois',async()=>{const db=banco();const p=await page(b,db);db.down=true;
 await reg(p,'CL001','Vários artigos',[[6101,7]]);ok(db.ondas.length===0,'?');ok((await p.evaluate(()=>S.waves.filter(w=>!w.sync).length))===1,'saiu da fila sem enviar');
 db.down=false;await p.evaluate(()=>push());await p.waitForTimeout(300);ok(db.ondas.length===1,'não reenviou')});

await T('S06 WN que já existe no banco (de outro aparelho) vira "recusada" e não conta',async()=>{const db=banco();
 db.ondas.push({id:'x1',wn:'07001',operador_id:db.operadores[1].id,galpao_id:G2,tipo:'Vários artigos',quantidade:9,status:0,registrada_em:new Date().toISOString(),concluida_em:new Date().toISOString()});
 const p=await page(b,db);await reg(p,'CL001','Pacote do mesmo',[[7001,10],[7002,11]]);ok(db.ondas.length===2,'banco tem '+db.ondas.length);
 const r=await p.evaluate(()=>({err:S.waves.filter(w=>w.err).map(w=>w.wn+':'+w.err).join(),prod:prod(S.waves).reduce((a,w)=>a+w.qty,0),txt:document.querySelector('#last').textContent}));
 ok(/^7001:A onda 7001 já foi registrada$/.test(r.err),'err: '+r.err);ok(r.prod===11,'produção local '+r.prod);ok(/recusada/.test(r.txt),'lista não mostra recusada');
 await p.click('#last [data-del]');await p.waitForTimeout(150);ok((await p.evaluate(()=>S.waves.length))===1,'não removeu a recusada')});

await T('S07 Senha errada, e-mail sem confirmação e e-mail que não é gestor não entram',async()=>{const db=banco();const p=await page(b,db);
 await login(p,'adm@x.com','errada');ok(!(await p.isHidden('#login')),'entrou com senha errada');ok(/inválidos/.test(await p.textContent('#toast')),await p.textContent('#toast'));
 await p.fill('#lU','novo@x.com');await p.fill('#lP','senha1234');await p.click('#lB');await p.waitForTimeout(400);ok(/Confirme o e-mail/.test(await p.textContent('#toast')),await p.textContent('#toast'));
 await p.fill('#lU','fora@x.com');await p.click('#lB');await p.waitForTimeout(500);ok(/Pedido enviado/.test(await p.textContent('#toast'))&&db.pedidos.includes('fora@x.com'),await p.textContent('#toast'));
 ok((await p.evaluate(()=>me===null&&sess===null)),'ficou sessão aberta')});

await T('S08 Admin vê todos os galpões; gestor comum vê só o dele',async()=>{const db=banco();const agora=new Date().toISOString();
 db.ondas.push({id:'a',wn:'1',operador_id:db.operadores[0].id,galpao_id:G1,tipo:'Vários artigos',quantidade:100,status:0,registrada_em:agora,concluida_em:agora},
               {id:'b',wn:'2',operador_id:db.operadores[1].id,galpao_id:G2,tipo:'Retrabalho',quantidade:7,status:0,registrada_em:agora,concluida_em:agora});
 const p=await page(b,db);await login(p,'g2@x.com','senha1234');const g2=await num(p),dis=await p.$eval('#gal',e=>e.disabled+':'+e.value);
 await p.click('#logbtn');await p.waitForTimeout(200);ok((await p.evaluate(()=>S.waves.length))===0,'ondas do servidor ficaram no aparelho após sair');
 await login(p,'adm@x.com','senha1234');await p.evaluate(()=>{$('#gal').value='__all';renderAll()});const all=await num(p);
 ok(g2.trim()==='7'&&dis==='true:Galpão 2','gestor: '+g2+' '+dis);ok(all.trim()==='107','admin: '+all);return `gestor ${g2.trim()}, admin ${all.trim()}`});

await T('S09 Sessão continua após recarregar e renova quando o acesso vence',async()=>{const db=banco();db.expiresIn=30;const p=await page(b,db);await login(p,'adm@x.com','senha1234');
 await p.reload();await p.waitForTimeout(700);ok((await p.evaluate(()=>me&&me.adm&&view==='painel')),'sessão não voltou');ok(db.calls.refresh>=1,'não renovou o acesso vencido')});

await T('S10 Admin cadastra operador; excluir libera o código para o próximo',async()=>{const db=banco();const p=await page(b,db);await login(p,'adm@x.com','senha1234');
 await p.click('.tab[data-t="cfg"]');await p.click('[data-c="cus"]');await p.fill('#uN','Diego Rocha');await p.click('#uB');await p.waitForTimeout(500);
 ok(db.operadores.some(o=>o.nome==='Diego Rocha'&&o.codigo==='CL003'),'não criou CL003');
 await p.click('[data-udel="CL001"]');await p.waitForTimeout(500);ok(db.operadores.find(o=>o.nome==='Ana Souza').excluido_em,'não excluiu');
 await p.fill('#uN','Eva Lima');await p.click('#uB');await p.waitForTimeout(500);ok(db.operadores.some(o=>o.nome==='Eva Lima'&&o.codigo==='CL001'),'código CL001 não foi reaproveitado');
 ok(p.errors.length===0,p.errors.join(';'))});

await T('S11 Gestor comum: não altera limites nem cria operador em outro galpão',async()=>{const db=banco();const p=await page(b,db);await login(p,'g2@x.com','senha1234');
 await p.click('.tab[data-t="cfg"]');await p.fill('[data-lim="Retrabalho"]','5');await p.press('[data-lim="Retrabalho"]','Tab');await p.waitForTimeout(450);
 ok(db.tipos.find(t=>t.nome==='Retrabalho').limite===1000,'alterou limite');ok(/Sem permissão/.test(await p.textContent('#toast')),await p.textContent('#toast'));
 ok((await p.$eval('[data-lim="Retrabalho"]',e=>e.value))==='1000','campo ficou com valor que não foi salvo');
 await p.click('[data-c="cus"]');await p.evaluate(()=>{const o=document.querySelector('#uG');o.innerHTML='<option>Galpão 1</option>';o.value='Galpão 1'});await p.fill('#uN','Fulano G1');await p.click('#uB');await p.waitForTimeout(450);
 ok(!db.operadores.some(o=>o.nome==='Fulano G1'),'criou em outro galpão')});

await T('S18 Admin libera pedido de acesso: aparece em Pedidos, aceita com galpão e o gestor passa a entrar',async()=>{const db=banco();db.pedidos.push('fora@x.com');db.users['fora@x.com'].ok=true;const p=await page(b,db);await login(p,'adm@x.com','senha1234');await p.click('.tab[data-t="cfg"]');
 await p.click('[data-c="cge"]');await p.waitForTimeout(500);const visto=(await p.textContent('#pedL')).includes('fora@x.com');
await p.fill('#mN','Fora Gestora');await p.click('[data-sacc="fora@x.com"]');await p.waitForTimeout(600);
 const criado=db.gestores.find(x=>x.email==='fora@x.com');const sumiu=!db.pedidos.includes('fora@x.com');
 ok(visto&&criado&&criado.galpao_id===G1&&criado.nome==='Fora Gestora'&&sumiu,'visto '+visto+', criado '+!!criado+', pedido apagado '+sumiu);});
await T('S19 Abas: sem login aparecem Operação e Painel; com login, as abas do perfil',async()=>{const db=banco();const p=await page(b,db);
 const vis=async t=>p.isVisible('.tab[data-t="'+t+'"]');
 const sem=[await vis('op'),await vis('painel'),await vis('ind'),await vis('cfg')];
 await login(p,'g2@x.com','senha1234');await p.waitForTimeout(300);
 const com=[await vis('op'),await vis('painel'),await vis('ind'),await vis('cfg')];
 ok(sem.join()==='true,true,false,false'&&com.join()==='true,true,true,true','sem login '+sem+' | gestor '+com);});
await T('S20 Manutenção: só o administrador vê; apaga o período escolhido depois de confirmar',async()=>{const db=banco();
 db.ondas.push({id:'m1',wn:'M1',operador_id:db.operadores[0].id,galpao_id:G1,tipo:'Vários artigos',quantidade:5,status:0,registrada_em:'2026-11-05T12:00:00-03:00',concluida_em:'2026-11-05T12:05:00-03:00',encerrada_auto:false});
 db.ondas.push({id:'m2',wn:'M2',operador_id:db.operadores[0].id,galpao_id:G1,tipo:'Vários artigos',quantidade:5,status:0,registrada_em:'2026-11-20T12:00:00-03:00',concluida_em:'2026-11-20T12:05:00-03:00',encerrada_auto:false});
 const pg=await page(b,db);await login(pg,'g2@x.com','senha1234');await pg.waitForTimeout(300);
 const gestorVe=await pg.isVisible('#csub [data-c="cma"]');
 const p=await page(b,db);await login(p,'adm@x.com','senha1234');await p.click('.tab[data-t="cfg"]');
 const admVe=await p.isVisible('#csub [data-c="cma"]');
 await p.click('[data-c="cma"]');await p.fill('#xDe','2026-11-01');await p.fill('#xAte','2026-11-10');await p.click('#xCont');await p.waitForTimeout(400);
 const contou=(await p.textContent('#xRes')).includes('1 registro');
 const travado=await p.isDisabled('#xDel');
 await p.fill('#xCon','APAGAR');await p.click('#xDel');await p.waitForTimeout(700);
 ok(!gestorVe&&admVe&&contou&&travado&&db.ondas.length===1&&db.ondas[0].id==='m2','gestor '+gestorVe+', admin '+admVe+', contou '+contou+', travado '+travado+', restam '+db.ondas.length)});
await T('S21 Cadastro sozinho: nome e galpão viram pedido e o administrador libera sem redigitar',async()=>{const db=banco();db.semConfirmacao=true;
 const pn=await page(b,db);await pn.click('#logbtn');await pn.fill('#lU','nova@x.com');await pn.fill('#lP','senha1234');await pn.click('#lNew');await pn.waitForTimeout(200);
 await pn.fill('#lN','Nova Pessoa');await pn.selectOption('#lG','Galpão 2');await pn.click('#lNew');await pn.waitForTimeout(700);
 const info=db.pedidoInfo['nova@x.com']||{};const pediu=db.pedidos.includes('nova@x.com')&&info.nome==='Nova Pessoa'&&info.galpao_id===G2;
 const pa=await page(b,db);await login(pa,'adm@x.com','senha1234');await pa.click('.tab[data-t="cfg"]');await pa.click('[data-c="cge"]');await pa.waitForTimeout(500);
 const lista=(await pa.textContent('#pedL')).includes('Nova Pessoa');
 await pa.click('[data-sacc="nova@x.com"]');await pa.waitForTimeout(600);
 const g=db.gestores.find(x=>x.email==='nova@x.com');
 ok(pediu&&lista&&g&&g.nome==='Nova Pessoa'&&g.galpao_id===G2&&!db.pedidos.includes('nova@x.com'),'pediu '+pediu+', lista '+lista+', gestor '+!!g)});
await T('S12 Admin: galpão, meta, limite, turno e gestor gravam no banco',async()=>{const db=banco();const p=await page(b,db);await login(p,'adm@x.com','senha1234');await p.click('.tab[data-t="cfg"]');
 await p.fill('[data-lim="Itens Únicos"]','250');await p.press('[data-lim="Itens Únicos"]','Tab');await p.waitForTimeout(400);
 await p.fill('[data-tn="1"][data-k="fim"]','17');await p.press('[data-tn="1"][data-k="fim"]','Tab');await p.waitForTimeout(400);
 await p.click('[data-c="cga"]');await p.fill('#gN','Galpão Norte');await p.click('#gB');await p.waitForTimeout(450);
 await p.fill('[data-gmeta="Galpão 2"]','3000');await p.press('[data-gmeta="Galpão 2"]','Tab');await p.waitForTimeout(450);
 await p.click('[data-gdel="0"]');await p.waitForTimeout(450);const tg=await p.textContent('#toast');
 await p.click('[data-c="cge"]');await p.fill('#mN','Nova Gestora');await p.fill('#mU','Nova@X.com');await p.click('#mB');await p.waitForTimeout(450);
 ok(db.tipos.find(t=>t.nome==='Itens Únicos').limite===250,'limite');ok(db.config[0].turno1_fim===17,'turno');
 ok(db.galpoes.some(g=>g.nome==='Galpão Norte'),'galpão novo');ok(db.metas.some(m=>m.galpao_id===G2&&m.data===HJ&&m.meta===3000),'meta do dia salva');
 ok(db.galpoes.some(g=>g.id===G1)&&/Não dá para excluir/.test(tg),'excluiu galpão com operadores: '+tg);
 ok(db.gestores.some(g=>g.email==='nova@x.com'&&!g.admin&&g.galpao_id),'gestor: '+JSON.stringify(db.gestores.slice(-1)));
 ok(await p.isHidden('#mP2'),'campo de senha do gestor aparece');ok(p.errors.length===0,p.errors.join(';'))});

await T('S13 Gestor exclui onda do banco; ondas somem do Painel',async()=>{const db=banco();const agora=new Date().toISOString();
 db.ondas.push({id:'00000000-0000-4000-8000-0000000000d1',wn:'1',operador_id:db.operadores[1].id,galpao_id:G2,tipo:'Retrabalho',quantidade:7,status:1,registrada_em:agora,concluida_em:null});
 const p=await page(b,db);await login(p,'g2@x.com','senha1234');await p.click('.tab[data-t="op"]');await p.click('[data-s="ctl"]');await p.waitForTimeout(150);
 await p.click('#ctlList [data-fin]');await p.waitForTimeout(450);ok(db.ondas[0].status===0&&db.ondas[0].concluida_em,'não concluiu no banco');
 await p.evaluate(()=>go('painel'));ok((await num(p)).trim()==='7','painel '+await num(p))});

await T('S14 Primeiro acesso e Esqueci a senha chamam o serviço certo',async()=>{const db=banco();const p=await page(b,db);await p.click('#logbtn');
 await p.fill('#lU','gestora@x.com');await p.fill('#lP','curta');await p.click('#lNew');await p.waitForTimeout(150);await p.fill('#lN','Gestora Teste');await p.selectOption('#lG','Galpão 1');await p.click('#lNew');await p.waitForTimeout(200);ok(!db.users['gestora@x.com'],'aceitou senha curta');
 await p.fill('#lP','senhaforte1');await p.click('#lNew');await p.waitForTimeout(400);ok(db.users['gestora@x.com']&&/link de confirmação/.test(await p.textContent('#toast')),await p.textContent('#toast'));
 await p.click('#lRec');await p.waitForTimeout(300);ok(/enviamos um link/.test(await p.textContent('#toast')),await p.textContent('#toast'))});

await T('S15 Dados antigos do aparelho: admin envia para o banco, e repetir não duplica',async()=>{const db=banco();const t=Date.now()-36e5;
 const antigo={gals:['Galpão 1','Galpão Sul'],metas:{'Galpão Sul':900},ops:[{m:'CL001',n:'Ana Souza',t:1,g:'Galpão 1'},{m:'CL002',n:'Zeca Antigo',t:2,g:'Galpão Sul'}],
  waves:[{id:'w1',wn:'8001',op:'CL001',opn:'Ana Souza',gal:'Galpão 1',ty:'Vários',qty:10,st:0,ts:t,fin:t},{id:'w2',wn:'8002',op:'CL002',opn:'Zeca Antigo',gal:'Galpão Sul',ty:'Itens Únicos',qty:5,st:0,ts:t,fin:t},{id:'w3',wn:'8003',op:'CL009~x',opn:'Sumiu',gal:'Galpão 1',ty:'Vários artigos',qty:1,st:0,ts:t,fin:t}]};
 const p=await page(b,db,{antigo});await login(p,'adm@x.com','senha1234');await p.click('.tab[data-t="cfg"]');await p.waitForTimeout(150);
 await p.click('#impB');await p.waitForTimeout(1500);const t1=await p.textContent('#toast');
 ok(db.galpoes.some(g=>g.nome==='Galpão Sul'),'galpão antigo criado');const z=db.operadores.find(o=>o.nome==='Zeca Antigo');ok(z&&z.codigo==='CL003','Zeca: '+JSON.stringify(z));
 ok(db.ondas.length===2&&db.ondas.some(o=>o.wn==='8001'&&o.tipo==='Vários artigos'),'ondas: '+JSON.stringify(db.ondas.map(o=>o.wn+o.tipo)));
 await p.click('#impB');await p.waitForTimeout(1500);ok(db.ondas.length===2&&db.operadores.length===3,'duplicou ao repetir');
 ok((await p.evaluate(()=>!!localStorage.getItem('rcondas.v2'))),'apagou os dados antigos do aparelho');return t1});

await T('S16 Lote grande: 250 ondas offline sobem em 3 envios',async()=>{const db=banco();const p=await page(b,db);
 await p.evaluate(()=>{S.off=true;const o=S.ops[0];for(let i=0;i<250;i++)S.waves.push({id:crypto.randomUUID(),oid:o.id,wn:String(90000+i),op:o.m,opn:o.n,gal:o.g,ty:'Vários artigos',qty:1+i%9,st:0,ts:Date.now(),fin:Date.now(),sync:0});save();S.off=false;return push()});
 await p.waitForTimeout(500);ok(db.ondas.length===250&&db.calls.rpc===3,'ondas '+db.ondas.length+' em '+db.calls.rpc+' envios');
 ok((await p.evaluate(()=>S.waves.every(w=>w.sync&&!w.err))),'sobrou pendente')});

await T('S17 Celular: registro público funciona e não há erro de JavaScript',async()=>{const db=banco();const p=await page(b,db,{vp:{width:390,height:844}});
 await reg(p,'CL002','Pacote do mesmo',[[9501,4]]);ok(db.ondas.length===1&&db.ondas[0].galpao_id===G2,'não chegou');ok(p.errors.length===0,p.errors.join(';'));
 ok((await p.evaluate(()=>document.documentElement.scrollWidth))<=392,'rolagem lateral')});


await T('S22 Gestor comum vê só "Meta do dia" e não cria nem lista galpões; admin vê tudo',async()=>{const db=banco();const p=await page(b,db);
 await login(p,'g2@x.com','senha1234');await p.click('.tab[data-t="cfg"]');
 const g=await p.evaluate(()=>({tab:document.querySelector('#csub [data-c="cga"]').textContent,novo:document.querySelector('#gNovo').classList.contains('hide'),nomes:document.querySelectorAll('#gL [data-gre]').length,linhas:document.querySelectorAll('#gL tr').length,txt:document.querySelector('#gL').textContent}));
 ok(g.tab==='Meta do dia'&&g.novo&&g.nomes===0&&g.linhas===2&&g.txt.includes('Galpão 2')&&!g.txt.includes('Galpão 1'),JSON.stringify(g));
 await p.click('#logbtn');await login(p,'adm@x.com','senha1234');await p.click('.tab[data-t="cfg"]');
 const a=await p.evaluate(()=>({tab:document.querySelector('#csub [data-c="cga"]').textContent,novo:document.querySelector('#gNovo').classList.contains('hide'),nomes:document.querySelectorAll('#gL [data-gre]').length}));
 ok(a.tab==='Galpões'&&!a.novo&&a.nomes===2,JSON.stringify(a))});
await T('S23 Procurando no servidor: pendente com SKU, encontrada e baixa com nome; WN desconhecido avisa',async()=>{const db=banco();
 db.ondas.push({id:'x1',wn:'555',operador_id:db.operadores[0].id,galpao_id:G1,tipo:'Vários artigos',quantidade:40,status:0,registrada_em:new Date().toISOString(),concluida_em:new Date().toISOString(),procura_hist:[]});
 const p=await page(b,db);await p.click('.tab[data-t="prs"]');
 await p.fill('#prBip','999');await p.press('#prBip','Enter');await p.fill('#prSku','S1');await p.press('#prSku','Enter');await p.waitForTimeout(400);
 ok((await p.textContent('#toast')).includes('não está registrada'),'toast: '+await p.textContent('#toast'));
 await p.fill('#prBip','0555');await p.press('#prBip','Enter');await p.fill('#prSku','SKU-7');await p.fill('#prLoc','B-02');await p.press('#prLoc','Enter');await p.waitForTimeout(500);
 ok(db.ondas[0].status===1&&db.ondas[0].procura_sku==='SKU-7'&&db.ondas[0].procura_local==='B-02','banco: '+JSON.stringify(db.ondas[0]));
 ok((await p.textContent('#prList')).includes('SKU-7'),'pendentes sem a onda');
 await p.fill('#prBip','555');await p.press('#prBip','Enter');await p.click('#prAOk');await p.waitForTimeout(500);ok(db.ondas[0].status===0,'banco não voltou a 0');
 ok((await p.textContent('#prList')).includes('Nenhuma')&&(await p.textContent('#prHist')).includes('Dar baixa'),'etapas na tela');
 await p.fill('#prBip','555');await p.press('#prBip','Enter');await p.fill('#prNome','J');await p.press('#prNome','Enter');await p.waitForTimeout(400);
 ok(!db.ondas[0].procura_achou_por&&(await p.textContent('#toast')).length>0,'aceitou nome curto');
 await p.fill('#prNome','João Pedro');await p.press('#prNome','Enter');await p.waitForTimeout(500);
 ok(db.ondas[0].procura_achou_por==='João Pedro'&&db.ondas[0].procura_hist.map(e=>e.e).join('')==='mab','banco baixa: '+JSON.stringify(db.ondas[0].procura_hist));
 ok((await p.textContent('#prHist')).includes('João Pedro'),'histórico sem o nome')});
await T('S24 Meta individual grava no galpão (admin) e é recusada para outro galpão (gestor)',async()=>{const db=banco();const p=await page(b,db);
 await login(p,'adm@x.com','senha1234');await p.click('.tab[data-t="cfg"]');await p.click('[data-c="cga"]');
 await p.fill('[data-gmo="Galpão 1"]','30');await p.press('[data-gmo="Galpão 1"]','Tab');await p.waitForTimeout(450);
 await p.fill('[data-gmq="Galpão 1"]','900');await p.press('[data-gmq="Galpão 1"]','Tab');await p.waitForTimeout(450);
 const g1=db.galpoes.find(x=>x.id===G1);ok(g1.meta_ind_ondas===30&&g1.meta_ind_qtd===900,JSON.stringify(g1));
 await p.fill('[data-gmo="Galpão 1"]','');await p.press('[data-gmo="Galpão 1"]','Tab');await p.waitForTimeout(450);
 ok(g1.meta_ind_ondas===null,'não removeu: '+g1.meta_ind_ondas)});
await T('S25 Gestor comum: Usuários só do galpão dele, cria usuário nele e a aba Gestores some; admin vê tudo',async()=>{const db=banco();const p=await page(b,db);
 const ver=()=>p.evaluate(()=>({lista:document.querySelector('#uL').textContent,sel:document.querySelector('#uG').closest('label').classList.contains('hide'),ges:getComputedStyle(document.querySelector('#csub [data-c="cge"]')).display}));
 await login(p,'g2@x.com','senha1234');await p.click('.tab[data-t="cfg"]');await p.click('[data-c="cus"]');
 const x=await ver();ok(x.lista.includes('Carla Dias')&&!x.lista.includes('Ana Souza')&&x.sel&&x.ges==='none',JSON.stringify(x));
 await p.fill('#uN','Novo Op');await p.click('#uB');await p.waitForTimeout(500);
 const n=db.operadores.find(o=>o.nome==='Novo Op');ok(n&&n.galpao_id===G2,JSON.stringify(n));
 await p.click('#logbtn');await login(p,'adm@x.com','senha1234');await p.click('.tab[data-t="cfg"]');await p.click('[data-c="cus"]');
 const a=await ver();ok(a.lista.includes('Ana Souza')&&a.lista.includes('Carla Dias')&&!a.sel&&a.ges!=='none',JSON.stringify(a))});
await T('S29 Site público: turno, galpão e data escondidos sem login; gestor vê',async()=>{const db=banco();const p=await page(b,db);
 await p.waitForTimeout(300);
 for(const i of ['#turnoF','#gal','#day'])ok(!(await p.isVisible(i)),i+' visível no público');
 await login(p,'g2@x.com','senha1234');await p.waitForTimeout(300);
 for(const i of ['#turnoF','#gal','#day'])ok(await p.isVisible(i),i+' deveria aparecer para gestor')});
await T('S26 Histórico no servidor: gestor do galpão vê só o dele; aba exige login',async()=>{const db=banco();const p=await page(b,db);
 const t=(d,h)=>{const x=new Date();x.setDate(x.getDate()-d);x.setHours(h,0,0,0);return x.toISOString()};
 [[1,G1,100],[2,G1,120],[3,G1,90],[1,G2,7],[2,G2,9]].forEach(([d,g,q],i)=>db.ondas.push({id:'hs'+i,wn:'HS'+i,operador_id:db.operadores.find(o=>o.galpao_id===g).id,galpao_id:g,tipo:'Vários artigos',quantidade:q,status:0,registrada_em:t(d,9),concluida_em:t(d,9),encerrada_auto:false}));
 ok(!(await p.isVisible('.tab[data-t="his"]')),'aba visível sem login');
 await login(p,'g2@x.com','senha1234');await p.evaluate(()=>go('his'));await p.waitForTimeout(600);
 let x=(await p.textContent('#hBody')).replace(/\s+/g,' ');ok(x.includes('Melhor dia')&&x.includes('16')&&!x.includes('310'),'gestor G2: '+x.slice(0,260));
 ok(await p.$eval('#hGal',e=>e.style.display==='none'),'gestor não deveria escolher galpão');
 await p.click('#logbtn');await login(p,'adm@x.com','senha1234');await p.evaluate(()=>go('his'));await p.selectOption('#hMet','o');await p.selectOption('#hMet','u');await p.waitForTimeout(600);
 x=(await p.textContent('#hBody')).replace(/\s+/g,' ');ok(x.includes('326'),'admin deveria somar tudo (326): '+x.slice(0,260))});
await T('S27 Histórico não fica preso em Carregando quando a conta atualiza (authUI)',async()=>{const db=banco();const p=await page(b,db);
 db.ondas.push({id:'hz1',wn:'HZ1',operador_id:db.operadores[0].id,galpao_id:G1,tipo:'Vários artigos',quantidade:50,status:0,registrada_em:new Date(Date.now()-36e5).toISOString(),concluida_em:new Date(Date.now()-36e5).toISOString(),encerrada_auto:false});
 await login(p,'adm@x.com','senha1234');await p.evaluate(()=>go('his'));await p.waitForTimeout(700);
 ok(!(await p.textContent('#hBody')).includes('Carregando'),'não carregou');
 await p.evaluate(()=>{authUI();renderAll()});await p.waitForTimeout(300);ok(!(await p.textContent('#hBody')).includes('Carregando'),'ficou carregando após authUI');
 await p.evaluate(()=>{HW=null;hKey='';hisRender()});await p.waitForTimeout(900);ok(!(await p.textContent('#hBody')).includes('Carregando')&&(await p.textContent('#hBody')).includes('Total no período'),'não se recuperou sozinho')});
await T('S28 Zerar tempo grava no servidor e some da contagem',async()=>{const db=banco();const p=await page(b,db);
 db.ondas.push({id:'zz1',wn:'ZT1',operador_id:db.operadores[0].id,galpao_id:G1,tipo:'Vários artigos',quantidade:50,status:0,registrada_em:new Date(Date.now()-60000).toISOString(),concluida_em:new Date(Date.now()-60000).toISOString(),encerrada_auto:false});
 await login(p,'adm@x.com','senha1234');await p.evaluate(()=>pull());await p.waitForTimeout(600);
 const ok0=await p.evaluate(()=>S.waves.some(w=>w.wn==='ZT1'));ok(ok0,'onda não veio do servidor');
 await p.evaluate(()=>zerarTempo(S.waves.filter(w=>w.wn==='ZT1').map(w=>w.id)));await p.waitForTimeout(500);
 ok(db.ondas.find(o=>o.id==='zz1').tempo_zerado===true,'servidor não marcou');
 ok(await p.evaluate(()=>S.waves.find(w=>w.wn==='ZT1').zt===1),'cliente não marcou')});
await b.close();
const w=Math.max(...R.map(r=>r[1].length));for(const r of R)console.log((r[0]==='PASS'?'✅':'❌')+' '+r[1].padEnd(w)+'  '+r[2]);
console.log(`\n${R.filter(r=>r[0]==='PASS').length}/${R.length} passaram`)})();
