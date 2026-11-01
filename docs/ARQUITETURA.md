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
