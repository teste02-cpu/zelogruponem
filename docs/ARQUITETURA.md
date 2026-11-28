# Zelo — Arquitetura

```text
 Celular (PWA, Chrome/Safari)                Servidor (funções no edge)                 Lovable Cloud
 ┌──────────────────────────┐   foto (JPEG)  ┌──────────────────────────────┐          ┌────────────────────┐
 │ / Câmera instantânea     │ ─────────────▶ │ analyzeIncidentPhoto         │ ──IA──▶  │ Modelo de visão    │
 │  getUserMedia + fallback │ ◀── título,    │  (auth obrigatória)          │          │ (Lovable AI)       │
 │  <input capture>         │     categoria, └──────────────────────────────┘          └────────────────────┘
 │ Formulário + QR (jsQR)   │     descrição
 │                          │ ─ upload ────────────────────────────────────────────▶  Storage privado
 │ "Registrar Ocorrência"   │ ─────────────▶ ┌──────────────────────────────┐          (incident-photos/{uid}/…)
 └──────────────────────────┘                │ createIncident               │ ──IA──▶  Motor de prioridade
                                             │  1. IA classifica prioridade │          + regra determinística
 Painel /admin (equipe)                      │  2. regra institucional      │
 ┌──────────────────────────┐                │     (nunca rebaixa ALTA)     │ ──────▶  Postgres: incidents
 │ Kanban/Lista + filtros   │ ◀── realtime ─ │  3. grava com service role   │          (RLS)
 │ Atribuir / status        │ ─────────────▶ │ updateIncident (staff)       │ ──────▶  notifications
 └──────────────────────────┘                └──────────────────────────────┘
```

Quem registra pode criar uma conta opcional em `/conta`: os próximos chamados ficam
associados ao usuário autenticado e podem ser consultados em outros aparelhos. Sem conta,
o registro continua público e o acompanhamento permanece disponível pelo token salvo no aparelho.

## Camadas

- **Frontend**: TanStack Start + React 19 + Tailwind v4, mobile-first. Instalável (manifest PWA).
- **Backend**: server functions (`src/lib/incidents.functions.ts`) — autenticação via token da sessão.
- **IA**: `src/lib/ai/incident-ai.server.ts` (visão + prioridade), saída estruturada com schema estrito.
- **Regra de prioridade**: `src/lib/priority.ts` (testada em `priority.test.ts`), usada no prompt e como rede de segurança.
- **Banco**: `profiles`, `user_roles` (admin / maintenance / user), `incidents`, `notifications`. RLS em todas.

## Alertas por e-mail

- `notification_outbox` é uma fila durável, sem acesso para `anon`/`authenticated`; triggers transacionais enfileiram novos chamados e conclusões. Chaves únicas evitam duplicação por ocorrência, evento e destinatário.
- Os destinatários da equipe são os administradores com e-mail em `profiles`; a conclusão também avisa o e-mail informado pelo solicitante. Chamados abertos há 24 horas ou mais geram um alerta administrativo, uma única vez por ocorrência.
- Configure no ambiente privado do servidor `EMAIL_PROVIDER=resend`, `RESEND_API_KEY` e `EMAIL_FROM` com um remetente verificado. Sem esses valores, a fila permanece pendente e registra novas tentativas; o sistema não marca mensagens como enviadas.
- Configure `LOVABLE_CRON_SECRET` e um agendador para enviar `POST /api/notifications/cron` com `Authorization: Bearer <segredo>` periodicamente (por exemplo, a cada 5 minutos). `INCIDENT_OVERDUE_HOURS` altera o limite (padrão 24, faixa 1–720). As credenciais ficam somente no runtime do servidor, nunca no `.env` público.
- `src/lib/notifications/whatsapp.server.ts` define a fronteira de adaptador server-side e o registro de provedores. WhatsApp permanece desativado até selecionar/ativar um provedor e adicionar credenciais privadas; nenhum QR code ou envio WhatsApp é implementado nesta etapa. Um fluxo futuro pode ser específico do provedor: ativação em área exclusiva de admin, QR temporário emitido pelo provedor, confirmação da conta comercial e armazenamento/revogação das credenciais somente no servidor.

## PWA e rascunhos offline

- `public/sw.js` prioriza a rede para a tela pública e guarda o shell e assets versionados para reabertura offline; páginas privadas e respostas de API não entram no cache.
- Rascunhos e fotos ficam no IndexedDB do aparelho. Um rascunho é salvo sem ser enviado; somente tocar em “Registrar Ocorrência” marca a intenção de envio, que pode então sincronizar automaticamente ao recuperar a conexão.
- Cada intenção tem uma chave idempotente persistida no rascunho e uma restrição única no banco. Tokens de sessão não são guardados no IndexedDB; o servidor valida a sessão atual antes de associar um chamado a uma conta.

## Segurança

- Usuários não inserem chamados diretamente: só o servidor grava, para que a prioridade da IA não seja forjada.
- O token de sessão é validado no servidor antes de associar um chamado a uma conta; o histórico da conta é filtrado pelo usuário validado.
- Contas de quem registra recebem apenas o papel `user`; não recebem acesso à equipe nem à administração.
- Novos cadastros do Google recebem somente o papel `user`; administradores aprovam o acesso pelo botão "Usuários".
- Fotos em bucket privado; cada usuário só envia para a própria pasta; equipe lê tudo via URL assinada.
- O primeiro cadastro por e-mail que não seja de reporter ainda inicia como administrador; cadastros Google aguardam aprovação. Administradores gerenciam permissões nos botões "Usuários" e "Equipe".

## SSO institucional

Login com Google (pode ser restrito ao domínio da universidade) e e-mail/senha. SAML/OIDC institucional pode ser
ligado nas configurações de autenticação sem mudar o restante do app.
