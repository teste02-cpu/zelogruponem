# Zelogruponem

Atue como um Engenheiro de Software Full Stack Senior e Arquiteto de Sistemas. Preciso que você desenvolva a estrutura completa e o código para uma aplicação web responsiva (Mobile-First / PWA) focada na gestão de incidentes e manutenção de infraestrutura universitária.

Abaixo estão os requisitos do sistema:

---

1. CONCEITO GERAL E ARQUITETURA
- Público-alvo: colaboradores da universidade (Usuários) + Equipe de Manutenção/Administração (Painel Adm).
- Tipo de Aplicação: Web App Responsivo otimizado para navegadores móveis (Chrome no Android/iOS) com suporte a PWA (Progressive Web App) para facilitar acesso rápido e uso nativo da câmera.
- Autenticação: O sistema deve resgatar automaticamente as credenciais do usuário logado (ex: via SSO/OAuth2 da instituição ou sessão ativa).

---

2. MÓDULO DO USUÁRIO (REGISTRO RÁPIDO)
Fluxo de Tela:
1. Abertura/Câmera Instantânea: Ao abrir o app/extensão no celular, a tela principal já ativa diretamente a câmera do dispositivo (via HTML5 Media Capture / WebRTC).
2. Captura da Foto: O usuário tira a foto do problema (ex: maçaneta quebrada na Sala 05).
3. Análise de IA / Visão Computacional (Auto-preenchimento):
   - Assim que a foto é tirada, o sistema envia a imagem para um modelo de visão (ex: OpenAI GPT-4o Vision ou Google Gemini Vision).
   - A IA analisa a imagem e retorna um auto-preenchimento automático para:
     - Título/Categoria do Problema: (ex: "Maçaneta/Trinco danificado")
     - Descrição Sugerida: (ex: "Fechadura da porta avariada com peças soltas.")
4. Campos do Formulário:
   - Nome do Usuário: Preenchido automaticamente (somente leitura).
   - Foto: Visualização da imagem capturada.
   - Localização: Campo de seleção/texto (Ex: Bloco A - Sala 05). Sugestão: permitir leitura de QR Code do local caso disponível.
   - Descrição do Problema: Pré-preenchida pela IA, mas 100% editável pelo usuário.
5. Botão de Envio: "Registrar Ocorrência".

---

3. MÓDULO ADMINISTRATIVO (DASHBOARD)
Funcionalidades Principais:
1. Feed de Chamados: Lista/Kanban de chamados recebidos com foto, local, solicitante, data/hora e status (Pendente, Em Andamento, Concluído).
2. Motor de Priorização Inteligente:
   - O sistema deve classificar automaticamente a Prioridade (Alta, Média, Baixa) com base na seguinte regra de negócio:
     - PRIORIDADE ALTA: Tudo o que afetar diretamente a experiência, segurança ou continuidade das atividades dos alunos ou colaboradores (ex: banheiros inoperantes, vazamentos, portas travadas em salas de aula, ar-condicionado quebrado em dia de prova, fiação exposta).
     - PRIORIDADE MÉDIA/BAIXA: Avarias estéticas ou itens que não impedem o uso imediato do espaço (ex: pintura descascada, lâmpada queimada em corredor externo bem iluminado).
   - A IA deve avaliar o campo "Descrição" + "Local" + "Categoria" e atribuir a prioridade com uma justificativa visível para o gestor.
3. Filtros e Ações:
   - Filtrar por prioridade, bloco/local e status.
   - Atribuir responsável da equipe de manutenção.
   - Alterar status e enviar notificação de resolução ao usuário.

---

4. TECNOLOGIAS SUGERIDAS (Adapte se necessário)
- Frontend: React / Next.js ou HTML5 + Tailwind CSS (Mobile-First).
- Backend: Node.js (Express) ou Python (FastAPI).
- IA/Visão: API do OpenAI GPT-4o Vision ou Google Gemini para análise de imagem e classificação de prioridade.
- Banco de Dados: PostgreSQL ou Firebase.

---

O QUE VOCÊ DEVE ENTREGAR AGORA:
1. A arquitetura recomendada para o projeto.
2. O código do Frontend do Usuário (focado na captura rápida por câmera e envio).
3. O código do Backend responsável pelo recebimento da foto, integração com a API de IA para análise e regra de prioridade.
4. O layout básico em código do Dashboard Administrativo.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://zelogruponem.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/3de47129-d151-454b-bbca-1073aeb70fb4).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
