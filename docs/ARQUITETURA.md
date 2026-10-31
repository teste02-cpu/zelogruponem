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

## Camadas
- **Frontend**: TanStack Start + React 19 + Tailwind v4, mobile-first. Instalável (manifest PWA).
- **Backend**: server functions (`src/lib/incidents.functions.ts`) — autenticação via token da sessão.
- **IA**: `src/lib/ai/incident-ai.server.ts` (visão + prioridade), saída estruturada com schema estrito.
- **Regra de prioridade**: `src/lib/priority.ts` (testada em `priority.test.ts`), usada no prompt e como rede de segurança.
- **Banco**: `profiles`, `user_roles` (admin / maintenance / user), `incidents`, `notifications`. RLS em todas.

## Segurança
- Usuários não inserem chamados diretamente: só o servidor grava, para que a prioridade da IA não seja forjada.
- Fotos em bucket privado; cada usuário só envia para a própria pasta; equipe lê tudo via URL assinada.
- O primeiro usuário cadastrado vira administrador; ele adiciona a equipe pelo botão "Equipe".

## SSO institucional
Login com Google (pode ser restrito ao domínio da universidade) e e-mail/senha. SAML/OIDC institucional pode ser
ligado nas configurações de autenticação sem mudar o restante do app.
