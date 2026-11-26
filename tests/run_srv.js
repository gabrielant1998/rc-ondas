// Testes do modo servidor do RC Ondas, com um Supabase de mentira (em memória).
// As regras reais do banco são testadas em supabase/tests/rls_test.sql.
const {chromium}=require('playwright');
const abrirAdd=async p=>{await p.evaluate(()=>document.querySelectorAll('.cfgAddOff').forEach(x=>x.classList.remove('cfgAddOff')))};
const PAGE='http://127.0.0.1:8765/'+(process.argv[2]||'index.html')+'?srv=1';
const HOST='https://fiqintmclivzckmfjeml.supabase.co';
const R=[];const ok=(c,m)=>{if(!c)throw new Error(m)};
const G1='00000000-0000-4000-8000-0000000000a1',G2='00000000-0000-4000-8000-0000000000a2';
const normWN=s=>{s=String(s).replace(/\s+/g,'');return /^\d+$/.test(s)?s.replace(/^0+(?=\d)/,''):s.toUpperCase()};
const HJ=(()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')})();
function banco(){return{down:false,expiresIn:3600,calls:{rpc:0,refresh:0},seq:1,
 galpoes:[{id:G1,nome:'Galpão 1'},{id:G2,nome:'Galpão 2'}],metas:[{galpao_id:G1,data:HJ,meta:2000}],
 tipos:[['Vários artigos',1000],['Múltiplas quantidades',1000],['Itens Únicos',100],['Maiores/Pesados',10],['Retrabalho',1000],['Pacote do mesmo',1000]].map((t,i)=>({nome:t[0],limite:t[1],ordem:i+1,multiplas_no_lancamento:['Maiores/Pesados','Retrabalho','Pacote do mesmo'].includes(t[0])})),
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
  if(p==='/functions/v1/gestor-conta'){db.calls.fn=(db.calls.fn||0)+1;if(!g||!g.admin)return J(route,403,{erro:'Só o administrador pode criar gestores ou trocar senhas.'});
   const em=String(body.email||'').toLowerCase();if((body.senha||'').length<8)return J(route,400,{erro:'A senha precisa ter de 8 a 72 caracteres.'});
   if(body.acao==='criar'){if(db.gestores.some(x=>x.email===em))return J(route,409,{erro:'Já existe um gestor com este e-mail. Use Trocar senha na lista.'});
    if(body.perfil==='bipador'){const r=db.gestores.find(x=>x.email===body.responsavel&&x.perfil!=='bipador');if(!r)return J(route,400,{erro:'Escolha o gestor responsável.'});db.users[em]={pw:body.senha,ok:true};db.gestores.push({email:em,nome:body.nome,galpao_id:body.galpao_id||r.galpao_id,admin:false,pode_config:false,pode_individual:false,pode_registros:false,perfil:'bipador',responsavel:r.email,abas:body.abas});return J(route,200,{ok:true})}
    db.users[em]={pw:body.senha,ok:true};db.gestores.push({email:em,nome:body.nome,galpao_id:body.admin?null:body.galpao_id,admin:!!body.admin,pode_config:body.pode_config!==false,pode_individual:body.pode_individual!==false,pode_registros:body.pode_registros!==false});return J(route,200,{ok:true})}
   if(body.acao==='senha'){if(!db.gestores.some(x=>x.email===em))return J(route,404,{erro:'Gestor não encontrado.'});db.users[em]={pw:body.senha,ok:true};return J(route,200,{ok:true})}
   return J(route,400,{erro:'Ação desconhecida.'})}
  if(p==='/auth/v1/logout'){delete db.tokens[bearer];return route.fulfill({status:204,headers:cors})}
  if(p==='/auth/v1/user'&&req.method()==='PUT'){if(!email)return J(route,401,{msg:'no'});db.calls.pwput=(db.calls.pwput||0)+1;db.users[email].pw=body.password;return J(route,200,{email})}
  if(p==='/auth/v1/user')return email?J(route,200,{email}):J(route,401,{msg:'no'});
  // ---- rest
  const t=p.replace('/rest/v1/','');
  if(t==='rpc/painel_publico'){
   const selected=db.ondas.filter(w=>w.status===0&&(!body.p_galpao||w.galpao_id===body.p_galpao)&&(!body.p_turno||db.operadores.find(o=>o.id===w.operador_id)?.turno===body.p_turno)&&[new Date(w.registrada_em).getFullYear(),String(new Date(w.registrada_em).getMonth()+1).padStart(2,'0'),String(new Date(w.registrada_em).getDate()).padStart(2,'0')].join('-')===body.p_dia);
   const group=(key,more)=>Object.values(selected.reduce((a,w)=>{const k=key(w);if(!a[k])a[k]=more(w);a[k].qtd+=w.quantidade;a[k].ondas++;return a},{}));
   const tipos=group(w=>w.tipo,w=>({tipo:w.tipo,qtd:0,ondas:0})),gals=group(w=>w.galpao_id,w=>({nome:db.galpoes.find(g=>g.id===w.galpao_id).nome,qtd:0,ondas:0,pessoas:0}));
   return J(route,200,{total:selected.reduce((n,w)=>n+w.quantidade,0),ondas:selected.length,pessoas:new Set(selected.map(w=>w.operador_id)).size,extra_un:0,extra_ondas:0,dur_ms:0,dur_n:0,dur_tipos:[],horas:[],tipos,galpoes:gals})}
  if(t==='rpc/relatorio_agregado'){db.calls.agg=(db.calls.agg||0)+1;const M=new Map();db.ondas.filter(o=>escopo(o.galpao_id)&&o.status===0&&o.registrada_em>=body.p_ini&&o.registrada_em<body.p_fim).forEach(o=>{const d=new Date(Date.parse(o.concluida_em||o.registrada_em)-3*36e5).toISOString().slice(0,10),k=[d,o.galpao_id,o.operador_id,o.tipo].join('|'),r=M.get(k)||{dia:d,galpao_id:o.galpao_id,operador_id:o.operador_id,tipo:o.tipo,ondas:0,unidades:0};r.ondas++;r.unidades+=o.quantidade;M.set(k,r)});return J(route,200,[...M.values()])}
  if(t==='rpc/ondas_publicas'){db.calls.pub=(db.calls.pub||0)+1;return J(route,200,db.ondas.filter(w=>{const d=new Date(Date.parse(w.registrada_em)-3*36e5).toISOString().slice(0,10);return d===body.p_dia}))}
  /* Produção (embalagem) */
  const nW=w=>{w=String(w||'').replace(/\s+/g,'');return /^\d+$/.test(w)?w.replace(/^0+(?=\d)/,''):w.toUpperCase()};
  db.pt=db.pt||[{id:1,nome:'1º turno',entrada:'06:00:00',saida:null,dias:[1,2,3,4,5,6],int_ini:null,int_fim:null,ativo:true},{id:2,nome:'2º turno',entrada:'09:00:00',saida:null,dias:[1,2,3,4,5,6],int_ini:null,int_fim:null,ativo:true}];db.pa=db.pa||[];db.pb=db.pb||[];db.pp=db.pp||[];db.ppes=db.ppes||[];
  if(t==='prod_turnos'&&m==='GET')return J(route,200,db.pt);
  if(t==='prod_pessoas'&&m==='GET')return J(route,200,db.ppes.filter(x=>!x.excluido_em));
  if(t==='rpc/prod_pessoa_salvar'){const c=String(body.p_codigo||'').toUpperCase();if(body.p_id==null){if(!g||!(g.admin||(g.pode_config&&g.galpao_id===body.p_galpao)))return J(route,403,{code:'42501',message:'Sem permissão para cadastrar pessoas da produção'});
    if(db.ppes.some(x=>!x.excluido_em&&x.codigo===c))return J(route,409,{code:'23505',message:'O código '+c+' já está em uso na produção'});const id='00000000-0000-4000-8000-0000000p'+String(db.seq++).padStart(4,'0');db.ppes.push({id,codigo:c,nome:body.p_nome,galpao_id:body.p_galpao,excluido_em:null});return J(route,200,id)}
   const x=db.ppes.find(z=>z.id===body.p_id);if(!g||!x||!(g.admin||(g.pode_config&&g.galpao_id===x.galpao_id)))return J(route,403,{code:'42501',message:'Sem permissão'});x.codigo=c;x.nome=body.p_nome;return J(route,200,x.id)}
  if(t==='rpc/prod_pessoa_excluir'){const x=db.ppes.find(z=>z.id===body.p_id);if(!g||!x||!(g.admin||(g.pode_config&&g.galpao_id===x.galpao_id)))return J(route,403,{code:'42501',message:'Sem permissão'});x.excluido_em=new Date().toISOString();db.pa.forEach(a=>{if(a.pessoa_id===x.id&&!a.fim)a.fim=x.excluido_em});return J(route,200,'ok')}
  if(t==='rpc/prod_postos')return J(route,200,db.pa.filter(a=>!a.fim));
  if(t==='prod_atribuicoes'&&m==='GET'){if(!g)return J(route,200,[]);return J(route,200,db.pa.filter(a=>{const o=db.ppes.find(x=>x.id===a.pessoa_id);return o&&escopo(o.galpao_id)}))}
  if(t==='prod_metas'&&m==='GET')return J(route,200,(db.pm||[]).slice().sort((x,y)=>x.inicio<y.inicio?-1:1));
  if(t==='rpc/prod_meta_salvar'){if(!g||!(g.admin||(g.pode_config&&g.galpao_id===body.p_galpao)))return J(route,403,{code:'42501',message:'Sem permissão para alterar as metas da produção'});
   const hj=new Date(Date.now()-3*36e5).toISOString().slice(0,10);if(body.p_inicio<hj)return J(route,400,{code:'22023',message:'A meta só pode valer a partir de hoje; os dias anteriores ficam com a meta da época'});
   db.pm=db.pm||[];const an=body.p_andar||null,x=db.pm.find(z=>z.galpao_id===body.p_galpao&&z.atividade===body.p_atividade&&(z.andar||null)===an&&z.inicio===body.p_inicio);const ph=body.p_por_dia/body.p_horas_dia;if(x)Object.assign(x,{por_dia:body.p_por_dia,horas_dia:body.p_horas_dia,por_hora:ph});else db.pm.push({galpao_id:body.p_galpao,atividade:body.p_atividade,andar:an,por_dia:body.p_por_dia,horas_dia:body.p_horas_dia,por_hora:ph,inicio:body.p_inicio,criado_por:email});return J(route,200,1)}
  if(t==='rpc/prod_bipagens_periodo'){if(!g)return J(route,403,{code:'42501',message:'Entre como gestor para ver o desempenho'});db.calls.per=(db.calls.per||0)+1;
   return J(route,200,db.pb.filter(x=>x.dia>=body.p_ini&&x.dia<=body.p_fim).map(x=>{const o=db.ppes.find(z=>z.id===x.pessoa_id)||{};return Object.assign({},x,{nome:o.nome,codigo:o.codigo,coletado:db.ondas.some(w=>nW(w.wn)===nW(x.wn))})}).filter(x=>{const o=db.ppes.find(z=>z.id===x.pessoa_id);return o&&escopo(o.galpao_id)}))}
  if(t==='rpc/prod_bipagens_dia')return J(route,200,db.pb.filter(x=>x.dia===body.p_dia).map(x=>Object.assign({},x,{coletado:db.ondas.some(w=>nW(w.wn)===nW(x.wn))})));
  if(t==='rpc/prod_turno_salvar'){if(!g||!(g.admin||g.pode_config))return J(route,403,{code:'42501',message:'Sem permissão para alterar turnos'});
   const x={nome:body.p_nome,entrada:body.p_entrada,saida:body.p_saida,dias:body.p_dias,int_ini:body.p_int_ini,int_fim:body.p_int_fim,ativo:body.p_ativo,sab_entrada:body.p_sab_entrada,sab_saida:body.p_sab_saida,dom_entrada:body.p_dom_entrada,dom_saida:body.p_dom_saida};
   if(body.p_id==null){const id=Math.max(...db.pt.map(t=>t.id))+1;db.pt.push(Object.assign({id},x));return J(route,200,id)}Object.assign(db.pt.find(t=>t.id===body.p_id),x);return J(route,200,body.p_id)}
  if(t==='rpc/prod_atribuir'){const o=db.ppes.find(x=>x.id===body.p_pessoa&&!x.excluido_em);
   if(!g||!o||!(g.admin||(g.pode_config&&g.galpao_id===o.galpao_id)))return J(route,403,{code:'42501',message:'Sem permissão para distribuir esta pessoa'});
   const cur=db.pa.find(a=>a.pessoa_id===o.id&&!a.fim);if(cur)cur.fim=body.p_desde;const id='a'+(db.seq++);
   db.pa.push({id,pessoa_id:o.id,andar:body.p_andar,atividade:body.p_atividade,turno_id:body.p_turno,entrada:body.p_entrada,saida:body.p_saida,situacao:body.p_situacao,inicio:body.p_desde,fim:null,criado_por:email});return J(route,200,id)}
  if(t==='rpc/registrar_embalagens'){db.calls.emb=(db.calls.emb||0)+1;return J(route,200,(body.lote||[]).map(x=>{const r={id:x.id,resultado:'ok',detalhe:null,coletado:null,presenca_nova:false,andar:null,atividade:null};
    if(x.quantidade!==undefined&&x.quantidade!==null&&!(Number.isInteger(x.quantidade)&&x.quantidade>=1&&x.quantidade<=5000))return Object.assign(r,{resultado:'recusada',detalhe:'A quantidade precisa ser um número inteiro de 1 a 5000'});
    const ehQ=x.quantidade!==undefined&&x.quantidade!==null;if(ehQ)x.wn='QTD'+String(x.id).replace(/-/g,'');
    const o=db.ppes.find(z=>z.id===x.pessoa_id&&!z.excluido_em);if(!o)return Object.assign(r,{resultado:'recusada',detalhe:'Pessoa não encontrada na produção'});
    const a=db.pa.find(z=>z.pessoa_id===o.id&&!z.fim);if(!a||a.situacao!=='ativo')return Object.assign(r,{resultado:'sem_posto',detalhe:o.nome+' ainda não tem posto na produção. Fale com o gestor.'});
    r.andar=a.andar;r.atividade=a.atividade;r.coletado=ehQ?false:db.ondas.some(w=>nW(w.wn)===nW(x.wn));
    if(db.pb.some(z=>z.id===x.id))return Object.assign(r,{resultado:'ja_existia'});
    if(db.pb.some(z=>nW(z.wn)===nW(x.wn)&&z.atividade===a.atividade))return Object.assign(r,{resultado:'wn_repetido',detalhe:'A onda '+x.wn+' já foi embalada na '+(a.atividade==='maquina'?'Máquina':'Mesa')});
    const dia=new Date(Date.parse(x.bipada_em)-3*36e5).toISOString().slice(0,10);
    db.pb.push({id:x.id,wn:x.wn,pessoa_id:o.id,andar:a.andar,atividade:a.atividade,turno_id:a.turno_id,bipada_em:x.bipada_em,dia,quantidade:ehQ?x.quantidade:1,origem:ehQ?'quantidade':'bipagem'});
    if(!db.pp.some(z=>z.pessoa_id===o.id&&z.dia===dia)){db.pp.push({pessoa_id:o.id,dia,primeira_id:x.id});r.presenca_nova=true}return r}))}
  if(t==='rpc/bipador_acessos'){const o=db.gestores.find(x=>x.email===body.p_email&&x.perfil==='bipador');if(!o)return J(route,400,{code:'23503',message:'Bipador não encontrado'});if(!(g&&(g.admin||o.responsavel===g.email)))return J(route,403,{code:'42501',message:'Só o administrador ou o gestor responsável muda os acessos'});o.abas=body.p_abas.slice().sort();return J(route,200,'ok')}
  if(t==='rpc/metas_individuais_coleta'){if(!(g&&(g.admin||g.pode_metas!==false)))return J(route,403,{code:'42501',message:'Sem permissão para alterar metas. Peça ao administrador para liberar "Pode alterar metas".'});let n=0;db.operadores.forEach(o=>{if(body.p_ids.includes(o.id)&&!o.excluido_em){if(body.p_mudar_ondas)o.meta_ind_ondas=body.p_ondas;if(body.p_mudar_unidades)o.meta_ind_qtd=body.p_unidades;n++}});return J(route,200,n)}
  if(t==='rpc/metas_individuais_embalagem'){let n=0;(db.ppes||[]).forEach(o=>{if(body.p_ids.includes(o.id)){o.meta_dia=body.p_meta_dia;n++}});return J(route,200,n)}
  if(t==='rpc/prod_semana'){if(!(g&&(g.admin||g.pode_semana!==false)))return J(route,403,{code:'42501',message:'Sem permissão para ver a semana da equipe. Peça ao administrador para liberar "Pode ver a semana da equipe".'});return J(route,200,(db.semEmb||[]))}
  if(t==='rpc/uso_banco'){if(!(g&&g.admin))return J(route,403,{code:'42501',message:'Sem permissão'});return J(route,200,{banco_bytes:18*1048576,ondas:db.ondas.length,ondas_bytes:9*1048576,auditoria_bytes:320000,limite_bytes:500*1048576})}
  if(t==='rpc/ausencias_publicas'){return J(route,200,(db.aus||[]).filter(a=>new Date(Date.parse(a.inicio)-3*36e5).toISOString().slice(0,10)===body.p_dia))}
  if(t==='rpc/registrar_ausencia'){const op=db.operadores.find(o=>o.id===body.p_operador&&!o.excluido_em);if(!op)return J(route,400,{code:'23503',message:'Pessoa não encontrada'});
   const ms=db.config[0].motivos_ausencia||['Ajudando na Rua','Embalando'];if(!ms.includes(body.p_motivo))return J(route,400,{code:'23514',message:'Motivo de ausência inválido'});
   db.aus=db.aus||[];if(!db.aus.some(a=>a.id===body.p_id))db.aus.push({id:body.p_id,operador_id:op.id,galpao_id:op.galpao_id,motivo:body.p_motivo,inicio:body.p_inicio,fim:body.p_fim||null});return J(route,200,'ok')}
  if(t==='rpc/encerrar_ausencia'){const a=(db.aus||[]).find(x=>x.id===body.p_id);if(!a)return J(route,400,{code:'23503',message:'Ausência não encontrada'});if(!a.fim)a.fim=body.p_fim;return J(route,200,'ok')}
  if(t==='ausencias'&&m==='GET'){if(!g)return J(route,200,[]);return J(route,200,(db.aus||[]).filter(a=>escopo(a.galpao_id)))}
  if(t==='ausencias'&&m==='DELETE'){const a=(db.aus||[]).find(x=>x.id===eq('id'));if(!a||!(g&&g.pode_registros&&escopo(a.galpao_id)))return J(route,200,[]);db.aus=db.aus.filter(x=>x!==a);return J(route,200,[a])}
  if(t==='rpc/registrar_acesso'){if(g){db.aud=db.aud||[];db.aud.push({id:db.aud.length+1,em:new Date().toISOString(),email:g.email,nome:g.nome,galpao_id:g.galpao_id,acao:body.p_acao,tabela:null,registro:null,antes:null,depois:null})}return J(route,204,null)}
  if(t==='rpc/auditoria_listar'){if(!(g&&g.admin))return J(route,403,{code:'42501',message:'Só o administrador vê a auditoria'});return J(route,200,(db.aud||[]).slice().reverse())}
  if(t==='rpc/operador_proximo_codigo'){if(!g)return J(route,403,{code:'42501',message:'Entre como gestor'});return J(route,200,proxCod(db))}
  if(t==='rpc/ondas_removidas'){db.calls.rem=(db.calls.rem||0)+1;return J(route,200,(body.p_ids||[]).filter(i=>!db.ondas.some(x=>x.id===i)))}
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
   if(t==='gestores')return J(route,200,!g?[]:g.admin?db.gestores:[g].concat(db.gestores.filter(x=>x.responsavel===g.email)));
   if(t==='presenca_registros'){if(!email)return J(route,401,{message:'permission denied',code:'42501'});return J(route,200,(db.presenca||[]).filter(r=>!r.cancelado_em&&escopo(db.operadores.find(o=>o.id===r.operador_id).galpao_id)))}
   if(/^presenca_(baixas|atrasos|historico|alteracoes)$/.test(t))return J(route,200,[]);
   if(t==='ondas'){if(!email)return J(route,401,{message:'permission denied for table ondas',code:'42501'});
    const RG=q.getAll('registrada_em'),de=((RG.find(x=>x.startsWith('gte.'))||'gte.').slice(4)),ate=(RG.find(x=>x.startsWith('lt.'))||'').slice(3),orq=q.get('or'),au=q.get('atualizado_em'),off=+q.get('offset')||0,lim=+q.get('limit')||1000;db.calls.ondas=db.calls.ondas||{full:0,delta:0,dias:0};
    const orDe=orq?decodeURIComponent((/registrada_em\.gte\.([^,)]+)/.exec(orq)||[])[1]||''):null;if(off===0&&(au||RG.length||orq))db.calls.ondas[au?'delta':ate?'dias':'full']=(db.calls.ondas[au?'delta':ate?'dias':'full']||0)+1;
    const ua=o=>o.atualizado_em||o.registrada_em;
    return J(route,200,db.ondas.filter(o=>escopo(o.galpao_id)&&(orq?(o.registrada_em>=orDe||o.status!==0):o.registrada_em>=de)&&(!ate||o.registrada_em<ate)&&(!au||ua(o)>=au.slice(4))).map(o=>Object.assign({atualizado_em:ua(o)},o)).sort((a,b)=>a.registrada_em<b.registrada_em?-1:1).slice(off,off+lim))}
   if(t==='ondas_excluidas'){if(!email)return J(route,401,{message:'permission denied',code:'42501'});return J(route,200,(db.excl||[]).filter(x=>x.excluida_em>=(q.get('excluida_em')||'gte.').slice(4)))}}
  const podeC=gal=>g&&g.pode_config&&(g.admin||g.galpao_id===gal);
  if(t==='operadores'&&m==='POST'&&(body.inicio==null||body.fim==null))return J(route,400,{code:'23502',message:'null value in column "inicio" of relation "operadores" violates not-null constraint'});
  if(t==='operadores'&&m==='POST'){if(!podeC(body.galpao_id))return J(route,403,{code:'42501',message:'new row violates row-level security policy'});
   if(db.operadores.some(o=>!o.excluido_em&&o.nome.toLowerCase()===body.nome.toLowerCase()))return J(route,409,{code:'23505',message:'duplicate key value'});
   if(!body.codigo||db.operadores.some(o=>!o.excluido_em&&o.codigo===body.codigo))body.codigo=proxCod(db);
   const row=Object.assign({id:'00000000-0000-4000-8000-'+String(db.seq++).padStart(12,'0'),excluido_em:null},body);db.operadores.push(row);return J(route,201,[row])}
  if(t==='presenca_registros'&&m==='POST'){const op=db.operadores.find(o=>o.id===body.operador_id);if(!op||!(g&&g.pode_registros&&(g.admin||g.galpao_id===op.galpao_id)))return J(route,403,{code:'42501',message:'new row violates row-level security policy'});
   const row=Object.assign({id:'pr'+db.seq++,horario_ini:null,horario_fim:null,observacao:null,criado_por:email,cancelado_em:null},body);(db.presenca=db.presenca||[]).push(row);return J(route,201,[row])}
  if(t==='presenca_registros'&&m==='PATCH'){const r=(db.presenca||[]).find(x=>x.id===eq('id')),op=r&&db.operadores.find(o=>o.id===r.operador_id);if(!r||!(g&&g.pode_registros&&(g.admin||g.galpao_id===op.galpao_id)))return J(route,200,[]);Object.assign(r,body);return J(route,200,[r])}
  if(t==='operadores'&&m==='PATCH'&&!eq('id')){const L=db.operadores.filter(o=>o.galpao_id===eq('galpao_id')&&String(o.turno)===eq('turno')&&String(o.inicio)===eq('inicio')&&String(o.fim)===eq('fim')&&!o.excluido_em&&podeC(o.galpao_id));L.forEach(o=>Object.assign(o,body));return J(route,200,L)}
  if(t==='operadores'&&m==='PATCH'){const o=db.operadores.find(x=>x.id===eq('id'));if(!o||!podeC(o.galpao_id))return J(route,200,[]);if(body.nome!==undefined&&g&&!g.admin&&g.pode_pessoas===false)return J(route,403,{code:'42501',message:'Sem permissão para editar pessoas. Peça ao administrador para liberar "Pode cadastrar e editar pessoas".'});if(body.nome!==undefined&&db.operadores.some(x=>x!==o&&!x.excluido_em&&x.nome.toLowerCase()===String(body.nome).toLowerCase()))return J(route,409,{code:'23505',message:'duplicate key value violates unique constraint "operadores_nome_ativo_uq"'});Object.assign(o,body);return J(route,200,[o])}
  if(t==='galpoes'&&m==='POST'){if(!(g&&g.admin))return J(route,403,{code:'42501',message:'rls'});const row=Object.assign({id:'00000000-0000-4000-8000-'+String(db.seq++).padStart(12,'0')},body);db.galpoes.push(row);return J(route,201,[row])}
  if(t==='galpoes'&&m==='PATCH'){const o=db.galpoes.find(x=>x.id===eq('id'));if(!o||!(g&&(g.admin||(g.pode_config&&g.galpao_id===o.id))))return J(route,200,[]);Object.assign(o,body);return J(route,200,[o])}
  if(t==='galpoes'&&m==='DELETE'){const o=db.galpoes.find(x=>x.id===eq('id'));if(!o||!(g&&g.admin))return J(route,200,[]);
   if(db.operadores.some(x=>x.galpao_id===o.id)||db.ondas.some(x=>x.galpao_id===o.id))return J(route,409,{code:'23503',message:'violates foreign key constraint'});db.galpoes=db.galpoes.filter(x=>x!==o);return J(route,200,[o])}
  if(t==='tipos_onda'&&m==='PATCH'){const o=db.tipos.find(x=>x.nome===eq('nome'));if(!o||!(g&&g.admin))return J(route,200,[]);Object.assign(o,body);return J(route,200,[o])}
  if(t==='config'&&m==='PATCH'){if(!(g&&g.admin))return J(route,200,[]);Object.assign(db.config[0],body);return J(route,200,db.config)}
  if(t==='gestores'&&m==='POST'){if(!(g&&g.admin))return J(route,403,{code:'42501',message:'rls'});if(db.gestores.some(x=>x.email===body.email))return J(route,409,{code:'23505',message:'dup'});db.gestores.push(body);return J(route,201,[body])}
  if(t==='gestores'&&m==='PATCH'){const o=db.gestores.find(x=>x.email===eq('email'));if(!o||!(g&&g.admin))return J(route,403,{code:'42501',message:'rls'});Object.assign(o,body);return J(route,200,[o])}
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
   Object.assign(o,{status:1,concluida_em:null,procura_sku:body.p_sku,procura_itens:body.p_itens||[],procura_marcas:body.p_marcas||[],procura_local:body.p_local,procura_nome:op?op.nome:'',procura_em:new Date().toISOString()});
   return J(route,200,{id:o.id,wn:o.wn,tipo:o.tipo,quantidade:o.quantidade,galpao_id:o.galpao_id,operador_id:o.operador_id,registrada_em:o.registrada_em,procura_em:o.procura_em,procura_nome:o.procura_nome,procura_hist:o.procura_hist,procura_itens:o.procura_itens,procura_marcas:o.procura_marcas})}
  if(t==='rpc/encontrar_procurando'&&m==='POST'){const o=db.ondas.find(x=>x.wn===body.p_wn&&x.status===1);if(o){o.status=0;o.concluida_em=new Date().toISOString();o.procura_hist.push(body.p_quem?{e:'a',q:body.p_quem,t:new Date().toISOString()}:{e:'a',t:new Date().toISOString()})}return J(route,200,!!o)}
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
async function page(b,db,opts={}){const ctx=await b.newContext({viewport:opts.vp||{width:1366,height:900}});const p=await ctx.newPage();if(!opts.festa)await p.addInitScript(()=>{window.__semFesta=1});if(!opts.sidebarSubs)await p.addInitScript(()=>{document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent='#sub,#gsub,#psub,#hsub{display:flex!important}';document.head.appendChild(s)})});
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
function proxCod(db){for(let i=1;i<10000;i++){const c='CL'+String(i).padStart(i<1000?3:4,'0');if(!db.operadores.some(o=>!o.excluido_em&&o.codigo===c))return c}}
async function T(name,fn){if(process.env.ONLY&&!process.env.ONLY.split(",").some(k=>name.startsWith(k+" ")))return;const t0=Date.now();try{const i=await fn();R.push(['PASS',name,(i||'')+` (${Date.now()-t0}ms)`])}catch(e){R.push(['FALHA',name,e.message.split('\n')[0]])}}
(async()=>{const b=await chromium.launch();

await T('S116 Gestor de um galpão não vê o nome de outro galpão em nenhuma aba',async()=>{const db=banco();const p=await page(b,db);await login(p,'g2@x.com','senha1234');
 const achados=new Set();
 const varrer=async onde=>{const r=await p.evaluate(()=>{const vis=e=>{const s=getComputedStyle(e);if(s.display==='none'||s.visibility==='hidden')return false;const r=e.getBoundingClientRect();return r.width>0&&r.height>0};
   const out=[];document.querySelectorAll('details').forEach(d=>d.open=true);
   document.querySelectorAll('body *').forEach(e=>{if(!vis(e))return;if(e.tagName==='SELECT'){[...e.options].forEach(o=>{if(o.textContent.includes('Galpão 1'))out.push('select#'+e.id+' opção "'+o.textContent.trim()+'"')});return}
    for(const n of e.childNodes)if(n.nodeType===3&&n.textContent.includes('Galpão 1'))out.push((e.id?'#'+e.id:e.tagName+'.'+e.className)+' "'+n.textContent.trim().slice(0,60)+'"')});return out});
  r.forEach(x=>achados.add(onde+': '+x))};
 const tabs=await p.$$eval('.tab[data-t]',x=>x.filter(e=>e.offsetParent).map(e=>e.dataset.t));
 for(const t of tabs){await p.evaluate(t=>go(t),t);await p.waitForTimeout(250);await varrer(t);
  const subs=await p.$$eval('#gsub [data-gs],#csub [data-c],.ssub button[data-s],.ssub button[data-h]',x=>x.filter(e=>e.offsetParent||e.closest('#csub')).map(e=>e.closest('#gsub')?'#gsub [data-gs="'+e.dataset.gs+'"]':e.closest('#csub')?'#csub [data-c="'+e.dataset.c+'"]':null).filter(Boolean));
  for(const s of subs){await p.evaluate(s=>{const e=document.querySelector(s);if(e)e.click()},s);await p.waitForTimeout(200);await varrer(t+' '+s)}}
 ok(!achados.size,[...achados].slice(0,30).join(' | '));ok(!p.errors.length,p.errors.join(';'))});

await T('S117 Aparelho de um gestor mostra só o galpão dele, mesmo depois de sair; administrador libera',async()=>{const db=banco();const p=await page(b,db);
 const opts=()=>p.$eval('#gal',e=>({o:[...e.options].map(x=>x.textContent).join(','),d:e.disabled,v:e.value}));
 let r=await opts();ok(r.o.includes('Galpão 1')&&r.o.includes('Galpão 2'),'antes: '+JSON.stringify(r));
 await login(p,'g2@x.com','senha1234');r=await opts();ok(r.o==='Galpão 2'&&r.d,'logado: '+JSON.stringify(r));
 await p.evaluate(()=>sair());await p.waitForTimeout(500);r=await opts();ok(r.o==='Galpão 2'&&r.d&&r.v==='Galpão 2','depois de sair: '+JSON.stringify(r));
 await p.reload();await p.waitForTimeout(600);r=await opts();ok(r.o==='Galpão 2'&&r.d,'recarregou: '+JSON.stringify(r));
 ok(!(await p.evaluate(()=>S.ops.filter(o=>inView({gal:o.g})).map(o=>o.g))).includes('Galpão 1'),'pessoas do outro galpão');
 await login(p,'adm@x.com','senha1234');await p.evaluate(()=>sair());await p.waitForTimeout(500);r=await opts();ok(r.o.includes('Galpão 1')&&!r.d,'administrador liberou: '+JSON.stringify(r));
 ok(!p.errors.length,p.errors.join(';'))});

await T('S01 Público: carrega cadastros do banco e abre na Coleta (Painel só com login)',async()=>{const db=banco();const p=await page(b,db);
 const r=await p.evaluate(()=>({ops:S.ops.map(o=>o.m).join(),gals:S.gals.join(),view,temId:!!S.ops[0].id}));
 ok(r.ops==='CL001,CL002'&&r.gals==='Galpão 1,Galpão 2'&&r.view==='op'&&r.temId,JSON.stringify(r));ok(p.errors.length===0,p.errors.join(';'))});

await T('S02 Público: Painel e gestão só com login',async()=>{const db=banco(),agora=new Date().toISOString();db.ondas.push({id:'a',wn:'123',operador_id:db.operadores[0].id,galpao_id:G1,tipo:'Vários artigos',quantidade:31,status:0,registrada_em:agora,concluida_em:agora});const p=await page(b,db);
 await p.waitForTimeout(400);ok(await p.isHidden('#login'),'pediu login ao abrir');ok((await p.evaluate(()=>S.waves.filter(w=>w.srv).length))===1,'modo público deveria trazer as ondas do dia para a Coleta');
 for(const t of['painel','ind','cfg']){ok(await p.isHidden(`.tab[data-t="${t}"]`),t+' fica oculta sem login')}
 await p.evaluate(()=>go('painel'));ok((await p.evaluate(()=>view))==='op','abriu o painel sem login')});

await T('S03 Público registra 3 ondas e elas chegam ao banco',async()=>{const db=banco();const p=await page(b,db);await reg(p,'CL001','Pacote do mesmo',[[5001,10],[5002,20],[5003,30]]);
 ok(db.ondas.length===3,'banco tem '+db.ondas.length);ok(db.ondas.every(o=>o.galpao_id===G1&&/^[0-9a-f-]{36}$/.test(o.id)),'galpão/id errado');
 const s=await p.evaluate(()=>S.waves.map(w=>w.sync+':'+(w.err||'')).join());ok(s==='1:,1:,1:','local: '+s);return (await p.textContent('#net')).trim()});

await T('S04 Sem internet: guarda na fila e envia quando volta, sem duplicar',async()=>{const db=banco();const p=await page(b,db);await p.evaluate(()=>$('#net').click());
 await reg(p,'CL001','Pacote do mesmo',[[6001,5],[6002,6]]);ok(db.ondas.length===0,'enviou offline');ok(/2 pendentes/.test(await p.textContent('#net')),'indicador: '+await p.textContent('#net'));
 await p.reload();await p.waitForTimeout(500);ok((await p.evaluate(()=>S.waves.filter(w=>!w.sync).length))===2,'fila perdida ao recarregar');
 await p.evaluate(()=>$('#net').click());await p.waitForTimeout(600);ok(db.ondas.length===2,'banco tem '+db.ondas.length);
 await p.evaluate(()=>{S.waves.forEach(w=>w.sync=0);return push()});await p.waitForTimeout(300);ok(db.ondas.length===2,'duplicou no reenvio: '+db.ondas.length);
 ok((await p.evaluate(()=>S.waves.filter(w=>!w.sync||w.err).length))===0,'ficou pendente ou com erro após reenvio')});

await T('S05 Servidor fora do ar: nada se perde e reenvia depois',async()=>{const db=banco();const p=await page(b,db);db.down=true;
 await reg(p,'CL001','Vários artigos',[[6101,7]]);ok(db.ondas.length===0,'?');ok((await p.evaluate(()=>S.waves.filter(w=>!w.sync).length))===1,'saiu da fila sem enviar');
 db.down=false;await p.evaluate(()=>push());await p.waitForTimeout(300);ok(db.ondas.length===1,'não reenviou')});

await T('S06 WN que já existe no banco (de outro aparelho) vira "recusada" e não conta',async()=>{const db=banco();
 const p=await page(b,db);db.ondas.push({id:'x1',wn:'07001',operador_id:db.operadores[1].id,galpao_id:G2,tipo:'Vários artigos',quantidade:9,status:0,registrada_em:new Date().toISOString(),concluida_em:new Date().toISOString()});
 await reg(p,'CL001','Pacote do mesmo',[[7001,10],[7002,11]]);ok(db.ondas.length===2,'banco tem '+db.ondas.length);
 const r=await p.evaluate(()=>({err:S.waves.filter(w=>w.err).map(w=>w.wn+':'+w.err).join(),prod:prod(S.waves).reduce((a,w)=>a+w.qty,0),txt:document.querySelector('#last').textContent}));
 ok(/^7001:A onda 7001 já foi registrada$/.test(r.err),'err: '+r.err);ok(r.prod===11,'produção local '+r.prod);ok(/recusada/.test(r.txt),'lista não mostra recusada');
 await p.click('#last [data-del]');await p.waitForTimeout(150);ok((await p.evaluate(()=>S.waves.length))===1,'não removeu a recusada')});

await T('S07 Senha errada, e-mail sem confirmação e e-mail que não é gestor não entram',async()=>{const db=banco();const p=await page(b,db);
 await login(p,'adm@x.com','errada');ok(!(await p.isHidden('#login')),'entrou com senha errada');ok(/incorretos/.test(await p.textContent('#toast')),await p.textContent('#toast'));
 await p.fill('#lU','novo@x.com');await p.fill('#lP','senha1234');await p.click('#lB');await p.waitForTimeout(400);ok(/E-mail não confirmado/.test(await p.textContent('#toast')),await p.textContent('#toast'));
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
 await p.click('.tab[data-t="cfg"]');await p.click('[data-c="cus"]');await abrirAdd(p);await p.fill('#uN','Diego Rocha');await p.click('#uB');await p.waitForTimeout(1000);
 ok(db.operadores.some(o=>o.nome==='Diego Rocha'&&o.codigo==='CL003'),'não criou CL003: '+JSON.stringify(db.operadores.map(o=>o.codigo+o.nome)));
 ok(await p.isHidden('[data-udel="CL001"]'),'lista deveria começar recolhida');await p.fill('#uQ','ana');await p.waitForTimeout(150);
 await p.click('[data-udel="CL001"]');await p.waitForTimeout(500);ok(db.operadores.find(o=>o.nome==='Ana Souza').excluido_em,'não excluiu');
 await abrirAdd(p);await p.fill('#uN','Eva Lima');await p.click('#uB');await p.waitForTimeout(1000);ok(db.operadores.some(o=>o.nome==='Eva Lima'&&o.codigo==='CL001'),'código CL001 não foi reaproveitado');
 ok(p.errors.length===0,p.errors.join(';'))});

await T('S11 Gestor comum: não altera limites nem cria operador em outro galpão',async()=>{const db=banco();const p=await page(b,db);await login(p,'g2@x.com','senha1234');
 await p.click('.tab[data-t="cfg"]');await p.fill('[data-lim="Retrabalho"]','5');await p.press('[data-lim="Retrabalho"]','Tab');await p.waitForTimeout(450);
 ok(db.tipos.find(t=>t.nome==='Retrabalho').limite===1000,'alterou limite');ok(/Sem permissão/.test(await p.textContent('#toast')),await p.textContent('#toast'));
 ok((await p.$eval('[data-lim="Retrabalho"]',e=>e.value))==='1000','campo ficou com valor que não foi salvo');
 await p.click('[data-c="cus"]');await p.evaluate(()=>{const o=document.querySelector('#uG');o.innerHTML='<option>Galpão 1</option>';o.value='Galpão 1'});await abrirAdd(p);await p.fill('#uN','Fulano G1');await p.click('#uB');await p.waitForTimeout(450);
 ok(!db.operadores.some(o=>o.nome==='Fulano G1'),'criou em outro galpão')});

await T('S18 Admin libera pedido de acesso: aparece em Pedidos, aceita com galpão e o gestor passa a entrar',async()=>{const db=banco();db.pedidos.push('fora@x.com');db.users['fora@x.com'].ok=true;const p=await page(b,db);await login(p,'adm@x.com','senha1234');await p.click('.tab[data-t="cfg"]');
 await p.click('[data-c="cge"]');await p.waitForTimeout(500);const visto=(await p.textContent('#pedL')).includes('fora@x.com');
await abrirAdd(p);await p.fill('#mN','Fora Gestora');await p.click('[data-sacc="fora@x.com"]');await p.waitForTimeout(600);
 const criado=db.gestores.find(x=>x.email==='fora@x.com');const sumiu=!db.pedidos.includes('fora@x.com');
 ok(visto&&criado&&criado.galpao_id===G1&&criado.nome==='Fora Gestora'&&sumiu,'visto '+visto+', criado '+!!criado+', pedido apagado '+sumiu);});
await T('S19 Abas: sem login aparecem Coleta e Produção, sem Painel; com login, as abas do perfil',async()=>{const db=banco();const p=await page(b,db);
 const vis=async t=>p.isVisible('.tab[data-t="'+t+'"]');
 const sem=[await vis('op'),await vis('painel'),await vis('ind'),await vis('cfg')];
 await login(p,'g2@x.com','senha1234');await p.waitForTimeout(300);
 const com=[await vis('op'),await vis('painel'),await vis('ind'),await vis('cfg')];
 ok(sem.join()==='true,false,false,false'&&com.join()==='true,true,true,true','sem login '+sem+' | gestor '+com);});
await T('S20 Manutenção: só o administrador vê; apaga o período escolhido depois de confirmar',async()=>{const db=banco();
 db.ondas.push({id:'m1',wn:'M1',operador_id:db.operadores[0].id,galpao_id:G1,tipo:'Vários artigos',quantidade:5,status:0,registrada_em:'2026-11-05T12:00:00-03:00',concluida_em:'2026-11-05T12:05:00-03:00',encerrada_auto:false});
 db.ondas.push({id:'m2',wn:'M2',operador_id:db.operadores[0].id,galpao_id:G1,tipo:'Vários artigos',quantidade:5,status:0,registrada_em:'2026-11-20T12:00:00-03:00',concluida_em:'2026-11-20T12:05:00-03:00',encerrada_auto:false});
 const pg=await page(b,db);await login(pg,'g2@x.com','senha1234');await pg.waitForTimeout(300);
 const gestorVe=await pg.isVisible('#cfgNav [data-c="cma"]');
 const p=await page(b,db);await login(p,'adm@x.com','senha1234');await p.click('.tab[data-t="cfg"]');
 const admVe=await p.isVisible('#cfgNav [data-c="cma"]');
 await p.click('[data-c="cma"]');await p.fill('#xDe','2026-11-01');await p.fill('#xAte','2026-11-10');await p.click('#xCont');await p.waitForTimeout(400);
 const contou=(await p.textContent('#xRes')).includes('1 registro');
 const travado=await p.isDisabled('#xDel');
 await p.fill('#xCon','APAGAR');await p.click('#xDel');await p.waitForTimeout(700);
 ok(!gestorVe&&admVe&&contou&&travado&&db.ondas.length===1&&db.ondas[0].id==='m2','gestor '+gestorVe+', admin '+admVe+', contou '+contou+', travado '+travado+', restam '+db.ondas.length)});
await T('S21 Administrador cria gestor com senha e ele entra direto, sem pedido',async()=>{const db=banco();
 const pa=await page(b,db);await login(pa,'adm@x.com','senha1234');await pa.click('.tab[data-t="cfg"]');await pa.click('[data-c="cge"]');await pa.waitForTimeout(300);
 ok(await pa.isHidden('#pedCard'),'cartão de pedidos deveria sumir');
 await abrirAdd(pa);await pa.fill('#mN','Nova Pessoa');await pa.fill('#mU','nova@x.com');await pa.selectOption('#mG','Galpão 2');await pa.click('#mB');await pa.waitForTimeout(300);
 ok(!db.gestores.some(x=>x.email==='nova@x.com'),'criou sem senha');
 await pa.fill('#mP2','senha123');await pa.click('#mB');await pa.waitForTimeout(600);
 const g=db.gestores.find(x=>x.email==='nova@x.com');ok(g&&g.nome==='Nova Pessoa'&&g.galpao_id===G2&&db.users['nova@x.com'].pw==='senha123','gestor: '+JSON.stringify(g));
 await pa.click('[data-msen="nova@x.com"]');await pa.fill('#mSenP','outrasenha9');await pa.click('#mSenOk');await pa.waitForTimeout(500);ok(db.users['nova@x.com'].pw==='outrasenha9','troca de senha');
 const pn=await page(b,db);await pn.click('#logbtn');ok(await pn.isHidden('#lNew'),'Primeiro acesso deveria sumir');await pn.fill('#lU','nova@x.com');await pn.fill('#lP','outrasenha9');await pn.click('#lB');await pn.waitForTimeout(700);
 ok(await pn.evaluate(()=>!!me&&me.u==='nova@x.com'),'gestor não entrou');ok(pa.errors.length===0&&pn.errors.length===0,pa.errors.concat(pn.errors).join(';'))});
await T('S12 Admin: galpão, meta, limite, turno e gestor gravam no banco',async()=>{const db=banco();const p=await page(b,db);await login(p,'adm@x.com','senha1234');await p.click('.tab[data-t="cfg"]');
 await p.fill('[data-lim="Itens Únicos"]','250');await p.press('[data-lim="Itens Únicos"]','Tab');await p.waitForTimeout(400);
 await p.click('[data-c="cho"]');await p.waitForTimeout(150);await p.click('[data-hgal="Galpão 1"]');await p.fill('form[data-hr="1"] [data-hk="fim"]','17:00');await p.click('form[data-hr="1"] [type="submit"]');await p.waitForTimeout(450);
 await p.click('[data-c="cga"]');await abrirAdd(p);await p.fill('#gN','Galpão Norte');await p.click('#gB');await p.waitForTimeout(450);
 await p.click('[data-c="cme"]');await p.fill('[data-gmeta="Galpão 2"]','3000');await p.press('[data-gmeta="Galpão 2"]','Tab');await p.waitForTimeout(450);
 await p.fill('#fmin','500');await p.press('#fmin','Tab');await p.waitForTimeout(450);const mmin=db.config[0].meta_minima;
 await p.click('[data-c="cga"]');await p.click('[data-gdel="0"]');await p.waitForTimeout(450);const tg=await p.textContent('#toast');
 await p.click('[data-c="cge"]');await abrirAdd(p);await p.fill('#mN','Nova Gestora');await p.fill('#mU','Nova@X.com');await p.fill('#mP2','senha1234');await p.click('#mB');await p.waitForTimeout(450);
 ok(mmin===500,'meta mínima '+mmin);ok(db.tipos.find(t=>t.nome==='Itens Únicos').limite===250,'limite');ok(db.galpoes.find(x=>x.id===G1).horarios[1].fim===17,'turno do galpão: '+JSON.stringify(db.galpoes.find(x=>x.id===G1).horarios));
 ok(db.galpoes.some(g=>g.nome==='Galpão Norte'),'galpão novo');ok(db.metas.some(m=>m.galpao_id===G2&&m.data===HJ&&m.meta===3000),'meta do dia salva');
 ok(db.galpoes.some(g=>g.id===G1)&&/não dá para excluir/.test(tg),'excluiu galpão com operadores: '+tg);
 ok(db.gestores.some(g=>g.email==='nova@x.com'&&!g.admin&&g.galpao_id),'gestor: '+JSON.stringify(db.gestores.slice(-1)));
 ok(await p.isVisible('#mP2'),'campo de senha do gestor deveria aparecer');ok(p.errors.length===0,p.errors.join(';'))});

await T('S13 Gestor exclui onda do banco; ondas somem do Painel',async()=>{const db=banco();const agora=new Date().toISOString();
 db.ondas.push({id:'00000000-0000-4000-8000-0000000000d1',wn:'1',operador_id:db.operadores[1].id,galpao_id:G2,tipo:'Retrabalho',quantidade:7,status:1,registrada_em:agora,concluida_em:null});
 const p=await page(b,db);await login(p,'g2@x.com','senha1234');await p.click('.tab[data-t="op"]');await p.click('[data-s="ctl"]');await p.waitForTimeout(150);
 await p.click('#ctlList [data-fin]');await p.waitForTimeout(450);ok(db.ondas[0].status===0&&db.ondas[0].concluida_em,'não concluiu no banco');
 await p.evaluate(()=>go('painel'));ok((await num(p)).trim()==='7','painel '+await num(p))});

await T('S14 Sem Primeiro acesso; Esqueci a senha chama o serviço certo',async()=>{const db=banco();const p=await page(b,db);await p.click('#logbtn');
 ok(await p.isHidden('#lNew'),'Primeiro acesso deveria sumir');await p.fill('#lU','gestora@x.com');
 await p.click('#lRec');await p.waitForTimeout(300);ok(/enviamos um link/.test(await p.textContent('#toast')),await p.textContent('#toast'))});
await T('S15 Dados antigos do aparelho: admin envia para o banco sem criar galpão nem pessoa, e repetir não duplica',async()=>{const db=banco();const t=Date.now()-36e5;
 const antigo={gals:['Galpão 1','Galpão Sul'],metas:{'Galpão Sul':900},ops:[{m:'CL001',n:'Ana Souza',t:1,g:'Galpão 1'},{m:'CL002',n:'Zeca Antigo',t:2,g:'Galpão Sul'}],
  waves:[{id:'w1',wn:'8001',op:'CL001',opn:'Ana Souza',gal:'Galpão 1',ty:'Vários',qty:10,st:0,ts:t,fin:t},{id:'w2',wn:'8002',op:'CL002',opn:'Zeca Antigo',gal:'Galpão Sul',ty:'Itens Únicos',qty:5,st:0,ts:t,fin:t},{id:'w3',wn:'8003',op:'CL009~x',opn:'Sumiu',gal:'Galpão 1',ty:'Vários artigos',qty:1,st:0,ts:t,fin:t}]};
 const p=await page(b,db,{antigo});await login(p,'adm@x.com','senha1234');await p.click('.tab[data-t="cfg"]');await p.waitForTimeout(150);
 await p.click('#impB');await p.waitForTimeout(1500);const t1=await p.textContent('#toast');
 ok(!db.galpoes.some(g=>g.nome==='Galpão Sul')&&!db.operadores.some(o=>o.nome==='Zeca Antigo'),'criou galpão ou pessoa a partir de dados do aparelho');
 ok(db.ondas.length===1&&db.ondas.some(o=>o.wn==='8001'&&o.tipo==='Vários artigos'),'ondas: '+JSON.stringify(db.ondas.map(o=>o.wn+o.tipo)));ok(/1 no banco/.test(t1)&&/2 sem pessoa/.test(t1),'resumo: '+t1);
 await p.click('#impB');await p.waitForTimeout(1500);ok(db.ondas.length===1&&db.operadores.length===2,'duplicou ao repetir');
 ok((await p.evaluate(()=>!!localStorage.getItem('rcondas.v2'))),'apagou os dados antigos do aparelho');return t1});

await T('S16 Lote grande: 250 ondas offline sobem em 3 envios',async()=>{const db=banco();const p=await page(b,db);
 await p.evaluate(()=>{S.off=true;const o=S.ops[0];for(let i=0;i<250;i++)S.waves.push({id:crypto.randomUUID(),oid:o.id,wn:String(90000+i),op:o.m,opn:o.n,gal:o.g,ty:'Vários artigos',qty:1+i%9,st:0,ts:Date.now(),fin:Date.now(),sync:0});save();S.off=false;return push()});
 await p.waitForTimeout(500);ok(db.ondas.length===250&&db.calls.rpc===3,'ondas '+db.ondas.length+' em '+db.calls.rpc+' envios');
 ok((await p.evaluate(()=>S.waves.every(w=>w.sync&&!w.err))),'sobrou pendente')});

await T('S17 Celular: registro público funciona e não há erro de JavaScript',async()=>{const db=banco();const p=await page(b,db,{vp:{width:390,height:844}});
 await reg(p,'CL002','Pacote do mesmo',[[9501,4]]);ok(db.ondas.length===1&&db.ondas[0].galpao_id===G2,'não chegou');ok(p.errors.length===0,p.errors.join(';'));
 ok((await p.evaluate(()=>document.documentElement.scrollWidth))<=392,'rolagem lateral')});


await T('S101 Gestor de um galpão só encontra e registra pessoas do seu galpão; aparelho público vê todos',async()=>{const db=banco();
 const p0=await page(b,db);await p0.evaluate(()=>go('op'));await p0.fill('#opIn','Ana');await p0.waitForTimeout(200);ok((await p0.$$('#opSug [data-sug]')).length===1,'público deveria ver todos');
 const p=await page(b,db);await login(p,'g2@x.com','senha1234');await p.evaluate(()=>go('op'));await p.waitForTimeout(200);
 await p.fill('#opIn','Ana');await p.waitForTimeout(200);ok((await p.$$('#opSug [data-sug]')).length===0,'gestor do Galpão 2 encontrou pessoa do Galpão 1');
 await p.fill('#opIn','CL001');await p.waitForTimeout(200);ok(!(await p.evaluate(()=>findOp('CL001'))),'código de outro galpão foi aceito');
 await p.fill('#opIn','Carla');await p.waitForTimeout(200);ok((await p.$$('#opSug [data-sug]')).length===1,'não encontrou a pessoa do próprio galpão')});

await T('S102 Registros que ficaram só no aparelho (modo local) vão sozinhos para o banco, sem login e sem criar galpão',async()=>{const db=banco();const nG=db.galpoes.length,t=Date.now()-36e5;
 const antigo={gals:['Galpão 1','Galpão 2','Galpão 3'],ops:[{m:'CL001',n:'ana souza',t:1,g:'Galpão 1'},{m:'CL009',n:'Pessoa Inexistente',t:1,g:'Galpão 1'}],
   waves:[{id:'loc1',wn:'88001',op:'CL001',gal:'Galpão 1',ty:'Vários',qty:12,st:0,ts:t,fin:t+6e4,sync:1},{id:'loc2',wn:'88002',op:'CL009',gal:'Galpão 1',ty:'Vários',qty:5,st:0,ts:t,fin:t+6e4,sync:1},
    {id:'velha',wn:'88003',op:'CL001',gal:'Galpão 1',ty:'Vários',qty:5,st:0,ts:t-40*864e5,fin:t-40*864e5,sync:1}]};
 const p=await page(b,db,{antigo});await p.waitForTimeout(4500);
 const o=db.ondas.filter(w=>/^8800/.test(w.wn));ok(o.length===1&&o[0].wn==='88001'&&o[0].galpao_id===G1,'banco: '+JSON.stringify(o));ok(db.galpoes.length===nG,'criou galpão');
 ok((await p.textContent('#toast')).includes('no banco'),'aviso: '+await p.textContent('#toast'));
 await p.reload();await p.waitForTimeout(4000);ok(db.ondas.filter(w=>/^8800/.test(w.wn)).length===1&&!p.errors.length,'repetiu o envio ou erro '+p.errors.join(';'))});

await T('S103 Aparelho público: escolher o galpão mostra só as pessoas e registros dele e fica guardado no aparelho',async()=>{const db=banco();const t=Date.now()-6e5;
 db.ondas.push({id:'00000000-0000-4000-8000-00000000aa01',wn:'7101',operador_id:db.operadores[0].id,galpao_id:G1,tipo:'Vários artigos',quantidade:5,status:0,registrada_em:new Date(t).toISOString(),concluida_em:new Date(t).toISOString(),procura_hist:[]},
  {id:'00000000-0000-4000-8000-00000000aa02',wn:'7202',operador_id:db.operadores[1].id,galpao_id:G2,tipo:'Vários artigos',quantidade:5,status:0,registrada_em:new Date(t).toISOString(),concluida_em:new Date(t).toISOString(),procura_hist:[]});
 const p=await page(b,db);await p.evaluate(()=>go('op'));await p.waitForTimeout(400);ok(await p.isVisible('#gal'),'seletor de galpão escondido no aparelho público');
 ok((await p.$eval('#gal',e=>e.value))==='__all','começa em todos os galpões');
 await p.selectOption('#gal','Galpão 2');await p.waitForTimeout(200);await p.fill('#opIn','Ana');await p.waitForTimeout(200);ok((await p.$$('#opSug [data-sug]')).length===0,'mostrou pessoa do Galpão 1');
 let L=await p.textContent('#last');ok(L.includes('7202')&&!L.includes('7101'),'últimos registros: '+L.slice(0,200));
 await p.reload();await p.waitForTimeout(900);await p.evaluate(()=>go('op'));await p.waitForTimeout(200);ok((await p.$eval('#gal',e=>e.value))==='Galpão 2','não guardou o galpão no aparelho');
 await p.fill('#opIn','Carla');await p.waitForTimeout(200);ok((await p.$$('#opSug [data-sug]')).length===1,'não achou a pessoa do galpão escolhido')});

await T('S104 Auditoria: entrada e saída do gestor ficam registradas e só o administrador vê a aba',async()=>{const db=banco();
 db.aud=[{id:900,em:new Date(Date.now()-6e4).toISOString(),email:'g2@x.com',nome:'Gestor G2',galpao_id:G2,acao:'alterou',tabela:'operadores',registro:'x',antes:{nome:'Carla Dias',codigo:'CL002'},depois:{nome:'Carla Dias Souza',codigo:'CL002'}}];
 const p=await page(b,db);await login(p,'g2@x.com','senha1234');await p.waitForTimeout(400);ok(db.aud.some(r=>r.acao==='entrou'&&r.email==='g2@x.com'),'não registrou a entrada do gestor');
 await p.evaluate(()=>go('cfg'));await p.waitForTimeout(200);ok(!(await p.isVisible('#cfgNav [data-c="cau"]'))&&!(await p.isVisible('.ssub button:has-text("Auditoria")')),'gestor comum vê a auditoria');
 await p.click('#logbtn');await p.waitForTimeout(600);ok(db.aud.some(r=>r.acao==='saiu'&&r.email==='g2@x.com'),'não registrou a saída');
 await login(p,'adm@x.com','senha1234');await p.evaluate(()=>{go('cfg');document.querySelector('#csub [data-c="cau"]').click()});await p.waitForTimeout(600);
 const t=(await p.textContent('#audBody')).replace(/\s+/g,' ');ok(t.includes('Entrou')&&t.includes('Saiu')&&t.includes('Alterou')&&t.includes('Pessoa da coleta')&&t.includes('Carla Dias Souza')&&t.includes('último acesso'),'auditoria: '+t.slice(0,400));
 await p.fill('#audQ','Carla');await p.waitForTimeout(100);ok((await p.$$('#audBody table tr')).length===2,'busca não filtrou');ok(!p.errors.length,p.errors.join(';'))});

await T('S105 Administrador com G2 escolhido no topo: lista de concluídas do dia mostra só o G2',async()=>{const db=banco();const t=Date.now()-6e5;
 db.ondas.push({id:'00000000-0000-4000-8000-00000000bb01',wn:'7301',operador_id:db.operadores[0].id,galpao_id:G1,tipo:'Vários artigos',quantidade:5,status:0,registrada_em:new Date(t).toISOString(),concluida_em:new Date(t).toISOString(),procura_hist:[]},
  {id:'00000000-0000-4000-8000-00000000bb02',wn:'7402',operador_id:db.operadores[1].id,galpao_id:G2,tipo:'Vários artigos',quantidade:5,status:0,registrada_em:new Date(t).toISOString(),concluida_em:new Date(t).toISOString(),procura_hist:[]});
 const p=await page(b,db);await login(p,'adm@x.com','senha1234');await p.evaluate(()=>go('op'));await p.selectOption('#gal','Galpão 2');await p.waitForTimeout(300);
 const L=await p.textContent('#aceL');ok(L.includes('7402')&&!L.includes('7301'),'concluídas: '+L.replace(/\s+/g,' ').slice(0,200));
 await p.selectOption('#gal','__all');await p.waitForTimeout(200);const T2=await p.textContent('#aceL');ok(T2.includes('7402')&&T2.includes('7301'),'visão geral deveria mostrar os dois')});

await T('S106 Gestor de um galpão cadastra pessoa nova sem repetir código de outro galpão; nome repetido explica o motivo',async()=>{const db=banco();
 const p=await page(b,db);await login(p,'g2@x.com','senha1234');await p.evaluate(()=>{go('cfg');document.querySelector('#csub [data-c="cus"]').click()});await p.waitForTimeout(300);
 await abrirAdd(p);await p.fill('#uN','Pessoa Nova G2');await p.click('#uB');await p.waitForTimeout(600);const o=db.operadores.find(x=>x.nome==='Pessoa Nova G2');
 ok(o&&!db.operadores.some(x=>x!==o&&!x.excluido_em&&x.codigo===o.codigo),'código repetido ou não criou: '+JSON.stringify(o));ok((await p.textContent('#toast')).includes(o&&o.codigo),'aviso com o código errado: '+await p.textContent('#toast'));
 await abrirAdd(p);await p.fill('#uN','Ana Souza');await p.click('#uB');await p.waitForTimeout(500);ok(/outro galpão|Já existe/.test(await p.textContent('#toast'))&&db.operadores.filter(x=>x.nome==='Ana Souza').length===1,'mensagem do nome repetido: '+await p.textContent('#toast'))});

await T('S107 Aparelho do gestor guarda só a semana e as ondas abertas; dia antigo vem do banco quando abre',async()=>{const db=banco();const d=n=>new Date(Date.now()-n*864e5).toISOString();
 db.ondas.push({id:'00000000-0000-4000-8000-00000000cc01',wn:'9101',operador_id:db.operadores[0].id,galpao_id:G1,tipo:'Vários artigos',quantidade:7,status:0,registrada_em:d(20),concluida_em:d(20),procura_hist:[]},
  {id:'00000000-0000-4000-8000-00000000cc02',wn:'9102',operador_id:db.operadores[0].id,galpao_id:G1,tipo:'Vários artigos',quantidade:7,status:1,registrada_em:d(15),concluida_em:null,procura_hist:[]},
  {id:'00000000-0000-4000-8000-00000000cc03',wn:'9103',operador_id:db.operadores[0].id,galpao_id:G1,tipo:'Vários artigos',quantidade:7,status:0,registrada_em:d(2),concluida_em:d(2),procura_hist:[]});
 const p=await page(b,db);await login(p,'adm@x.com','senha1234');await p.waitForTimeout(500);
 let w=await p.evaluate(()=>S.waves.filter(x=>x.srv).map(x=>x.wn));ok(w.includes('9103')&&w.includes('9102')&&!w.includes('9101'),'aparelho: '+w);
 const dia=new Date(Date.now()-20*864e5-3*36e5).toISOString().slice(0,10);await p.evaluate(dd=>{go('op');$('#day').value=dd;$('#day').dispatchEvent(new Event('change'))},dia);await p.waitForTimeout(900);
 w=await p.evaluate(()=>S.waves.filter(x=>x.srv).map(x=>x.wn));ok(w.includes('9101'),'não buscou o dia antigo: '+w+' chamadas '+JSON.stringify(db.calls.ondas));ok(db.calls.ondas.dias===1,'buscas do dia: '+JSON.stringify(db.calls.ondas));
 await p.evaluate(()=>renderAll());await p.waitForTimeout(300);ok(db.calls.ondas.dias===1,'buscou de novo o mesmo dia');ok(!p.errors.length,p.errors.join(';'))});

await T('S108 Filtro de data: ausências da coleta e bipagens da embalagem seguem o dia escolhido no topo',async()=>{const db=banco();
 const dk=ms=>new Date(ms-3*36e5).toISOString().slice(0,10),agora=Date.now(),ant=agora-3*864e5,o0=db.operadores[0],o1=db.operadores[1];
 db.aus=[{id:'00000000-0000-4000-8000-0000000aa001',operador_id:o0.id,galpao_id:o0.galpao_id,motivo:'Banheiro',inicio:new Date(agora-6e5).toISOString(),fim:null},
  {id:'00000000-0000-4000-8000-0000000aa002',operador_id:o1.id,galpao_id:o1.galpao_id,motivo:'Banheiro',inicio:new Date(ant).toISOString(),fim:new Date(ant+6e5).toISOString()}];
 db.ppes=[{id:'00000000-0000-4000-8000-0000000bb001',codigo:'PR001',nome:'Bia Embalagem',galpao_id:G1,excluido_em:null}];
 db.pb=[];db.pb.push({id:'00000000-0000-4000-8000-0000000cc001',wn:'7001',pessoa_id:'00000000-0000-4000-8000-0000000bb001',andar:'mezanino',atividade:'mesa',turno_id:1,bipada_em:new Date(agora-6e5).toISOString(),dia:dk(agora),quantidade:1,origem:'bipagem'},
  {id:'00000000-0000-4000-8000-0000000cc002',wn:'7002',pessoa_id:'00000000-0000-4000-8000-0000000bb001',andar:'mezanino',atividade:'mesa',turno_id:1,bipada_em:new Date(ant).toISOString(),dia:dk(ant),quantidade:1,origem:'bipagem'});
 const p=await page(b,db);await login(p,'adm@x.com','senha1234');await p.waitForTimeout(300);
 await p.evaluate(()=>{go('op');document.querySelector('#sub [data-s="aus"]').click()});await p.waitForTimeout(500);
 let t=await p.textContent('#ausL');ok(t.includes(o0.nome.split(' ')[0])&&!t.includes(o1.nome.split(' ')[0]),'hoje: '+t);
 await p.evaluate(d=>{$('#day').value=d;$('#day').dispatchEvent(new Event('change'))},dk(ant));await p.waitForTimeout(600);
 t=await p.textContent('#ausL');ok(t.includes(o1.nome.split(' ')[0])&&!t.includes(o0.nome.split(' ')[0]),'dia antigo: '+t);
 const tit=await p.evaluate(()=>document.querySelector('#ausL').closest('.card').querySelector('h2').textContent);ok(/Ausentes em \d\d\/\d\d/.test(tit),'título: '+tit);
 await p.evaluate(()=>go('prod'));await p.waitForTimeout(600);t=await p.textContent('#pdL');ok(t.includes('7002')&&!t.includes('7001'),'embalagem dia antigo: '+t);
 await p.evaluate(d=>{$('#day').value=d;$('#day').dispatchEvent(new Event('change'))},dk(agora));await p.waitForTimeout(600);
 t=await p.textContent('#pdL');ok(t.includes('7001')&&!t.includes('7002'),'embalagem hoje: '+t);ok(!p.errors.length,p.errors.join(';'))});

await T('S109 Barra do banco vai enchendo em Manutenção e aparece na Auditoria',async()=>{const db=banco();const p=await page(b,db);await login(p,'adm@x.com','senha1234');
 await p.evaluate(()=>{go('cfg');document.querySelector('#csub [data-c="cma"]').click()});await p.waitForTimeout(1800);
 const w=await p.evaluate(()=>document.querySelector('#usoBody .usoBar b').style.width);ok(w==='3.6%','largura: '+w);ok((await p.textContent('#usoBody')).includes('auditoria ocupa'),'sem auditoria');
 if(process.env.SHOT)await (await p.$('#usoCard')).screenshot({path:process.env.SHOT});
 await p.evaluate(()=>document.querySelector('#csub [data-c="cau"]').click());await p.waitForTimeout(1500);ok((await p.textContent('#audUso')).includes('Banco de dados'),'sem barra na auditoria');ok((await p.textContent('#cau')).includes('guarda 1 ano'),'sem aviso de 1 ano');ok(!p.errors.length,p.errors.join(';'))});

await T('S110 Bipador: admin cria com gestor responsável, pessoa entra com usuário e só vê o liberado; responsável ajusta',async()=>{const db=banco();const p=await page(b,db);await login(p,'adm@x.com','senha1234');
 await p.evaluate(()=>{go('cfg');document.querySelector('#csub [data-c="cge"]').click()});await p.waitForTimeout(400);
 await abrirAdd(p);await p.selectOption('#mTipo','bipador');await abrirAdd(p);await p.fill('#mN','João Bipador');await p.fill('#mU','joao.bip');await p.selectOption('#mResp','g2@x.com');
 ok(await p.inputValue('#mG')==='Galpão 2','galpão não veio do responsável: '+await p.inputValue('#mG'));ok(!(await p.isVisible('#mC')),'permissões de gestor aparecendo para bipador');
 await p.check('#mBipA [data-bipk="prod"]');await p.fill('#mP2','senha1234');if(process.env.SHOT){await p.setViewportSize({width:1280,height:1000});await p.waitForTimeout(200);await (await p.$('#mNovo')).screenshot({path:process.env.SHOT})}await p.click('#mB');await p.waitForTimeout(700);
 const bp=db.gestores.find(x=>x.email==='joao.bip@rcondas.bip');ok(bp&&bp.perfil==='bipador'&&bp.responsavel==='g2@x.com'&&bp.galpao_id===G2&&bp.abas.join()==='op,prod','criado: '+JSON.stringify(bp));
 ok((await p.textContent('#mL')).includes('João Bipador'),'lista sem o bipador');if(process.env.SHOT2){await p.evaluate(()=>{document.querySelector('.cfgAddB[data-add="mNovo"]').click()});await p.waitForTimeout(300);await p.screenshot({path:process.env.SHOT2+'/ges.png'});await p.evaluate(()=>{document.querySelector('.cfgAddB[data-add="mNovo"]').click();document.querySelector('#csub [data-c="cma"]').click()});await p.waitForTimeout(1500);await p.screenshot({path:process.env.SHOT2+'/cma.png'})}
 await p.click('#logbtn');await p.waitForTimeout(300);await login(p,'joao.bip','senha1234');await p.waitForTimeout(500);
 let v=await p.evaluate(()=>({who:$('#who').textContent,tabs:[...document.querySelectorAll('.tab[data-t]')].filter(x=>x.style.display!=='none').map(x=>x.dataset.t),subs:[...document.querySelectorAll('#sub button')].filter(x=>x.style.display!=='none').map(x=>x.dataset.s),view}));
 ok(v.who.startsWith('Bipador')&&v.tabs.sort().join()==='op,prod'&&v.subs.join()==='reg'&&v.view==='op',JSON.stringify(v));
 await p.click('#logbtn');await p.waitForTimeout(300);await login(p,'g2@x.com','senha1234');await p.evaluate(()=>{go('cfg')});await p.waitForTimeout(300);
 const bt=await p.evaluate(()=>{const x=document.querySelector('#csub [data-c="cge"]');return{d:x.style.display,t:x.textContent}});ok(bt.d!=='none'&&bt.t==='Seus bipadores','aba do responsável: '+JSON.stringify(bt));
 await p.evaluate(()=>document.querySelector('#csub [data-c="cge"]').click());await p.waitForTimeout(500);ok(!(await p.isVisible('#mNovo')),'gestor comum vendo o formulário de criar');
 const lt=await p.textContent('#mL');ok(lt.includes('João Bipador')&&!lt.includes('Admin'),'lista do responsável: '+lt);
 await p.click('[data-mabas="joao.bip@rcondas.bip"]');await p.check('#mAbas [data-abk="op.aus"]');await p.click('#mAbas [data-abs="salvar"]');await p.waitForTimeout(500);
 ok(bp.abas.join()==='op,op.aus,prod','acessos: '+bp.abas);
 await p.click('#logbtn');await p.waitForTimeout(300);await login(p,'joao.bip','senha1234');await p.waitForTimeout(400);
 v=await p.evaluate(()=>[...document.querySelectorAll('#sub button')].filter(x=>x.style.display!=='none').map(x=>x.dataset.s));ok(v.join()==='reg,aus','subs depois: '+v);
 await p.click('#logbtn');await p.waitForTimeout(300);v=await p.evaluate(()=>[...document.querySelectorAll('#sub button')].filter(x=>x.style.display!=='none').map(x=>x.dataset.s));ok(v.length===4,'público ficou com abas escondidas: '+v);
 ok(!p.errors.length,p.errors.join(';'))});

await T('S111 Gestor comum (com configurações) muda turno e galpão de pessoa e salva a meta individual',async()=>{const db=banco();db.gestores.push({email:'bip@rcondas.bip',nome:'Iza Bip',galpao_id:G2,admin:false,pode_config:false,pode_individual:false,pode_registros:false,perfil:'bipador',responsavel:'g2@x.com',abas:['op','prs']});db.users['bip@rcondas.bip']={pw:'senha1234',ok:true};const p=await page(b,db);await login(p,'g2@x.com','senha1234');
 await p.evaluate(()=>go('cfg'));await p.waitForTimeout(300);
 const nav=await p.evaluate(()=>[...document.querySelectorAll('#cfgNav [data-c]')].filter(x=>x.style.display!=='none').map(x=>x.dataset.c));
 await p.click('#cfgNav [data-c="cus"]');await p.waitForTimeout(300);await p.evaluate(()=>{const b=document.querySelector('[data-uall="1"]');if(b)b.click()});await p.waitForTimeout(200);
 const sel=await p.$('#uL select[data-ut2]');ok(sel,'sem lista de pessoas para editar: '+await p.textContent('#cus')+' nav '+nav);
 await sel.selectOption('1');await p.waitForTimeout(500);const o=db.operadores.find(x=>x.galpao_id===G2);ok(o&&o.turno===1,'turno não salvo: '+JSON.stringify(o));
 await p.click('#cfgNav [data-c="cme"]');await p.waitForTimeout(300);const inp=await p.$('#mtL [data-gmo]');ok(inp,'sem campo de meta individual: '+await p.textContent('#cme'));
 await inp.fill('25');await inp.press('Tab');await p.waitForTimeout(500);if(process.env.SHOT){await p.screenshot({path:process.env.SHOT+'/g_cme.png'});await p.click('#cfgNav [data-c="cus"]');await p.waitForTimeout(300);await p.screenshot({path:process.env.SHOT+'/g_cus.png'})}const g=db.galpoes.find(x=>x.id===G2);ok(g&&g.meta_ind_ondas===25,'meta individual não salva: '+JSON.stringify(g));ok(!p.errors.length,p.errors.join(';'))});

await T('S112 Editar pessoa: nome e meta individual própria; admin muda permissões do gestor e a tela respeita',async()=>{const db=banco();db.operadores.push({id:'00000000-0000-4000-8000-0000000000b3',codigo:'CL003',nome:'Bia Rocha',turno:1,galpao_id:G2,excluido_em:null});
 db.galpoes.find(x=>x.id===G2).meta_ind_ondas=20;
 const p=await page(b,db);await login(p,'adm@x.com','senha1234');await p.evaluate(()=>go('cfg'));await p.click('#cfgNav [data-c="cus"]');await p.evaluate(()=>{const b=document.querySelector('[data-uall="1"]');if(b)b.click()});await p.waitForTimeout(200);
 await p.click('[data-uedit="CL002"]');await p.waitForTimeout(150);ok((await p.getAttribute('[data-uef="CL002"] [name="mo"]','placeholder')).includes('20'),'placeholder com a meta do galpão');
 await p.fill('[data-uef="CL002"] [name="n"]','Bia Rocha');await p.click('[data-uef="CL002"] [type="submit"]');await p.waitForTimeout(300);ok((await p.textContent('#toast')).includes('Nome repetido')||(await p.textContent('#toast')).includes('Já existe outra pessoa'),'nome repetido: '+await p.textContent('#toast'));
 await p.fill('[data-uef="CL002"] [name="n"]','Carla Dias Souza');await p.fill('[data-uef="CL002"] [name="mo"]','35');await p.click('[data-uef="CL002"] [type="submit"]');await p.waitForTimeout(600);
 const o=db.operadores.find(x=>x.codigo==='CL002');ok(o.nome==='Carla Dias Souza'&&o.meta_ind_ondas===35,'salvo: '+JSON.stringify(o));ok((await p.textContent('#uL')).includes('meta própria: 35 ondas'),'lista mostra a meta própria');
 ok(await p.evaluate(()=>MIP(S.ops.find(x=>x.m==='CL002')).o===35&&MIP(S.ops.find(x=>x.m==='CL003')).o===20),'meta da pessoa e do galpão');
 await p.click('#cfgNav [data-c="cge"]');await p.waitForTimeout(400);await p.click('[data-mperm="g2@x.com"]');await p.uncheck('#mPerm [data-pk="pP"]');await p.click('#mPermOk');await p.waitForTimeout(500);
 const g=db.gestores.find(x=>x.email==='g2@x.com');ok(g.pode_pessoas===false&&g.pode_metas===true&&g.pode_config===true,'permissões: '+JSON.stringify(g));ok((await p.textContent('#mL')).includes('metas'),'lista de permissões');
 await p.click('#logbtn');await p.waitForTimeout(300);await login(p,'g2@x.com','senha1234');await p.evaluate(()=>go('cfg'));await p.click('#cfgNav [data-c="cus"]');await p.evaluate(()=>{const b=document.querySelector('[data-uall="1"]');if(b)b.click()});await p.waitForTimeout(200);
 ok(!(await p.isVisible('[data-add="uAdd"]'))&&!(await p.$('[data-udel]'))&&await p.$eval('#uL select[data-ut2]',x=>x.disabled),'sem permissão de pessoas a tela trava');
 await p.click('[data-uedit="CL002"]');await p.waitForTimeout(150);ok(!(await p.$('[data-uef="CL002"] [name="n"]'))&&await p.$('[data-uef="CL002"] [name="mo"]'),'só a meta fica editável');
 ok(!p.errors.length,p.errors.join(';'))});

await T('S113 Lista longa: recolher e mostrar de novo não repete o seletor de página',async()=>{const db=banco();for(let i=10;i<70;i++)db.operadores.push({id:'00000000-0000-4000-8000-0000000c'+String(i).padStart(4,'0'),codigo:'CL0'+i,nome:'Pessoa Teste '+i,turno:1,galpao_id:G1,excluido_em:null});
 const p=await page(b,db);await login(p,'adm@x.com','senha1234');await p.evaluate(()=>go('cfg'));await p.click('#cfgNav [data-c="cus"]');await p.waitForTimeout(300);
 for(let i=0;i<3;i++){await p.evaluate(()=>document.querySelector('[data-uall="1"]').click());await p.waitForTimeout(250);await p.evaluate(()=>document.querySelector('[data-uall="0"]').click());await p.waitForTimeout(250)}
 await p.evaluate(()=>document.querySelector('[data-uall="1"]').click());await p.waitForTimeout(300);
 const n=await p.$$eval('#cus .pg',a=>a.length);ok(n===1,'seletores de página: '+n);ok(!p.errors.length,p.errors.join(';'))});

await T('S114 Meta individual de uma ou mais pessoas de uma vez (Coleta) e voltar a usar a do galpão',async()=>{const db=banco();db.operadores.push({id:'00000000-0000-4000-8000-0000000000b3',codigo:'CL003',nome:'Bia Rocha',turno:1,galpao_id:G1,excluido_em:null});
 const p=await page(b,db);await login(p,'adm@x.com','senha1234');await p.evaluate(()=>go('cfg'));await p.click('#cfgNav [data-c="cus"]');await p.evaluate(()=>{const b=document.querySelector('[data-uall="1"]');if(b)b.click()});await p.waitForTimeout(200);
 ok((await p.textContent('[data-mlote="col"]')).includes('Marque uma ou mais'),'barra avisa');
 await p.check('[data-usel="CL001"]');await p.waitForTimeout(100);await p.check('[data-usel="CL003"]');await p.waitForTimeout(100);ok((await p.textContent('[data-mlote="col"]')).includes('2 pessoas selecionadas'),'contagem');if(process.env.SHOT)await (await p.$('#cus')).screenshot({path:process.env.SHOT+'/lote.png'});
 await p.fill('#mlcO','30');await p.fill('#mlcQ','1.200');await p.click('[data-mlok="col"]');await p.waitForTimeout(500);
 const a1=db.operadores.find(x=>x.codigo==='CL001'),a3=db.operadores.find(x=>x.codigo==='CL003'),a2=db.operadores.find(x=>x.codigo==='CL002');ok(a1.meta_ind_ondas===30&&a3.meta_ind_qtd===1200&&!a2.meta_ind_ondas,'lote salvo: '+JSON.stringify([a1,a3]));
 ok((await p.$$eval('[data-usel]:checked',a=>a.length))===0,'seleção limpa');
 await p.check('[data-usel="CL001"]');await p.waitForTimeout(100);await p.click('[data-mlvolta="col"]');await p.waitForTimeout(500);ok(a1.meta_ind_ondas===null&&a1.meta_ind_qtd===null&&a3.meta_ind_ondas===30,'voltou à do galpão');
 await p.check('[data-uselall]');await p.waitForTimeout(150);ok((await p.textContent('[data-mlote="col"]')).includes((await p.$$eval('[data-usel]',a=>a.length))+' pessoas'),'selecionar todas');
 ok(!p.errors.length,p.errors.join(';'))});

await T('S115 Equipe › Semana: Coleta dia a dia, Embalagem pelo servidor e permissão própria',async()=>{const db=banco();const dkk=ms=>new Date(ms-3*36e5).toISOString().slice(0,10),hj=dkk(Date.now());
 db.ppes=[{id:'00000000-0000-4000-8000-0000000ee001',codigo:'PR001',nome:'Rita Embala',galpao_id:G1,excluido_em:null}];db.semEmb=[{pessoa_id:'00000000-0000-4000-8000-0000000ee001',dia:hj,primeira_em:new Date(Date.now()-36e5).toISOString(),ondas:12,unidades:340,ausencias:2,minutos_ausente:25,motivos:'Banheiro'}];
 const p=await page(b,db);await login(p,'adm@x.com','senha1234');await p.evaluate(()=>{go('ind');gsSel('sem')});await p.waitForTimeout(900);
 ok(await p.isVisible('#gsSem')&&await p.isVisible('#semBody .semT'),'página aparece');const n=await p.$$eval('#semBody .semT tr',a=>a.length);ok(n>=3,'linhas: '+n);
 ok((await p.textContent('#semBody .semNav b')).includes('Semana de'),'navegação');await p.click('[data-semnav="-1"]');await p.waitForTimeout(500);ok(await p.isVisible('[data-semnav="0"]'),'semana anterior com volta');await p.click('[data-semnav="0"]');await p.waitForTimeout(500);
 await p.click('[data-semset="emb"]');await p.waitForTimeout(700);const t=await p.textContent('#semBody .semT');ok(t.includes('Rita Embala')&&t.includes('340 un.')&&t.includes('2 saídas'),'embalagem: '+t.slice(0,200));ok(t.includes('Presente')&&!t.includes('Veio'),'rótulo Presente');if(process.env.SHOT)await p.screenshot({path:process.env.SHOT+'/sem_emb_srv.png'});
 db.gestores.find(x=>x.email==='adm@x.com');const g2=db.gestores.find(x=>x.email==='g2@x.com');g2.pode_semana=false;
 await p.click('#logbtn');await p.waitForTimeout(300);await login(p,'g2@x.com','senha1234');await p.evaluate(()=>go('ind'));await p.waitForTimeout(300);ok(!(await p.isVisible('#gsSem')),'sem permissão a aba some');
 ok(!p.errors.length,p.errors.join(';'))});

await T('S22 Gestor comum vê só "Metas" do seu galpão, sem Galpões; admin vê tudo',async()=>{const db=banco();const p=await page(b,db);
 await login(p,'g2@x.com','senha1234');await p.click('.tab[data-t="cfg"]');
 await p.click('[data-c="cme"]');const g=await p.evaluate(()=>({cga:getComputedStyle(document.querySelector('#csub [data-c="cga"]')).display,tab:document.querySelector('#csub [data-c="cme"]').textContent,fcard:document.querySelector('#fCard').classList.contains('hide'),linhas:document.querySelectorAll('#mtL tr').length,txt:document.querySelector('#mtL').textContent}));
 ok(g.cga==='none'&&g.tab==='Metas'&&g.fcard&&g.linhas===2&&g.txt.includes('Galpão 2')&&!g.txt.includes('Galpão 1'),JSON.stringify(g));
 await p.click('#logbtn');await login(p,'adm@x.com','senha1234');await p.click('.tab[data-t="cfg"]');
 const a=await p.evaluate(()=>({tab:document.querySelector('#csub [data-c="cga"]').textContent,novo:document.querySelector('#gNovo').classList.contains('hide'),nomes:document.querySelectorAll('#gL [data-gre]').length}));
 ok(a.tab==='Galpões'&&!a.novo&&a.nomes===2,JSON.stringify(a))});
await T('S23 Procurando no servidor: pendente com SKU, encontrada e baixa com nome; WN desconhecido avisa',async()=>{const db=banco();
 db.ondas.push({id:'x1',wn:'555',operador_id:db.operadores[0].id,galpao_id:G1,tipo:'Vários artigos',quantidade:40,status:0,registrada_em:new Date().toISOString(),concluida_em:new Date().toISOString(),procura_hist:[]});
 const p=await page(b,db);await p.click('.tab[data-t="prs"]');
 await p.fill('#prBip','999');await p.press('#prBip','Enter');await p.fill('#prSku','S1');await p.fill('#prQtd','2');await p.click('#prOk');await p.waitForTimeout(400);
 ok((await p.textContent('#toast')).includes('não está registrada'),'toast: '+await p.textContent('#toast'));
 await p.fill('#prBip','0555');await p.press('#prBip','Enter');await p.fill('#prSku','SKU-7');await p.fill('#prQtd','9');await p.fill('#prLoc','B-02');await p.press('#prLoc','Enter');await p.waitForTimeout(500);
 ok(db.ondas[0].status===1&&db.ondas[0].procura_sku==='SKU-7'&&db.ondas[0].procura_local==='B-02'&&JSON.stringify(db.ondas[0].procura_itens)==='[{"sku":"SKU-7","qtd":9}]','banco: '+JSON.stringify(db.ondas[0]));
 ok((await p.textContent('#prList')).includes('SKU-7'),'pendentes sem a onda');
 await p.fill('#prBip','555');await p.press('#prBip','Enter');await p.click('#prAOk');await p.waitForTimeout(300);ok(db.ondas[0].status===1,'achou sem informar o nome');await p.fill('#prNome','Marcos Lima');await p.click('#prAOk');await p.waitForTimeout(500);ok(db.ondas[0].status===0,'banco não voltou a 0');ok(db.ondas[0].procura_hist.some(h=>h.e==='a'&&h.q==='Marcos Lima'),'servidor não guardou quem encontrou: '+JSON.stringify(db.ondas[0].procura_hist));
 ok((await p.textContent('#prList')).includes('Nenhuma')&&(await p.textContent('#prHist')).includes('Dar baixa'),'etapas na tela');
 await p.fill('#prBip','555');await p.press('#prBip','Enter');await p.fill('#prNome','J');await p.press('#prNome','Enter');await p.waitForTimeout(400);
 ok(!db.ondas[0].procura_achou_por&&(await p.textContent('#toast')).length>0,'aceitou nome curto');
 await p.fill('#prNome','João Pedro');await p.press('#prNome','Enter');await p.waitForTimeout(500);
 ok(db.ondas[0].procura_achou_por==='João Pedro'&&db.ondas[0].procura_hist.map(e=>e.e).join('')==='mab','banco baixa: '+JSON.stringify(db.ondas[0].procura_hist));
 ok((await p.textContent('#prHist')).includes('João Pedro'),'histórico sem o nome')});
await T('S24 Meta individual grava no galpão (admin) e é recusada para outro galpão (gestor)',async()=>{const db=banco();const p=await page(b,db);
 await login(p,'adm@x.com','senha1234');await p.click('.tab[data-t="cfg"]');await p.click('[data-c="cme"]');
 await p.fill('[data-gmo="Galpão 1"]','30');await p.press('[data-gmo="Galpão 1"]','Tab');await p.waitForTimeout(450);
 await p.fill('[data-gmq="Galpão 1"]','900');await p.press('[data-gmq="Galpão 1"]','Tab');await p.waitForTimeout(450);
 const g1=db.galpoes.find(x=>x.id===G1);ok(g1.meta_ind_ondas===30&&g1.meta_ind_qtd===900,JSON.stringify(g1));
 await p.fill('[data-gmo="Galpão 1"]','');await p.press('[data-gmo="Galpão 1"]','Tab');await p.waitForTimeout(450);
 ok(g1.meta_ind_ondas===null,'não removeu: '+g1.meta_ind_ondas)});
await T('S25 Gestor comum: Usuários só do galpão dele, cria usuário nele e a aba Gestores some; admin vê tudo',async()=>{const db=banco();const p=await page(b,db);
 const ver=()=>p.evaluate(()=>{uAll=true;cfgUsers();return 0}).then(()=>p.evaluate(()=>({lista:document.querySelector('#uL').textContent,sel:document.querySelector('#uG').closest('label').classList.contains('hide'),ges:getComputedStyle(document.querySelector('#csub [data-c="cge"]')).display})));
 await login(p,'g2@x.com','senha1234');await p.click('.tab[data-t="cfg"]');await p.click('[data-c="cus"]');
 const x=await ver();ok(x.lista.includes('Carla Dias')&&!x.lista.includes('Ana Souza')&&x.sel&&x.ges==='none',JSON.stringify(x));
 await abrirAdd(p);await p.fill('#uN','Novo Op');await p.click('#uB');await p.waitForTimeout(500);
 const n=db.operadores.find(o=>o.nome==='Novo Op');ok(n&&n.galpao_id===G2,JSON.stringify(n));
 await p.click('#logbtn');await login(p,'adm@x.com','senha1234');await p.click('.tab[data-t="cfg"]');await p.click('[data-c="cus"]');
 const a=await ver();ok(a.lista.includes('Ana Souza')&&a.lista.includes('Carla Dias')&&!a.sel&&a.ges!=='none',JSON.stringify(a))});
await T('S29 Site público: turno e data escondidos sem login (galpão fica para escolher o do aparelho); gestor vê',async()=>{const db=banco();const p=await page(b,db);
 await p.waitForTimeout(300);
 for(const i of ['#turnoF','#day'])ok(!(await p.isVisible(i)),i+' visível no público');ok(await p.isVisible('#gal'),'galpão do aparelho escondido');
 await login(p,'g2@x.com','senha1234');await p.waitForTimeout(300);
 for(const i of ['#turnoF','#gal','#day'])ok(await p.isVisible(i),i+' deveria aparecer para gestor')});
await T('S30 Lista de presença: marcar tira o nome da lista e preenche a semana; desfazer devolve; sem permissão não marca',async()=>{const db=banco();const p=await page(b,db);
 await login(p,'g2@x.com','senha1234');await p.evaluate(()=>go('ind'));await p.waitForTimeout(400);
 await p.evaluate(()=>document.querySelector('#gsub [data-gs="chk"]').click());await p.waitForTimeout(700);
 let x=(await p.textContent('#ckBody')).replace(/\s+/g,' ');ok(x.includes('A conferir (1)')&&x.includes('Carla Dias')&&x.includes('Conferidos (0)'),'lista inicial: '+x.slice(0,200));
 await p.click('#ckBody [data-ck="presente"][data-m="CL002"]');await p.waitForTimeout(500);
 ok((db.presenca||[]).length===1&&db.presenca[0].tipo==='presente'&&db.presenca[0].data_ini===HJ,'não gravou presente: '+JSON.stringify(db.presenca));
 x=(await p.textContent('#ckBody')).replace(/\s+/g,' ');ok(x.includes('A conferir (0)')&&x.includes('Conferidos (1)')&&x.includes('Todos conferidos'),'nome não saiu da lista: '+x.slice(0,240));
 await p.click('#ckBody [data-ckv="sem"]');await p.waitForTimeout(700);
 ok(await p.$eval('#day',e=>e.value)===HJ,'a data do topo mudou ao abrir Semanal: '+await p.$eval('#day',e=>e.value));
 ok(!(await p.$('#ckBody .esq')),'ficou preso no carregamento');
 ok(await p.$eval('#ckBody .wkc[data-m="CL002"][data-d="'+HJ+'"]',e=>e.textContent.includes('Presente')),'semana não mostra Presente');
 await p.click('#ckBody [data-ckv="chk"]');await p.waitForTimeout(700);
 await p.evaluate(()=>document.querySelector('#coSeg [data-gs="mi"]').click());await p.waitForTimeout(800);
 ok(!(await p.$('#iBody .esq')),'Meta individual ficou presa no carregamento depois da Lista de presença');
 ok((await p.textContent('#iBody')).replace(/\s+/g,' ').length>40,'Meta individual vazia');
 await p.evaluate(()=>document.querySelector('#coSeg [data-gs="mc"]').click());await p.waitForTimeout(800);
 ok(!(await p.$('#coBody .esq')),'Meta coletiva ficou presa no carregamento');
 await p.evaluate(()=>document.querySelector('#gsub [data-gs="chk"]').click());await p.waitForTimeout(700);
 await p.click('#ckBody [data-ckun]');await p.waitForTimeout(500);
 ok(db.presenca[0].cancelado_em,'não cancelou');x=(await p.textContent('#ckBody')).replace(/\s+/g,' ');ok(x.includes('A conferir (1)'),'nome não voltou: '+x.slice(0,160));
 await p.fill('#ckBody .ckd[data-m="CL002"]','3');await p.click('#ckBody [data-ck="atestado"][data-m="CL002"]');await p.waitForTimeout(500);
 const at=db.presenca[1];const fimEsp=(()=>{const d=new Date(HJ+'T12:00:00');d.setDate(d.getDate()+2);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')})();
 ok(at&&at.tipo==='atestado'&&at.data_ini===HJ&&at.data_fim===fimEsp,'atestado de 3 dias: '+JSON.stringify(at));
 const q=await banco();q.gestores.find(g=>g.email==='g2@x.com').pode_registros=false;const p2=await page(b,q);
 await login(p2,'g2@x.com','senha1234');await p2.evaluate(()=>go('ind'));await p2.waitForTimeout(400);await p2.evaluate(()=>document.querySelector('#gsub [data-gs="chk"]').click());await p2.waitForTimeout(700);
 ok(await p2.$eval('#ckBody [data-ck="presente"]',e=>e.disabled),'botão deveria estar desabilitado sem permissão');ok(!(q.presenca||[]).length,'gravou sem permissão')});

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

await T('S31 Admin restringe abas de um gestor; gestor vê só as liberadas e não entra nas outras',async()=>{const db=banco();const p=await page(b,db);await login(p,'adm@x.com','senha1234');await p.click('.tab[data-t="cfg"]');await p.click('[data-c="cge"]');
 await p.click('#mL tr:has-text("g2@x.com") [data-mabas]');await p.waitForTimeout(300);
 for(const k of ['prs','his','cfg'])await p.uncheck('#mAbas [data-abk="'+k+'"]');
 await p.click('#mAbas [data-abs="salvar"]');await p.waitForTimeout(600);
 const g2=db.gestores.find(g=>g.email==='g2@x.com');ok(JSON.stringify(g2.abas)==='["painel","op","ind"]','abas gravadas: '+JSON.stringify(g2.abas));
 const p2=await page(b,db);await login(p2,'g2@x.com','senha1234');await p2.waitForTimeout(300);
 ok(await p2.isVisible('.tab[data-t="ind"]'),'Gestão deveria aparecer');
 ok(!(await p2.isVisible('.tab[data-t="his"]')),'Histórico não deveria aparecer');
 ok(!(await p2.isVisible('.tab[data-t="cfg"]')),'Config não deveria aparecer');ok(await p2.isVisible('.tab[data-t="prod"]'),'Produção (bipagem) é pública e deveria aparecer');
 await p2.evaluate(()=>go('cfg'));await p2.waitForTimeout(300);
 ok(await p2.evaluate(()=>view)!=='cfg','entrou em Config sem permissão');
 await p.click('#mL tr:has-text("g2@x.com") [data-mabas]');await p.waitForTimeout(300);
 await p.click('#mAbas [data-abs="todas"]');await p.waitForTimeout(600);
 ok(db.gestores.find(g=>g.email==='g2@x.com').abas===null,'liberar todas não gravou null')});
await T('S32 Sincronização: depois da 1ª carga baixa só o que mudou; exclusões somem; ao recarregar usa a cópia do aparelho',async()=>{const db=banco();const t0=new Date(Date.now()-36e5).toISOString();['s1','s2','s3'].forEach((id,i)=>db.ondas.push({id,wn:'90'+i,operador_id:db.operadores[0].id,galpao_id:G1,tipo:'Vários artigos',quantidade:10+i,status:0,registrada_em:t0,concluida_em:t0}));const p=await page(b,db);await login(p,'adm@x.com','senha1234');
 const n0=await p.evaluate(()=>S.waves.filter(w=>w.srv).length),f0=db.calls.ondas.full;
 const alvo=db.ondas[0],outro=db.ondas[1];const agora=new Date(Date.now()+60000).toISOString();alvo.quantidade=777;alvo.atualizado_em=agora;db.ondas.splice(1,1);db.excl=[{id:outro.id,excluida_em:agora}];
 await p.evaluate(()=>pull());const r=await p.evaluate(([a,o])=>({q:(S.waves.find(w=>w.id===a)||{}).qty,tem:S.waves.some(w=>w.id===o),n:S.waves.filter(w=>w.srv).length}),[alvo.id,outro.id]);
 ok(db.calls.ondas.full===f0&&db.calls.ondas.delta>=1,'deveria usar a sincronização incremental: '+JSON.stringify(db.calls.ondas));ok(r.q===777,'alteração não chegou: '+r.q);ok(!r.tem&&r.n===n0-1,'exclusão não chegou: '+JSON.stringify(r));
 await p.waitForTimeout(1200);await p.reload();await p.waitForTimeout(900);
 const r2=await p.evaluate(()=>({me:!!(me&&me.adm),n:S.waves.filter(w=>w.srv).length}));ok(r2.me&&r2.n===n0-1,'cópia do aparelho: '+JSON.stringify(r2));
 ok(db.calls.ondas.full===f0,'recarregar não deveria baixar tudo de novo: '+JSON.stringify(db.calls.ondas));
 await p.evaluate(()=>sair());await p.waitForTimeout(300);ok(await p.evaluate(()=>localStorage.getItem('rcondas.me')===null),'sair deveria apagar a cópia')});
await T('S33 Relatórios de 12 meses: ondas antigas vêm em totais do banco e somam com as recentes',async()=>{const db=banco();const velho=new Date(Date.now()-100*864e5).toISOString(),novo=new Date(Date.now()-2*864e5).toISOString();
 for(let i=0;i<5;i++)db.ondas.push({id:'v'+i,wn:'70'+i,operador_id:db.operadores[0].id,galpao_id:G1,tipo:'Vários artigos',quantidade:100,status:0,registrada_em:velho,concluida_em:velho});
 db.ondas.push({id:'n1',wn:'801',operador_id:db.operadores[0].id,galpao_id:G1,tipo:'Itens Únicos',quantidade:40,status:0,registrada_em:novo,concluida_em:novo});
 const p=await page(b,db);await login(p,'adm@x.com','senha1234');
 await p.evaluate(()=>{go('his');$('#hVis').value='mes';hisFill();$('#hPer').value='12';$('#hMet').value='o';loadHis(true)});await p.waitForTimeout(900);
 const r=await p.evaluate(()=>({kp:document.querySelector('#hBody').textContent.replace(/\s+/g,' '),agg:(HW||[]).filter(w=>w.agg).length}));
 ok(db.calls.agg>=1&&r.agg>=1,'deveria usar os totais do banco: '+JSON.stringify({calls:db.calls.agg,agg:r.agg}));
 await p.evaluate(()=>{$('#hMet').value='u';hisRender()});const t=await p.evaluate(()=>document.querySelector('#hBody').textContent.replace(/\s+/g,' '));ok(/540/.test(t),'total de unidades 500+40: '+t.slice(0,300))});
await T('S90 Configuração de várias ondas é compartilhada pelo servidor',async()=>{
 const db=banco(),p=await page(b,db);await login(p,'adm@x.com','senha1234');await p.click('.tab[data-t="cfg"]');
 await p.check('[data-multi="Vários artigos"]');await p.waitForTimeout(450);ok(db.tipos.find(x=>x.nome==='Vários artigos').multiplas_no_lancamento===true,'ativação não gravou');
 await p.uncheck('[data-multi="Maiores/Pesados"]');await p.waitForTimeout(450);ok(db.tipos.find(x=>x.nome==='Maiores/Pesados').multiplas_no_lancamento===false,'desativação não gravou');
 const outra=await page(b,db);await outra.click('.tab[data-t="op"]');await outra.fill('#opIn','CL001');await outra.waitForTimeout(300);await outra.click('[data-ty="Vários artigos"]');await outra.waitForTimeout(400);
 ok(await outra.isVisible('#addRow'),'outro aparelho não recebeu ativação');await outra.click('#b3');await outra.click('[data-ty="Maiores/Pesados"]');await outra.waitForTimeout(400);
 ok(await outra.isHidden('#addRow'),'outro aparelho não recebeu desativação');
});
await T('S91 Onda excluída pelo gestor pode ser bipada de novo no aparelho da operação',async()=>{
 const db=banco(),p=await page(b,db);await reg(p,'CL001','Pacote do mesmo',[[7101,10]]);await p.evaluate(()=>push());await p.waitForTimeout(500);
 ok(db.ondas.some(x=>x.wn==='7101'),'primeira bipagem não chegou');
 db.ondas=db.ondas.filter(x=>x.wn!=='7101');
 await reg(p,'CL001','Pacote do mesmo',[[7101,12]]);await p.evaluate(()=>push());await p.waitForTimeout(500);
 const r=await p.evaluate(()=>S.waves.filter(w=>w.wn==='7101').map(w=>w.qty));
 ok(db.ondas.filter(x=>x.wn==='7101').length===1&&db.ondas.find(x=>x.wn==='7101').quantidade===12&&r.join()==='12','deveria registrar de novo: '+JSON.stringify({db:db.ondas.filter(x=>x.wn==='7101'),local:r,toast:''}));
 await reg(p,'CL001','Pacote do mesmo',[[7101,5]]);ok(db.ondas.filter(x=>x.wn==='7101').length===1&&/já foi registrada/.test(await p.textContent('#rowsL')+await p.textContent('#toast')),'onda existente deveria continuar bloqueada')});
await T('S92 Modo público vê ondas em andamento e concluídas de todos os aparelhos',async()=>{const db=banco();const agora=Date.now();
 db.ondas.push({id:'00000000-0000-4000-8000-00000000c001',wn:'9901',operador_id:db.operadores[1].id,galpao_id:G2,tipo:'Vários artigos',quantidade:40,status:0,registrada_em:new Date(agora-5*6e4).toISOString(),concluida_em:new Date(agora-5*6e4).toISOString()});
 db.ondas.push({id:'00000000-0000-4000-8000-00000000c002',wn:'9902',operador_id:db.operadores[0].id,galpao_id:G1,tipo:'Vários artigos',quantidade:15,status:1,registrada_em:new Date(agora-2*6e4).toISOString(),concluida_em:null,procura_sku:'SKU1'});
 const p=await page(b,db);await p.click('.tab[data-t="op"]');await p.waitForTimeout(400);
 await p.click('#sub [data-s="ace"]');await p.waitForTimeout(200);const ace=await p.textContent('#aceL');
 await p.click('#sub [data-s="ctl"]');await p.waitForTimeout(200);const ctl=await p.textContent('#ctl');
 ok(db.calls.pub>=1,'não chamou ondas_publicas');ok(/9901/.test(ace)&&/Carla Dias/.test(ace),'concluídas: '+ace.slice(0,200));ok(/9902/.test(ctl),'em andamento: '+ctl.slice(0,300));
 ok(!(await p.$('#aceL [data-adel]')),'público não pode excluir');ok(p.errors.length===0,p.errors.join(';'))});
await T('S93 Ausente: pessoa registra motivo e horário, volta, e o relatório mostra os tipos',async()=>{const db=banco();
 const pa=await page(b,db);await login(pa,'adm@x.com','senha1234');await pa.click('.tab[data-t="cfg"]');await pa.click('[data-c="cmo"]');await pa.fill('#motN','Inventário');await pa.click('#motF button');await pa.waitForTimeout(450);
 ok((db.config[0].motivos_ausencia||[]).join('|')==='Ajudando na Rua|Embalando|Inventário','motivos: '+JSON.stringify(db.config[0].motivos_ausencia));
 const p=await page(b,db);await p.click('.tab[data-t="op"]');await p.click('#sub [data-s="aus"]');await p.waitForTimeout(300);
 ok((await p.textContent('#ausMot')).includes('Inventário'),'motivo novo não chegou na operação');
 await p.fill('#ausP','Ana');await p.waitForTimeout(100);ok(await p.locator('#ausSug [data-aussug]').count()>=1,'sem sugestões');await p.locator('#ausSug [data-aussug]').first().click();await p.waitForTimeout(100);ok((await p.textContent('#ausWho')).includes('Ana Souza'),'não achou a pessoa');ok(await p.locator('#ausSug [data-aussug]').count()===0,'sugestões não fecharam');
 await p.click('#ausF [type="submit"]');await p.waitForTimeout(200);ok(!(db.aus||[]).length,'registrou sem motivo');
 await p.click('[data-ausm="Ajudando na Rua"]');const h=await p.evaluate(()=>{const d=new Date(Date.now()-30*6e4);return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')});
 if(h>await p.evaluate(()=>hmT(Date.now())))return;await p.fill('#ausI',h);await p.click('#ausF [type="submit"]');await p.waitForTimeout(600);
 ok(db.aus&&db.aus.length===1&&db.aus[0].motivo==='Ajudando na Rua'&&db.aus[0].operador_id===db.operadores[0].id&&!db.aus[0].fim,'ausência: '+JSON.stringify(db.aus));
 ok((await p.textContent('#ausL')).includes('Ana Souza'),'lista de ausentes');await p.click('[data-ausv]');await p.waitForTimeout(500);ok(!!db.aus[0].fim,'volta não registrada');
 await pa.click('.tab[data-t="his"]');await pa.waitForTimeout(300);await pa.click('#hsub [data-hs="aus"]');await pa.waitForTimeout(700);const r=(await pa.textContent('#hAus')).replace(/\s+/g,' ');
 ok(/Ajudando na Rua/.test(r)&&/Embalando/.test(r)&&/Inventário/.test(r)&&/Ana Souza/.test(r),'relatório: '+r.slice(0,400));
 ok(p.errors.length===0&&pa.errors.length===0,p.errors.concat(pa.errors).join(';'))});
await T('S94 Horário por galpão: só o galpão escolhido muda e quem seguia o horário é atualizado',async()=>{const db=banco();db.operadores[0].inicio=7;db.operadores[0].fim=16;db.operadores[1].inicio=16;db.operadores[1].fim=23;
 db.operadores.push({id:'00000000-0000-4000-8000-0000000000b3',codigo:'CL003',nome:'Bia Própria',turno:2,galpao_id:G2,inicio:15,fim:21,excluido_em:null});
 const p=await page(b,db);await login(p,'g2@x.com','senha1234');await p.click('.tab[data-t="cfg"]');await p.click('[data-c="cho"]');await p.waitForTimeout(200);
 ok(!(await p.$('[data-hgal]')),'gestor comum não deveria escolher outro galpão');
 const f='form[data-hr="2"] ';await p.fill(f+'[data-hk="fim"]','22:30');await p.click(f+'[type="submit"]');await p.waitForTimeout(250);ok(/hora cheia/.test(await p.textContent('#toast')),'deveria pedir hora cheia: '+await p.textContent('#toast'));await p.fill(f+'[data-hk="fim"]','22:00');await p.fill(f+'[data-hk="ci"]','19:00');await p.fill(f+'[data-hk="cf"]','19:15');await p.fill(f+'[data-hk="ai"]','19:10');await p.fill(f+'[data-hk="af"]','20:00');
 await p.click(f+'[type="submit"]');await p.waitForTimeout(300);ok(/mesmo horário/.test(await p.textContent('#toast')),'deveria barrar café e almoço juntos: '+await p.textContent('#toast'));
 await p.fill(f+'[data-hk="ai"]','20:00');await p.fill(f+'[data-hk="af"]','20:30');await p.click(f+'[type="submit"]');await p.waitForTimeout(600);
 const h=db.galpoes.find(x=>x.id===G2).horarios;ok(h&&h[2]&&h[2].fim===22&&h[2].cafe.ini===1140&&h[2].alm.ini===1200,'salvo: '+JSON.stringify(h));ok(!db.galpoes.find(x=>x.id===G1).horarios,'mexeu no galpão 1');
 ok(db.operadores[1].fim===22&&db.operadores[2].fim===21&&db.operadores[0].fim===16,'pessoas: '+JSON.stringify(db.operadores.map(o=>[o.nome,o.inicio,o.fim])));
 const j=await p.evaluate(()=>{const o=S.ops.find(x=>x.m==='CL002');return{tb:turnoBase(2,'Galpão 2'),g1:turnoBase(2,'Galpão 1'),pz:pausasT(2,'Galpão 2').map(x=>x.n),al:almocoOf(o)}});
 ok(j.tb.fim===22&&j.g1.fim===23&&j.pz.join()==='Café'&&j.al&&j.al.ini===1200,'cálculo: '+JSON.stringify(j));ok(p.errors.length===0,p.errors.join(';'))});
await T('S95 Produção: gestor define posto e turno, aparelho público bipa, presença só na primeira e repetida recusada',async()=>{const db=banco();
 db.ondas.push({id:'00000000-0000-4000-8000-00000000c001',wn:'8001',operador_id:'00000000-0000-4000-8000-0000000000b1',galpao_id:G1,tipo:'Vários artigos',quantidade:2,status:0,registrada_em:new Date().toISOString()});
 const pa=await page(b,db);await login(pa,'adm@x.com','senha1234');await pa.click('.tab[data-t="prod"]');await pa.waitForTimeout(300);
 await pa.evaluate(()=>{go('cfg');document.querySelector('#csub [data-c="cpd"]').click();document.getElementById('cpdTu').open=true});await pa.waitForTimeout(400);ok(await pa.isVisible('#cpd'),'admin deveria ver o cadastro da embalagem na Config');ok((await pa.$$('#pdNovaF [name="pdT"] option[value]:not([value=""])')).length>0,'turnos no cadastro da embalagem');
 await pa.evaluate(()=>{document.querySelector('#csub [data-c="cho"]').click();document.getElementById('cpdTu').open=true});await pa.waitForTimeout(300);await pa.fill('[data-pdt="1"] [name="s"]','15:00');await pa.click('[data-pdt="1"] [type="submit"]');await pa.waitForTimeout(400);ok(db.pt[0].saida==='15:00','turno não salvo: '+JSON.stringify(db.pt[0]));
 ok((await pa.textContent('#pdDl')).includes('Nenhuma pessoa cadastrada'),'pessoas da Coleta apareceram na Produção');
 await pa.evaluate(()=>document.querySelector('#csub [data-c="cpd"]').click());await pa.waitForTimeout(300);await abrirAdd(pa);await pa.fill('#pdNovaF [name="n"]','Ana Embalagem');await pa.check('#pdNovaF input[name="pdAn"][value="mezanino"]');await pa.check('#pdNovaF input[name="pdAt"][value="maquina"]');await pa.click('#pdNovaF [type="submit"]');await pa.waitForTimeout(450);
 ok(db.ppes.length===1&&db.ppes[0].codigo==='PR001'&&db.ppes[0].galpao_id===G1,'cadastro: '+JSON.stringify(db.ppes));
 ok(db.pa.length===1&&db.pa[0].andar==='mezanino'&&db.pa[0].criado_por==='adm@x.com','posto: '+JSON.stringify(db.pa));
 ok((await pa.textContent('#pdDl')).includes('Mezanino'),'lista não atualizou');
 const p=await page(b,db);await p.click('.tab[data-t="prod"]');await p.waitForTimeout(300);ok(!(await p.isVisible('#pdDisV'))&&!(await p.evaluate(()=>pdGestor())),'público vendo Distribuição');
 await p.fill('#pdP','CL001');await p.waitForTimeout(120);ok(!(await p.isVisible('#pdW')),'pessoa da Coleta abriu a bipagem na Produção');
 await p.fill('#pdP','PR001');await p.waitForTimeout(120);ok(await p.isVisible('#pdW'),'campo da onda');ok((await p.textContent('#pdWho')).includes('Mezanino'),'posto não aparece');
 for(const w of ['08001','9002','9002']){await p.fill('#pdW',w);await p.press('#pdW','Enter');await p.waitForTimeout(250)}
 ok(db.pb.length===2,'bipagens: '+db.pb.length);ok(db.pp.length===1,'presenças: '+db.pp.length);ok((await p.textContent('#pdMsg')).includes('já embalada'),'sem aviso de repetida');
 const L=await p.textContent('#pdL');ok(L.includes('Coletada')&&L.includes('Não coletada'),'status: '+L);
 const pg=await page(b,db);await login(pg,'g2@x.com','senha1234');const r=await pg.evaluate(async(pid)=>{try{await api("/rest/v1/rpc/prod_atribuir",{method:"POST",body:{p_pessoa:pid,p_andar:"terreo",p_atividade:"mesa",p_turno:1,p_entrada:null,p_saida:null,p_situacao:"ativo",p_desde:new Date().toISOString()}});return"passou"}catch(e){return e.status}},db.ppes[0].id);
 ok(r===403,'gestor de outro galpão conseguiu distribuir: '+r);ok(db.pa.length===1,'posto alterado por gestor sem permissão')});

await T('S96 Produção sem internet: a onda fica pendente no aparelho e é enviada quando a conexão volta, sem duplicar',async()=>{const db=banco();
 db.ppes=[{id:'00000000-0000-4000-8000-0000000c0001',codigo:'PR001',nome:'Ana Embalagem',galpao_id:G1,excluido_em:null}];db.pa=[{id:'a1',pessoa_id:'00000000-0000-4000-8000-0000000c0001',andar:'terreo',atividade:'mesa',turno_id:1,entrada:null,saida:null,situacao:'ativo',inicio:new Date(Date.now()-36e5).toISOString(),fim:null}];
 const p=await page(b,db);await p.click('.tab[data-t="prod"]');await p.waitForTimeout(300);await p.fill('#pdP','PR001');await p.waitForTimeout(120);
 db.down=true;await p.fill('#pdW','7777');await p.press('#pdW','Enter');await p.waitForTimeout(300);
 ok((await p.textContent('#pdL')).includes('Pendente'),'não ficou pendente');ok(db.pb.length===0,'gravou com servidor fora');
 const fila=await p.evaluate(()=>JSON.parse(localStorage.getItem('rcondas.prodFila')||'[]').length);ok(fila===1,'fila '+fila);
 db.down=false;await p.evaluate(()=>pdFilaEnviar());await p.waitForTimeout(400);await p.evaluate(()=>pdFilaEnviar());await p.waitForTimeout(300);
 ok(db.pb.length===1,'bipagens depois de voltar: '+db.pb.length);ok((await p.textContent('#pdL')).includes('Não coletada'),'status depois do envio');
 ok(await p.evaluate(()=>!localStorage.getItem('rcondas.prodFila')),'fila não esvaziou')});

await T('S97 Produção: admin grava metas por hora e o desempenho do período vem do servidor; público não lê o desempenho',async()=>{const db=banco();
 db.ppes=[{id:'00000000-0000-4000-8000-0000000c0001',codigo:'PR001',nome:'Ana Embalagem',galpao_id:G1,excluido_em:null}];db.pa=[{id:'a1',pessoa_id:'00000000-0000-4000-8000-0000000c0001',andar:'terreo',atividade:'mesa',turno_id:1,entrada:null,saida:null,situacao:'ativo',inicio:new Date(Date.now()-36e5*5).toISOString(),fim:null,criado_por:'adm@x.com'}];
 const p=await page(b,db);await p.click('.tab[data-t="prod"]');await p.waitForTimeout(300);await p.fill('#pdP','PR001');await p.waitForTimeout(120);
 for(const w of ['5001','5002']){await p.fill('#pdW',w);await p.press('#pdW','Enter');await p.waitForTimeout(250)}ok(db.pb.length===2,'bipagens '+db.pb.length);
 const neg=await p.evaluate(async()=>{try{await api("/rest/v1/rpc/prod_bipagens_periodo",{method:"POST",body:{p_ini:hoje(),p_fim:hoje()}});return 200}catch(e){return e.status||0}});ok(neg===403,'público leu o desempenho: '+neg);
 await p.evaluate(()=>go('painel'));await p.waitForTimeout(500);ok(!(await p.isVisible('#pnSeg'))&&!(await p.isVisible('#pnDuo')),'público vendo o painel da Embalagem');
 const pa=await page(b,db);await login(pa,'adm@x.com','senha1234');await pa.evaluate(()=>{go('cfg');document.querySelector('#csub [data-c="cpd"]').click()});await pa.waitForTimeout(600);
 await pa.evaluate(()=>document.querySelector('#csub [data-c="cme"]').click());await pa.waitForTimeout(300);ok((await pa.textContent('#pdMt')).includes('Metas de embalagens'),'metas na Config');
 await pa.fill('#pdMetaF [name="m|Galpão 1|terreo-mesa"]','96');await pa.click('#pdMetaF [type="submit"]');await pa.waitForTimeout(600);
 ok(db.pm.length===1&&db.pm[0].atividade==='mesa'&&db.pm[0].andar==='terreo'&&db.pm[0].por_dia===96&&db.pm[0].horas_dia===8&&db.pm[0].por_hora===12&&db.pm[0].galpao_id===G1,'meta gravada '+JSON.stringify(db.pm));
 await pa.waitForTimeout(200);
 await pa.evaluate(()=>{go('ind');document.querySelector('#gsub [data-gs="pd"]').click()});await pa.waitForTimeout(600);ok(db.calls.per>=1,'não buscou o período no servidor');ok((await pa.textContent('#pdDesV')).includes('Ana Embalagem'),'individual');
 await pa.evaluate(()=>go('painel'));await pa.waitForTimeout(700);ok(await pa.isVisible('#pnSeg')&&await pa.isVisible('#pnDuo'),'admin deveria ver Coleta e Embalagem no Painel');ok(await pa.isVisible('#pnVis'),'visão geral do admin');await pa.click('#pnSeg [data-pnv="emb"]');await pa.waitForTimeout(300);ok((await pa.textContent('#pnDuo')).includes('Fila entre Coleta e Embalagem'),'fila no painel do admin');
});

await T('S98 Cada gestor troca a própria senha: pede a atual, confere a repetição e a nova senha passa a valer',async()=>{const db=banco();
 const pub=await page(b,db);ok(!(await pub.isVisible('#pwbtn')),'público vendo o botão Minha senha');
 const pa=await page(b,db);await login(pa,'adm@x.com','senha1234');ok(await pa.isVisible('#pwbtn'),'gestor sem o botão Minha senha');
 await pa.click('#pwbtn');ok(await pa.isVisible('#pw'),'janela');
 await pa.fill('#pwA','errada123');await pa.fill('#pwN','novaSenha99');await pa.fill('#pwR','novaSenha99');await pa.click('#pwB');await pa.waitForTimeout(400);
 ok(db.users['adm@x.com'].pw==='senha1234'&&(await pa.isVisible('#pw'))&&(await pa.textContent('#toast')).includes('atual incorreta'),'aceitou senha atual errada');
 await pa.fill('#pwA','senha1234');await pa.fill('#pwR','outraCoisa1');await pa.click('#pwB');await pa.waitForTimeout(300);ok(db.users['adm@x.com'].pw==='senha1234','trocou sem repetir igual');
 await pa.fill('#pwN','curta');await pa.fill('#pwR','curta');await pa.click('#pwB');await pa.waitForTimeout(300);ok(db.users['adm@x.com'].pw==='senha1234','aceitou senha curta');
 await pa.fill('#pwN','novaSenha99');await pa.fill('#pwR','novaSenha99');await pa.click('#pwB');await pa.waitForTimeout(500);
 ok(db.users['adm@x.com'].pw==='novaSenha99'&&!(await pa.isVisible('#pw')),'senha não foi trocada');
 await pa.click('#logbtn');await pa.waitForTimeout(400);const pb=await page(b,db);await login(pb,'adm@x.com','novaSenha99');ok(await pb.isVisible('#pwbtn'),'nova senha não entrou')});

await T('S99 Admin edita o galpão de um gestor; gestor comum não tem o botão',async()=>{const db=banco();
 const pa=await page(b,db);await login(pa,'adm@x.com','senha1234');await pa.evaluate(()=>{go('cfg');document.querySelector('#csub [data-c="cge"]').click()});await pa.waitForTimeout(500);
 ok((await pa.$$('#mL [data-mgal]')).length===2,'botão Galpão por gestor');
 await pa.click('#mL [data-mgal="g2@x.com"]');ok(await pa.isVisible('#mGalS'),'editor');ok((await pa.$$eval('#mGalS option',o=>o.map(x=>x.textContent))).join()==='Galpão 1,Galpão 2','só galpões, sem "Todos" para gestor comum');
 await pa.selectOption('#mGalS','Galpão 1');await pa.click('#mGalOk');await pa.waitForTimeout(600);
 ok(db.gestores.find(x=>x.email==='g2@x.com').galpao_id===G1,'galpão não gravado '+JSON.stringify(db.gestores[1]));
 ok((await pa.textContent('#mL')).includes('Galpão 1'),'lista não mostra o novo galpão');
 const pg=await page(b,db);await login(pg,'g2@x.com','senha1234');await pg.evaluate(()=>{go('cfg');document.querySelector('#csub [data-c="cge"]').click()});await pg.waitForTimeout(400);ok((await pg.$$('#mL [data-mgal]')).length===0,'gestor comum com botão Galpão')});

await T('S100 Só a quantidade: o servidor valida, grava uma vez e o gestor vê no período',async()=>{const db=banco();
 db.ppes=[{id:'00000000-0000-4000-8000-0000000c0001',codigo:'PR001',nome:'Ana Embalagem',galpao_id:G1,excluido_em:null}];db.pa=[{id:'a1',pessoa_id:'00000000-0000-4000-8000-0000000c0001',andar:'terreo',atividade:'mesa',turno_id:1,entrada:null,saida:null,situacao:'ativo',inicio:new Date(Date.now()-36e5*5).toISOString(),fim:null,criado_por:'adm@x.com'}];
 const p=await page(b,db);await p.click('.tab[data-t="prod"]');await p.waitForTimeout(300);await p.fill('#pdP','PR001');await p.waitForTimeout(150);
 await p.click('#pdMode [data-pdq="q"]');await p.fill('#pdQn','30');await p.click('#pdQb');await p.click('#pdQok');await p.waitForTimeout(500);
 ok(db.pb.length===1&&db.pb[0].quantidade===30&&db.pb[0].origem==='quantidade','quantidade não gravada '+JSON.stringify(db.pb));ok((await p.textContent('#pdMsg')).includes('30 embalagens registradas'),'mensagem '+await p.textContent('#pdMsg'));
 const r=await p.evaluate(async()=>{const id=uid(),B=q=>({lote:[{id:crypto.randomUUID(),wn:'x',pessoa_id:'00000000-0000-4000-8000-0000000c0001',bipada_em:new Date().toISOString(),quantidade:q}]});const o=[];for(const q of [0,5001,2.5,"9"])o.push((await api("/rest/v1/rpc/registrar_embalagens",{method:"POST",body:B(q)}))[0].resultado);
  const L={lote:[{id,wn:'x',pessoa_id:'00000000-0000-4000-8000-0000000c0001',bipada_em:new Date().toISOString(),quantidade:7}]};o.push((await api("/rest/v1/rpc/registrar_embalagens",{method:"POST",body:L}))[0].resultado);o.push((await api("/rest/v1/rpc/registrar_embalagens",{method:"POST",body:L}))[0].resultado);return o});
 ok(r.slice(0,4).every(x=>x==='recusada')&&r[4]==='ok'&&r[5]==='ja_existia','validação do servidor '+r);ok(db.pb.length===2,'duplicou ao reenviar: '+db.pb.length);
 const pa=await page(b,db);await login(pa,'adm@x.com','senha1234');const per=await pa.evaluate(async()=>(await api("/rest/v1/rpc/prod_bipagens_periodo",{method:"POST",body:{p_ini:hoje(),p_fim:hoje()}})).map(x=>[x.origem,x.quantidade]));
 ok(per.some(x=>x[0]==='quantidade'&&x[1]===30),'gestor não recebeu a quantidade '+JSON.stringify(per))});

await b.close();
const w=Math.max(...R.map(r=>r[1].length));for(const r of R)console.log((r[0]==='PASS'?'✅':'❌')+' '+r[1].padEnd(w)+'  '+r[2]);
console.log(`\n${R.filter(r=>r[0]==='PASS').length}/${R.length} passaram`)})();
