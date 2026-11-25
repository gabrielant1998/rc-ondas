// Cria a conta do gestor já com senha (sem pedido nem e-mail de confirmação) ou troca a senha de um gestor.
// Também cria o acesso "Bipador" (pessoa comum que só bipa, ligada a um gestor responsável).
// Só o administrador do RC Ondas pode chamar. A chave de serviço fica no servidor.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resp = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resp(405, { erro: "Método não permitido" });
  try {
    const url = Deno.env.get("SUPABASE_URL")!, svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adm = createClient(url, svc, { auth: { persistSession: false, autoRefreshToken: false } });
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: quem, error: eq } = await adm.auth.getUser(jwt);
    if (eq || !quem?.user?.email || !quem.user.email_confirmed_at) return resp(401, { erro: "Entre como administrador para fazer isso." });
    const { data: eu } = await adm.from("gestores").select("admin").eq("email", quem.user.email.toLowerCase()).maybeSingle();
    if (!eu?.admin) return resp(403, { erro: "Só o administrador pode criar gestores ou trocar senhas." });

    const b = await req.json().catch(() => ({}));
    const email = String(b.email || "").trim().toLowerCase();
    const senha = String(b.senha || "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return resp(400, { erro: "Informe um e-mail válido." });
    if (senha.length < 8 || senha.length > 72) return resp(400, { erro: "A senha precisa ter de 8 a 72 caracteres." });

    if (b.acao === "criar") {
      const nome = String(b.nome || "").trim().slice(0, 80);
      if (nome.length < 2) return resp(400, { erro: "Informe o nome do gestor." });
      const bip = b.perfil === "bipador";
      const admin = bip ? false : !!b.admin;
      let galpao_id: string | null = admin ? null : (b.galpao_id ? String(b.galpao_id) : null);
      let responsavel: string | null = null, abas: string[] | null = null;
      if (bip) {
        responsavel = String(b.responsavel || "").trim().toLowerCase();
        const { data: r } = await adm.from("gestores").select("email,galpao_id,perfil").eq("email", responsavel).maybeSingle();
        if (!r || r.perfil === "bipador") return resp(400, { erro: "Escolha o gestor responsável." });
        if (!galpao_id) galpao_id = r.galpao_id;
        const ok = ["painel", "op", "op.ctl", "op.ace", "op.aus", "prod", "prod.aus", "prs"];
        abas = Array.isArray(b.abas) ? [...new Set((b.abas as unknown[]).map(String))].filter((x) => ok.includes(x)) : [];
        if (!abas.length) return resp(400, { erro: "Escolha pelo menos um acesso para o bipador." });
      }
      if (!admin && !galpao_id) return resp(400, { erro: "Escolha o galpão do gestor." });
      if (galpao_id) {
        const { data: g } = await adm.from("galpoes").select("id").eq("id", galpao_id).maybeSingle();
        if (!g) return resp(400, { erro: "Galpão não encontrado." });
      }
      const { data: ja } = await adm.from("gestores").select("email").eq("email", email).maybeSingle();
      if (ja) return resp(409, { erro: "Já existe um gestor com este e-mail. Use Trocar senha na lista." });
      const { error: ec } = await adm.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome } });
      if (ec) {
        // conta de login já existia (pedido antigo, por exemplo): só define a senha e confirma
        if (!/already|registered|exists/i.test(ec.message)) return resp(400, { erro: ec.message });
        const id = await idPorEmail(adm, email);
        if (!id) return resp(400, { erro: ec.message });
        const { error: eu2 } = await adm.auth.admin.updateUserById(id, { password: senha, email_confirm: true });
        if (eu2) return resp(400, { erro: eu2.message });
      }
      const { error: ei } = await adm.from("gestores").insert({
        email, nome, galpao_id, admin,
        ...(bip
          ? { perfil: "bipador", responsavel, abas, pode_config: false, pode_individual: false, pode_registros: false }
          : { pode_config: b.pode_config !== false, pode_individual: b.pode_individual !== false, pode_registros: b.pode_registros !== false }),
      });
      if (ei) return resp(400, { erro: ei.message });
      await adm.from("solicitacoes_gestor").delete().eq("email", email);
      return resp(200, { ok: true });
    }

    if (b.acao === "senha") {
      const { data: g } = await adm.from("gestores").select("email").eq("email", email).maybeSingle();
      if (!g) return resp(404, { erro: "Gestor não encontrado." });
      const id = await idPorEmail(adm, email);
      if (id) {
        const { error } = await adm.auth.admin.updateUserById(id, { password: senha, email_confirm: true });
        if (error) return resp(400, { erro: error.message });
      } else {
        const { error } = await adm.auth.admin.createUser({ email, password: senha, email_confirm: true });
        if (error) return resp(400, { erro: error.message });
      }
      return resp(200, { ok: true });
    }
    return resp(400, { erro: "Ação desconhecida." });
  } catch (e) {
    console.error("gestor-conta", e);
    return resp(500, { erro: "Não foi possível concluir agora. Tente de novo." });
  }
});

// deno-lint-ignore no-explicit-any
async function idPorEmail(adm: any, email: string): Promise<string | null> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await adm.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return null;
    const u = data.users.find((x: { email?: string }) => (x.email || "").toLowerCase() === email);
    if (u) return u.id;
    if (data.users.length < 200) return null;
  }
  return null;
}
