# NAVMANAGER - Alteração de Horário de Funcionamento (SBIZ)

**Sistema de Solicitação e Gestão de Alteração de Horário de Funcionamento (Prorrogação e Antecipação)**  
*Aeroporto de Imperatriz (SBIZ) - NAV Brasil / DNIZ*

---

## 📌 1. Visão Geral do Sistema

O **NAVMANAGER** é uma solução web desenvolvida para automatizar, organizar e auditar todo o fluxo de solicitações de alteração de horário de funcionamento (prorrogação e antecipação de serviços de navegação aérea) no Aeroporto de Imperatriz/MA (SBIZ).

### Principais Ciclos de Vida de uma Solicitação:
1. **Pré-Registro pelo Operador da Aeronave**: O cliente solicita o atendimento informando dados da empresa, aeronave, piloto, período desejado e intenção de voo.
2. **Dupla Confirmação por E-mail**: O solicitante recebe um e-mail com token seguro para confirmar a solicitação. A administração recebe um pré-aviso.
3. **Checagem de Adimplência & Validação**: O sistema verifica automaticamente se a matrícula ou CNPJ está na lista de inadimplentes.
4. **Notificação da Escala OEA**: Uma vez confirmada pelo cliente, o sistema consulta a planilha de escala de serviço dos Operadores (OEA) do dia e turno correspondente e dispara um e-mail automático notificando a equipe de plantão com o PDF oficial anexado.
5. **Decisão Administrativa**: A administração analisa e autoriza (`Autorizar`), recusa (`Recusar`) ou cancela (`Cancelar`) a solicitação.
6. **Atendimento Operacional & Faturamento**: No painel operacional, a equipe registra os horários reais atendidos, operador responsável, status de faturamento/cobrança, número da fatura e envio NACA.

---

## 🌐 2. Hospedagem, Repositório e Ambientes

* **Repositório GitHub**: [https://github.com/GERNAVSBIZ/altercaohorario.git](https://github.com/GERNAVSBIZ/altercaohorario.git) (Branch principal: `main`)
* **Plataforma de Hospedagem**: **Vercel**
* **URL de Produção**: [https://altercaohorario.vercel.app/](https://altercaohorario.vercel.app/)

---

## 🗄️ 3. Arquitetura e Bancos de Dados

A aplicação é construída com **Next.js 16 (App Router + Turbopack)**, utilizando **React** e **Node.js**.

### A. Banco de Dados Principal (Firebase Firestore: `sbiz-navmanager`)
Utilizado para armazenar todos os registros da aplicação.
* **Coleção `requests`**: Todas as solicitações de alteração de horário (dados do cliente, aeronave, período, status de aprovação e dados operacionais de atendimento/faturamento).
* **Coleção `email_logs`**: Logs detalhados de cada e-mail disparado pelo sistema (destinatários, assunto, status de envio, mensagens de erro do Brevo e o `payload` completo com HTML e PDF anexado para reenvio genérico).
* **Coleção `delinquents`**: Cadastro de matrículas de aeronaves e CNPJs/CPFs inadimplentes.
* **Coleção `config` (documento `settings`)**: Configurações globais do sistema:
  * `airportAdminEmail`: E-mails dos administradores que recebem pré-avisos e solicitações confirmadas.
  * `operatorsEmails`: Mapeamento de nomes de operadores na escala x e-mails individuais para notificação da escala.
  * `ccDecisionEmails`: E-mails configurados para receber cópia (CC) da decisão final.
* **Coleção `profiles`**: Perfis e permissões dos usuários autenticados.

### B. Banco de Dados da Escala de Serviço (Firebase Firestore: `dashboard-escala`)
Banco de dados integrado em modo de leitura para consulta da escala OEA.
* **Coleção `artifacts/dashboard-escala/schedules`**: Armazena os documentos mensais de escala dos operadores de navegação aérea (ex: `06-2026-JUNHO`, `07-2026-JULHO`, `08-2026-AGOSTO`).

### C. Gateway de Disparo de E-mails
* **Brevo (Sendinblue) API**: Disparo de e-mails em formato HTML com anexos PDF usando o wrapper customizado `sendEmail` em `src/lib/brevo.js`.

---

## 🔑 4. Variáveis de Ambiente (`.env.local`)

Para executar a aplicação localmente ou em ambiente de nuvem, as seguintes variáveis são necessárias no arquivo `.env.local`:

```env
# URL da Aplicação
NEXT_PUBLIC_APP_URL=https://altercaohorario.vercel.app

# Firebase Client SDK (sbiz-navmanager)
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=sbiz-navmanager.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=sbiz-navmanager
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=sbiz-navmanager.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=1041766921768
NEXT_PUBLIC_FIREBASE_APP_ID=1:1041766921768:web:...

# Firebase Admin SDK (Chave de Serviço)
FIREBASE_PROJECT_ID=sbiz-navmanager
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@sbiz-navmanager.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Configurações do Brevo (E-mails)
BREVO_API_KEY=xkeysib-...
BREVO_SENDER_EMAIL=gernavsbiz@gmail.com
BREVO_SENDER_NAME="NAV Brasil - DNIZ"

# E-mail Padrão da Administração
AIRPORT_ADMIN_EMAIL=administracao.sbiz@localhost.com
```

---

## 🚀 5. Módulos e Rotas do Sistema

### 1. Painel do Solicitante / Operador (`/dashboard`)
* **Formulário de Solicitação**: Cadastro completo da intenção de voo.
* **Histórico "Minhas Solicitações"**: Acompanhamento do status em tempo real.
* **Ações do Cliente (com Regra Limite das 17h30)**:
  * **Editar Solicitação**: Permite alterar dados da solicitação.
  * **Cancelar Solicitação**: Permite cancelar a prorrogação.
  * ⚠️ **Regra de Horário Limite**: Edições e cancelamentos por parte do cliente só são aceitos **até às 17h30 (horário de Brasília - UTC-3) do dia da alteração/voo**. Após esse horário, os botões são bloqueados com um aviso visual.

### 2. Confirmação do Cliente (`/confirm`)
* Acessado via link de dupla confirmação enviado ao e-mail do cliente (`/confirm?token=...&id=...`). Altera o status para `confirmed` e dispara as notificações da escala OEA.

### 3. Autenticação (`/login`)
* Acesso seguro via Firebase Auth com e-mail e senha para Administradores e Operadores.

### 4. Painel de Administração (`/admin`)
Acessível para administradores autenticados. Contém 4 abas:
* **Aba Solicitações**:
  * Visualização da lista de solicitações (limitada visualmente a 5 linhas com rolagem vertical e horizontal).
  * Botões de Ação: `Autorizar`, `Recusar`, `Cancelar` (permite que administradores cancelem prorrogações a **qualquer momento**), `Confirmar Manual` (para validar solicitações cujo e-mail do cliente não chegou) e download do `PDF`.
* **Aba Configurações**:
  * Cadastro dos e-mails da administração, e-mails em cópia CC e o mapeamento de operadores da escala (Nome na Escala : E-mail).
* **Aba Aeronaves Inadimplentes**:
  * Cadastro e remoção de matrículas ou CNPJs bloqueados para rejeição automática.
* **Aba Logs de Envio**:
  * Histórico de todos os disparos de e-mail com status (`Enviado` / `Falhou`), descrição de erro, campo de filtro por assunto/destinatário, botão de **Reenviar** e botão de **Confirmar Manual**.

### 5. Painel Operacional PNA/OEA (`/operacional`)
* **Gestão de Atendimentos**: Registro dos horários reais atendidos, operador responsável, status de faturamento/cobrança, número da fatura, envio ao NACA e observações operacionais.
* **Relatório Consolidado**: Tabela resumida de atendimentos por operador PNA/OEA com cálculo automático das horas antecipadas e prorrogadas.
* 🛑 **Aeronaves Canceladas**: Solicitações canceladas deixam de aparecer automaticamente neste painel e não são contabilizadas no cálculo de horas.

---

## 🛠️ 6. Funcionalidades e Algoritmos de Destaque

1. **Algoritmo de Indexação de Escala OEA (`escala-server.js`)**:
   * O sistema calcula a posição dos dias na planilha de escala encontrando a primeira ocorrência do dia `1` do mês corrente. Isso evita que o dia 29 de Junho colida com o dia 29 de Maio presente no cabeçalho de transição entre meses.
2. **Sistema de Logs e Alerta de Falha de E-mail (`brevo.js`)**:
   * Todo disparo é registrado na coleção `email_logs`. Em caso de falha na API do Brevo, o sistema dispara um e-mail de alerta não-bloqueante para os administradores informando os detalhes da falha.
3. **Gerador de PDF Responsivo (`pdf-generator.js`)**:
   * Utiliza `pdf-lib` com a função `wrapText` que divide palavras longas ou e-mails contínuos caractere por caractere caso estoure a largura máxima da coluna, ajustando a altura das caixas dinamicamente.

---

## 💻 7. Como Rodar o Projeto Localmente

```bash
# 1. Clonar o repositório
git clone https://github.com/GERNAVSBIZ/altercaohorario.git

# 2. Entrar na pasta do projeto
cd NAVMANAGER_ALTERACAO_HORARIO

# 3. Instalar dependências
npm install

# 4. Iniciar ambiente de desenvolvimento
npm run dev

# 5. Testar compilação de produção (build)
npm run build
```

---

*Documento gerado para registro histórico e manutenção futura do sistema NAVMANAGER SBIZ.*
