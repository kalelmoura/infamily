# Especificação Técnica — inf.amily
## Estoque, Vendas, Fiado e Resumo financeiro

> Projeto da loja **inf.amily** (loja da Yasmin). O projeto da Denia Concept é parecido e será feito separadamente depois — boa parte desta especificação é reaproveitável.
> O sistema é uma ferramenta operacional de loja com quatro módulos internos — **Estoque**, **Vendas**, **Fiado** e **Resumo financeiro** — protegidos por login, mais uma **landing page pública**.
> **Este documento não contém código.** Ele descreve o que construir e como, deixando a implementação para a fase de desenvolvimento.

---

## 1. Objetivo do sistema

A inf.amily é uma loja de roupas. Hoje o controle é manual (papel), o que faz cobranças se perderem e impede saber, de forma confiável, quanto há em estoque, quanto foi vendido e quanto se lucrou.

O sistema substitui esse controle manual por uma ferramenta web simples e segura que cobre o ciclo operacional da loja: cadastrar o que tem em estoque, registrar vendas dando baixa automática no estoque, controlar quem comprou fiado e quando vai pagar, e ver de forma direta as entradas e o lucro. Além disso, tem uma landing page pública que apresenta a marca.

A usuária principal e única do sistema interno é a Yasmin, dona da loja, que não tem familiaridade com tecnologia. Isso mantém a restrição central de design: **simplicidade radical** — poucas informações por tela, fluxos curtos, botões grandes e óbvios. Toda decisão de produto pende para o lado mais simples.

O sucesso do MVP: a dona consegue, sem ajuda, (a) cadastrar uma peça, (b) registrar uma venda que dá baixa no estoque, (c) registrar e cobrar um fiado, e (d) ver quanto entrou e quanto lucrou.

---

## 2. Visão geral dos módulos

O sistema tem uma parte pública (landing page) e uma parte interna protegida por login com quatro módulos. Os módulos internos se conectam por um conceito central: **toda saída de produto da loja é uma "venda"**, seja paga na hora ou fiado. Entender isso evita duplicar lógica.

**Landing page (pública).** Apresenta a marca inf.amily com a frase de efeito "por família – pra família" e informações básicas da loja. No futuro, vai exibir peças disponíveis (não agora). Tem um acesso administrativo discreto que leva ao login do sistema interno.

**Estoque.** Cadastro das peças com três informações essenciais: o valor que a dona pagou na peça (custo), o valor pelo qual vai vender, e a quantidade em estoque. É a base de tudo — vendas e fiado consomem estoque, e o lucro vem da diferença entre venda e custo.

**Vendas.** A dona seleciona uma ou mais peças (com quantidade), o sistema dá **baixa automática no estoque**, e ela registra a forma de pagamento e a data. Uma venda pode ser paga na hora (dinheiro, pix, cartão) ou ser um fiado.

**Fiado (clientes / cobrança).** Quando a venda é fiado, além de dar baixa no estoque, o sistema registra a dívida: nome da pessoa, os produtos que ela levou, a data combinada para acerto, a frequência de pagamento (semanal, quinzenal ou mensal) e a quantidade de parcelas. A dona acompanha quem está em atraso e marca parcelas como pagas. Na prática, este é o módulo de "clientes" da loja — a lista de quem comprou e o que deve.

**Resumo financeiro (Final).** Contabiliza automaticamente as entradas (dinheiro recebido) e o lucro (valor a vender menos valor pago, sobre o que foi vendido), além de mostrar o que ainda há a receber de fiado.

### Decisão central: Venda e Fiado são o mesmo "evento" por baixo

Em vez de tratar Venda e Fiado como dois sistemas separados (o que duplicaria a baixa de estoque e o registro de produtos), o modelo é unificado:

- Uma **venda** sempre registra os produtos, dá baixa no estoque e calcula o total.
- Se a forma de pagamento for à vista, ela já conta como entrada imediata.
- Se a forma de pagamento for **fiado**, a mesma venda gera adicionalmente um **registro de fiado** com as condições de parcelamento, e a entrada vai acontecendo conforme as parcelas são pagas.

Na interface, isso aparece como **dois fluxos distintos** ("Registrar venda" e "Registrar fiado"), porque é assim que a dona pensa — mas por baixo é o mesmo modelo de dados. Isso mantém a interface simples sem bagunçar a lógica.

---

## 3. Arquitetura do sistema

Arquitetura de três camadas, com fronteira clara entre a parte pública (landing page) e o sistema interno protegido por login.

```
┌─────────────────────────────────────────────────────────────┐
│  NAVEGADOR                                                    │
│   Landing page inf.amily (pública)   Sistema interno (login)  │
└───────────────┬───────────────────────────┬──────────────────┘
                │  HTTPS                       │  HTTPS + JWT (Bearer)
                ▼                             ▼
        ┌───────────────┐            ┌──────────────────┐
        │  FRONTEND      │  ──────►   │  BACKEND          │
        │  Next.js + TS  │  REST/JSON │  FastAPI (Python) │
        │  (Vercel)      │            │  (Render/Railway) │
        └───────┬────────┘            └─────────┬────────┘
                │  Supabase Auth                  │  Conexão Postgres
                │  (login/sessão/JWT)             │  + verificação do JWT
                ▼                                ▼
        ┌──────────────────────────────────────────────┐
        │  SUPABASE: Auth + PostgreSQL                    │
        └──────────────────────────────────────────────┘
```

O **frontend Next.js** cobre toda a interface — landing pública e telas internas. A autenticação acontece diretamente entre frontend e **Supabase Auth**. O **backend FastAPI** concentra toda a lógica de negócio (estoque, baixa de estoque na venda, cálculo de fiado/atraso, resumo financeiro) e **não tem tela de login própria** — apenas valida o JWT do Supabase em cada requisição protegida. O **Supabase** hospeda o banco e o serviço de autenticação.

> Decisão de arquitetura: o backend é um serviço **persistente** (não serverless), porque mantém conexão com o banco e executa transações com vários passos (baixa de estoque + criação de venda + criação de fiado precisam ser atômicas). Por isso Render/Railway/Fly.io, e a Vercel só para o frontend.

---

## 4. Stack técnica

Obrigatória conforme o projeto; bibliotecas recomendadas como orientação.

**Frontend** — Next.js (App Router) + TypeScript. Estilização enxuta (Tailwind CSS recomendado, sem componentes pesados), alvos de toque grandes. `@supabase/ssr` para sessão por cookies. Deploy na **Vercel**.

**Backend** — Python + **FastAPI** + Pydantic v2 (validação). Acesso ao banco via SQLAlchemy + `asyncpg` (ou `supabase-py`). **As operações de venda devem rodar em transação** (ver seção 17). `python-dateutil` para datas de parcela. `pyjwt` para verificar o JWT do Supabase. Deploy em **Render** (recomendado), com Railway/Fly.io como alternativas.

**Banco** — **Supabase PostgreSQL**, com RLS habilitado como defesa em profundidade.

**Deploy** — Frontend na Vercel; backend em Render/Railway/Fly.io; banco no Supabase. Todos com HTTPS por padrão.

---

## 5. Modelo do banco de dados

A autenticação é gerenciada pelo Supabase Auth (`auth.users`) e não precisa ser modelada. As entidades de domínio são quatro, com relações simples.

### Relações

```
products (1) ──< (N) sale_items (N) >── (1) sales
sales (1) ──── (0 ou 1) fiado_accounts
```

Uma venda (`sales`) tem vários itens (`sale_items`); cada item aponta para uma peça (`products`). Uma venda **fiado** tem exatamente um registro em `fiado_accounts`; vendas à vista não têm.

### Tabela `products` (Estoque)

| Campo            | Tipo            | Restrições              | Descrição                                  |
|------------------|-----------------|-------------------------|--------------------------------------------|
| `id`             | UUID            | PK                      | Identificador da peça.                     |
| `name`           | TEXT            | NOT NULL                | Nome da peça.                              |
| `cost_price`     | NUMERIC(10,2)   | NOT NULL, >= 0          | Valor pago na peça (custo).                |
| `sale_price`     | NUMERIC(10,2)   | NOT NULL, >= 0          | Valor a vender.                            |
| `stock_quantity` | INTEGER         | NOT NULL, >= 0          | Quantidade em estoque.                     |
| `created_at`     | TIMESTAMPTZ     | NOT NULL, default agora | Criação.                                   |
| `updated_at`     | TIMESTAMPTZ     | NOT NULL, default agora | Última atualização.                        |

### Tabela `sales` (Vendas)

| Campo            | Tipo            | Restrições                                  | Descrição                                          |
|------------------|-----------------|---------------------------------------------|----------------------------------------------------|
| `id`             | UUID            | PK                                          | Identificador da venda.                            |
| `sale_date`      | DATE            | NOT NULL                                    | Data da venda.                                     |
| `payment_method` | TEXT            | NOT NULL, ∈ {dinheiro, pix, cartao, fiado}  | Forma de pagamento.                                |
| `total_amount`   | NUMERIC(10,2)   | NOT NULL                                    | Soma dos itens pelo preço de venda (snapshot).     |
| `total_cost`     | NUMERIC(10,2)   | NOT NULL                                    | Soma dos custos dos itens (snapshot, p/ lucro).    |
| `created_at`     | TIMESTAMPTZ     | NOT NULL, default agora                     | Criação.                                           |

`total_amount` e `total_cost` são calculados no momento da venda a partir dos itens e gravados (denormalizados) para o resumo financeiro ser rápido e o histórico ser estável mesmo que preços mudem depois.

### Tabela `sale_items` (itens da venda)

| Campo             | Tipo            | Restrições               | Descrição                                       |
|-------------------|-----------------|--------------------------|-------------------------------------------------|
| `id`              | UUID            | PK                       | Identificador do item.                          |
| `sale_id`         | UUID            | FK → sales, NOT NULL     | Venda à qual o item pertence.                   |
| `product_id`      | UUID            | FK → products, NOT NULL  | Peça vendida.                                   |
| `quantity`        | INTEGER         | NOT NULL, > 0            | Quantidade vendida.                             |
| `unit_sale_price` | NUMERIC(10,2)   | NOT NULL                 | Preço de venda **no momento da venda** (snapshot). |
| `unit_cost_price` | NUMERIC(10,2)   | NOT NULL                 | Custo **no momento da venda** (snapshot).       |

O snapshot de preços é essencial: se a dona alterar o preço de uma peça depois, as vendas passadas e o lucro histórico **não** podem mudar.

### Tabela `fiado_accounts` (Fiado / clientes)

| Campo                    | Tipo            | Restrições                              | Descrição                                                   |
|--------------------------|-----------------|-----------------------------------------|-------------------------------------------------------------|
| `id`                     | UUID            | PK                                      | Identificador do fiado.                                     |
| `sale_id`                | UUID            | FK → sales, NOT NULL, UNIQUE (1:1)      | Venda que originou o fiado (contém os produtos levados).    |
| `customer_name`          | TEXT            | NOT NULL                                | Nome da pessoa.                                             |
| `frequency`              | TEXT            | NOT NULL, ∈ {weekly, biweekly, monthly} | Frequência: semanal, quinzenal, mensal.                     |
| `installments_count`     | INTEGER         | NOT NULL, > 0                           | Quantidade de parcelas.                                     |
| `installment_amount`     | NUMERIC(10,2)   | NOT NULL                                | Valor da parcela (auto = total ÷ quantidade; ver seção 17). |
| `agreed_settlement_date` | DATE            | NOT NULL                                | Data combinada para acerto (referência fixa).               |
| `next_due_date`          | DATE            | NOT NULL                                | Próxima parcela a vencer (avança a cada pagamento).         |
| `remaining_balance`      | NUMERIC(10,2)   | NOT NULL, >= 0                          | Saldo restante (começa no total da venda).                  |
| `created_at`             | TIMESTAMPTZ     | NOT NULL, default agora                 | Criação.                                                    |
| `updated_at`             | TIMESTAMPTZ     | NOT NULL, default agora                 | Última atualização.                                         |

`next_due_date` é inicializado com a `agreed_settlement_date` e avança pela frequência a cada parcela paga. O `remaining_balance` começa igual ao `total_amount` da venda.

### Status do fiado (derivado, NÃO armazenado)

Calculado em leitura a partir de `next_due_date` e `remaining_balance`, comparando com a data atual no fuso da loja:
- **Quitado**: `remaining_balance <= 0`.
- **Em atraso**: `next_due_date < hoje` E `remaining_balance > 0`.
- **A vencer em breve**: `next_due_date` nos próximos N dias (sugestão 7) E `remaining_balance > 0`.
- **Em dia**: demais casos com saldo > 0.

### Números do Resumo financeiro (derivados, calculados sob demanda)

Nenhuma tabela nova; tudo é calculado a partir de `sales`, `sale_items` e `fiado_accounts`:
- **Lucro sobre vendas** = Σ `(unit_sale_price − unit_cost_price) × quantity` em todos os `sale_items`. (Ou seja: valor a vender menos valor pago, somado em tudo que saiu.)
- **Total vendido** = Σ `sales.total_amount`.
- **Recebido (entradas)** = Σ `total_amount` das vendas à vista + Σ `(total_amount − remaining_balance)` dos fiados.
- **A receber (fiado em aberto)** = Σ `fiado_accounts.remaining_balance`.

---

## 6. Estrutura de pastas

Repositório com duas pastas de topo (frontend e backend), cada uma com seu deploy.

```
inf-amily/                     # (marca exibida: inf.amily)
├── frontend/                  # Next.js (Vercel)
│   ├── app/
│   │   ├── (public)/
│   │   │   └── page.tsx               # Landing page inf.amily (/)
│   │   ├── (internal)/                # Grupo protegido por login
│   │   │   ├── layout.tsx             # Guarda de sessão + navegação
│   │   │   ├── dashboard/page.tsx     # Atrasos + a vencer + estoque baixo
│   │   │   ├── estoque/
│   │   │   │   ├── page.tsx           # Lista de peças
│   │   │   │   ├── nova/page.tsx      # Cadastro de peça
│   │   │   │   └── [id]/page.tsx      # Detalhe / edição da peça
│   │   │   ├── vendas/
│   │   │   │   ├── page.tsx           # Histórico de vendas
│   │   │   │   ├── nova/page.tsx      # Registrar venda (à vista)
│   │   │   │   └── fiado/page.tsx     # Registrar venda fiado
│   │   │   ├── fiado/
│   │   │   │   ├── page.tsx           # Lista de fiados (clientes / cobrança)
│   │   │   │   └── [id]/page.tsx      # Detalhe do fiado + marcar parcela paga
│   │   │   └── resumo/page.tsx        # Resumo financeiro (Final)
│   │   ├── login/page.tsx             # Login administrativo
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── components/
│   ├── lib/
│   │   ├── api.ts                     # Cliente HTTP (anexa JWT)
│   │   └── supabase.ts
│   ├── types/
│   ├── .env.local
│   └── package.json
│
└── backend/                   # FastAPI (Render/Railway/Fly.io)
    ├── app/
    │   ├── main.py                    # App + CORS
    │   ├── config.py
    │   ├── database.py
    │   ├── auth.py                    # Verificação de JWT
    │   ├── models/                    # products, sales, sale_items, fiado
    │   ├── schemas/                   # Schemas Pydantic
    │   ├── routers/
    │   │   ├── products.py
    │   │   ├── sales.py
    │   │   ├── fiado.py
    │   │   ├── dashboard.py
    │   │   └── summary.py
    │   └── services/
    │       ├── stock.py               # Baixa/validação de estoque
    │       ├── payments.py            # Pagamento de parcela + avanço de data
    │       ├── status.py              # Status derivado
    │       └── finance.py             # Cálculo do resumo
    ├── requirements.txt
    └── .env
```

---

## 7. Páginas necessárias

A **Landing page** (`/`, pública) é a porta de entrada da marca inf.amily. No MVP ela contém: o nome/identidade da loja, a frase de efeito **"por família – pra família"**, informações básicas da loja, um botão de WhatsApp/contato, e um **acesso administrativo discreto** (link para o login). Não exibe nenhum dado interno. Deve ser estruturada de forma que, no futuro, comporte uma **vitrine de peças disponíveis** — mas essa vitrine **não é construída agora** (ver seção 14). Quando for, ela pode reaproveitar os dados do estoque (`products`) numa visão pública e somente leitura.

A **tela de login** (`/login`, pública) — login administrativo com e-mail e senha e botão entrar. Acessada a partir do link discreto na landing. Após sucesso, redireciona ao dashboard.

O **dashboard** (`/dashboard`, protegido) — primeira tela após login: fiados **em atraso** no topo (vermelho), depois fiados **a vencer em breve**, e um aviso simples de **peças com estoque baixo ou zerado**. Sem gráficos.

**Estoque** — lista de peças (`/estoque`) mostrando nome, preço de venda e quantidade (com destaque para estoque baixo); cadastro (`/estoque/nova`) com nome, valor pago, valor a vender e quantidade; detalhe/edição (`/estoque/[id]`) dos mesmos campos.

**Vendas** — registrar venda à vista (`/vendas/nova`): selecionar peças e quantidades, ver o total se atualizando, escolher forma de pagamento e data, confirmar (dá baixa no estoque); registrar fiado (`/vendas/fiado`): mesma seleção de peças, mais nome da pessoa, data combinada, frequência e quantidade de parcelas; histórico de vendas (`/vendas`) em lista simples.

**Fiado / clientes** — lista de fiados (`/fiado`), que é a tela de clientes/cobrança: quem deve, status (atraso/a vencer/quitado), próxima data e saldo; detalhe (`/fiado/[id]`): produtos levados, condições, saldo, próxima data, e o botão "Marcar parcela como paga".

**Resumo financeiro** (`/resumo`, protegido) — quatro números diretos: lucro sobre vendas, total vendido, recebido (entradas) e a receber. Filtro de período simples (opcional) sobre as vendas.

---

## 8. Endpoints do backend (FastAPI)

Todos os endpoints de dados exigem JWT válido do Supabase em `Authorization: Bearer <token>`. **Não há endpoint de login no backend** — o login é feito no frontend contra o Supabase Auth.

### Estoque
| Método | Rota                      | Descrição                                                        |
|--------|---------------------------|------------------------------------------------------------------|
| GET    | `/api/products`           | Lista as peças (com indicação de estoque baixo).                 |
| POST   | `/api/products`           | Cadastra peça (nome, custo, preço de venda, quantidade).         |
| GET    | `/api/products/{id}`      | Detalhe da peça.                                                 |
| PATCH  | `/api/products/{id}`      | Edita peça (inclui ajuste manual de estoque).                    |
| DELETE | `/api/products/{id}`      | Remove peça (bloqueado/avisado se houver histórico de vendas).   |

### Vendas
| Método | Rota                      | Descrição                                                                                   |
|--------|---------------------------|---------------------------------------------------------------------------------------------|
| GET    | `/api/sales`              | Lista vendas (filtro opcional por período).                                                 |
| POST   | `/api/sales`              | Cria uma venda: itens (peça + quantidade) + forma de pagamento + data. **Em transação**: valida estoque, dá baixa, faz snapshot de preços, calcula totais. Se `payment_method = fiado`, cria também o registro de fiado com as condições recebidas. |
| GET    | `/api/sales/{id}`         | Detalhe da venda com itens.                                                                 |

### Fiado
| Método | Rota                      | Descrição                                                                                  |
|--------|---------------------------|--------------------------------------------------------------------------------------------|
| GET    | `/api/fiado`              | Lista os fiados com status derivado (clientes / cobrança).                                 |
| GET    | `/api/fiado/{id}`         | Detalhe: cliente, produtos levados, condições, saldo, próxima data.                        |
| PATCH  | `/api/fiado/{id}`         | Edita cliente/condições do fiado.                                                          |
| POST   | `/api/fiado/{id}/pay`     | Registra pagamento de parcela: reduz saldo pelo valor da parcela (sem ficar negativo) e avança a próxima data se ainda houver saldo. |

### Dashboard e Resumo
| Método | Rota                      | Descrição                                                                          |
|--------|---------------------------|------------------------------------------------------------------------------------|
| GET    | `/api/dashboard`          | Fiados em atraso + a vencer em breve + peças com estoque baixo/zerado.             |
| GET    | `/api/summary`            | Resumo financeiro: lucro, total vendido, recebido, a receber (params de período opcionais). |
| GET    | `/health`                 | Verificação de saúde (não protegido).                                              |

---

## 9. Componentes principais do frontend

O **LandingHero** com a identidade inf.amily e a copy "por família – pra família", e o **AdminAccessLink** (link discreto para o login). Estrutura preparada para receber, no futuro, uma seção de vitrine de peças.

O **AuthGuard / layout protegido** verifica a sessão antes de renderizar telas internas.

O **ProductForm** (cadastro e edição de peça) e o **ProductListItem** (linha da lista de estoque); o **StockBadge** sinaliza estoque baixo/zerado.

O **SaleForm** com um **ProductPicker** (selecionar peças e quantidades, com total se atualizando em tempo real), **PaymentMethodSelect** e seletor de data. Reutilizado pelos fluxos de venda à vista e de fiado, com campos extras de fiado quando aplicável.

O **FiadoForm** (nome da pessoa, data combinada, frequência, quantidade de parcelas), o **FiadoListItem** e o **PayInstallmentButton** (marcar parcela como paga, com confirmação simples).

O **StatusBadge** reaproveitado (vermelho para atraso, âmbar para a vencer, neutro para em dia, discreto para quitado).

Os **SummaryCards** do resumo financeiro: um cartão grande e legível por número (lucro, total vendido, recebido, a receber).

O **api client** (`lib/api.ts`) centraliza chamadas ao backend anexando o JWT.

---

## 10. Fluxo de autenticação

Supabase Auth como provedor de identidade, sem o backend gerenciar senha. A entrada acontece pela landing pública.

1. O visitante chega na landing pública da inf.amily. Para entrar no sistema, a dona usa o acesso administrativo discreto, que leva a `/login`.
2. Em `/login`, informa e-mail e senha; o frontend envia ao Supabase Auth, que retorna um access token (JWT) e um refresh token.
3. A sessão é guardada com `@supabase/ssr`, preferindo cookies a `localStorage`.
4. Ao entrar na área interna, qualquer rota protegida verifica a sessão; sem sessão válida, redireciona de volta para `/login`.
5. Cada chamada ao backend leva o access token em `Authorization: Bearer`. O backend verifica o JWT (assinatura, expiração, emissor/audiência) contra o segredo/JWKS do Supabase. Inválido ou ausente → 401.
6. O refresh token renova a sessão automaticamente ao expirar.
7. Logout encerra a sessão e volta à landing.

Apenas uma usuária autorizada: a conta da Yasmin é criada uma vez no painel do Supabase e o **auto-cadastro de usuários fica desabilitado**.

---

## 11. Regras de segurança

Cobrem dados de estoque, vendas e clientes.

**HTTPS em todo o tráfego** — Vercel, Render/Railway/Fly.io e Supabase fornecem TLS por padrão; nenhuma rota aceita HTTP puro.

**Autenticação delegada ao Supabase Auth** — senhas tratadas/armazenadas (com hash) pelo Supabase; o sistema nunca implementa isso por conta própria. Auto-cadastro desabilitado.

**Verificação de JWT no backend em toda rota protegida** — principal barreira de autorização; sem token válido, nenhuma operação executa.

**Separação rígida de segredos** — o frontend só conhece URL e chave anônima do Supabase. A **chave de serviço e a string de conexão do banco vivem apenas no backend**, em variáveis de ambiente do provedor, nunca expostas ao navegador.

**CORS restrito** — o backend só aceita requisições do domínio do frontend.

**RLS habilitado como defesa em profundidade** — sendo honesto: como o backend usa a chave de serviço, o RLS é contornado nesse caminho; a proteção real é manter a chave secreta, verificar o JWT e restringir o CORS. Ainda assim, RLS habilitado é uma rede de segurança caso algum acesso passe pela chave anônima ou conexão direta.

**Validação de entrada com Pydantic** — tipos, obrigatoriedade, valores de frequência e forma de pagamento permitidos, valores não negativos, quantidade de parcelas > 0.

**Dados sensíveis fora do frontend** — nenhum dado de cliente ou financeiro em código do frontend, parâmetros de URL ou logs. A landing pública não acessa nenhum dado interno.

---

## 12. Roadmap de implementação

Sequência priorizando ter o ciclo estoque → venda → baixa funcionando cedo, porque tudo depende do estoque.

**Fase 0 — Fundação.** Projeto no Supabase (banco + Auth), conta única da Yasmin, variáveis de ambiente, esqueletos de frontend (Vercel) e backend (Render), `/health` respondendo.

**Fase 1 — Autenticação.** Login administrativo com Supabase Auth, sessão via `@supabase/ssr`, guarda de rotas e verificação de JWT no backend.

**Fase 2 — Estoque.** Tabela `products` e CRUD de peças. Critério de pronto: a dona cadastra, lista e edita peças com custo, preço de venda e quantidade.

**Fase 3 — Vendas (à vista).** Tabelas `sales` e `sale_items`; registrar venda com seleção de peças, baixa de estoque em transação, snapshot de preços e cálculo de totais. Critério de pronto: registrar uma venda reduz o estoque corretamente e a venda aparece no histórico.

**Fase 4 — Fiado.** Tabela `fiado_accounts`; fluxo de venda fiado (mesma baixa de estoque + criação do fiado) e pagamento de parcela (saldo + avanço de data + status). Critério de pronto: registrar fiado, ver na cobrança, marcar parcela como paga e ver o status mudar.

**Fase 5 — Dashboard.** Atrasos no topo (vermelho), a vencer em breve e aviso de estoque baixo.

**Fase 6 — Resumo financeiro.** Endpoint e tela com lucro, total vendido, recebido e a receber.

**Fase 7 — Landing page + endurecimento + deploy.** Landing pública da inf.amily com a copy "por família – pra família", contato/WhatsApp e acesso administrativo discreto (a vitrine de peças fica para depois). Revisão de CORS/segredos/RLS/HTTPS, teste do fluxo completo em produção e ajustes de usabilidade para a usuária não técnica.

> A landing é simples no MVP (identidade + copy + acesso ao login), então pode ser adiantada se você preferir começar pela cara pública. Mesmo assim, o que entrega valor de operação é o ciclo interno, então o estoque continua sendo a prioridade real.

---

## 13. MVP v1 (escopo)

O que entra no primeiro release:

1. Landing page pública da inf.amily com a copy "por família – pra família", informações básicas, contato/WhatsApp e acesso administrativo discreto.
2. Login administrativo seguro (usuária única) via Supabase Auth.
3. Estoque: cadastrar, listar e editar peças com custo, preço de venda e quantidade.
4. Vendas à vista: selecionar peças, dar baixa automática no estoque, registrar forma de pagamento e data.
5. Fiado/clientes: venda a prazo com baixa de estoque, registro de cliente, produtos levados, data combinada, frequência e quantidade de parcelas; cobrança com status de atraso e botão de marcar parcela como paga.
6. Dashboard com atrasos, a vencer e estoque baixo.
7. Resumo financeiro com lucro, total vendido, recebido e a receber.
8. HTTPS, verificação de JWT, CORS restrito, segredos separados e RLS habilitado.

Tudo mantido tão simples quanto possível em telas e fluxos.

---

## 14. Melhorias futuras

Deliberadamente adiadas:

1. **Vitrine de peças na landing** — seção pública (somente leitura) mostrando peças disponíveis, reaproveitando os dados do estoque. Explicitamente fora do MVP.
2. **Histórico de pagamentos** (tabela de lançamentos) — habilita desfazer um pagamento lançado por engano e relatórios financeiros por período com precisão (incluindo os recebimentos de fiado, que no MVP entram só como total).
3. **Devolução / cancelamento de venda** — estornar uma venda e devolver as peças ao estoque.
4. **Variações de produto** (tamanho, cor, SKU, código de barras) e leitura por câmera/scanner.
5. **Alertas e notificações** de estoque baixo e de parcelas a vencer (e-mail/WhatsApp).
6. **Lembretes de cobrança por WhatsApp** e link de "enviar WhatsApp" por cliente.
7. **Arquivar peças e clientes** (soft delete) preservando histórico.
8. **Busca e paginação** em estoque, vendas e fiado quando o volume crescer.
9. **Relatórios e gráficos** (vendas por período, peças mais vendidas) — fora do MVP por simplicidade.
10. **Multiusuário / multiloja** e **app mobile / PWA**.

---

## 15. O que evitar para não deixar o sistema complexo demais

Trava de complexidade — o agente de desenvolvimento deve resistir ativamente ao seguinte.

**Não construir a vitrine de peças agora.** A landing do MVP é identidade + copy + acesso ao login. A exibição pública de peças é futura.

**Não duplicar a lógica de venda e fiado.** Fiado é uma venda com pagamento a prazo; usar o modelo unificado (seção 2) em vez de dois caminhos separados que dão baixa no estoque.

**Não armazenar status nem totais que possam ficar desatualizados.** Status de fiado e números do resumo são derivados em leitura.

**Não construir um sistema contábil completo.** O resumo são quatro números diretos (lucro, total vendido, recebido, a receber), não um livro-caixa com categorias e relatórios.

**Não permitir venda sem estoque.** Validar a disponibilidade antes de confirmar a venda; bloquear se faltar peça.

**Não recalcular lucro a partir dos preços atuais.** Usar os preços gravados no momento da venda (snapshot), senão alterar um preço bagunça o histórico.

**Não criar variações de produto, categorias ou códigos de barras no MVP.** Peça é só nome, custo, preço e quantidade.

**Não inventar autenticação própria** — usar o Supabase Auth.

**Não exagerar no estado do frontend** — estado local de React e busca de dados do servidor bastam; sem Redux.

**Não usar UI pesada nem telas densas** — interface plana, poucos campos por tela, botões grandes, pensada para usuária não técnica.

**Não fazer hard delete de peça com vendas** nem tratar exclusão como recurso central; o caminho recomendado a longo prazo é arquivar.

**Não expor segredos no frontend** — chave de serviço e conexão do banco só no backend.

---

## 16. Notas de implementação críticas (gotchas)

Pontos sutis que costumam ser implementados errado.

**Atomicidade da venda (transação).** Registrar uma venda envolve vários passos: validar estoque, dar baixa em cada item, gravar a venda e seus itens e — se for fiado — criar o registro de fiado. Tudo isso deve rodar em **uma única transação no banco**: se qualquer passo falhar (ex.: estoque insuficiente no meio), nada é gravado e o estoque não é alterado.

**Snapshot de preços.** Gravar `unit_sale_price` e `unit_cost_price` no item da venda no momento em que ela ocorre. O lucro histórico se baseia nesses valores, não no preço atual da peça.

**Validação de estoque antes da baixa.** Se a quantidade pedida for maior que a disponível, bloquear a venda com mensagem clara. O estoque nunca fica negativo.

**Valor da parcela e arredondamento.** `installment_amount = total ÷ quantidade de parcelas`. Quando não divide exato, arredondar para 2 casas e fazer a **última parcela absorver a diferença**, para que a soma das parcelas bata com o total. O saldo nunca fica negativo: na última parcela, zerar em vez de permitir valor negativo.

**Avanço de data mensal e fim de mês.** Somar "1 mês" não é somar 30 dias — usar rotina de calendário (`relativedelta`), para que uma parcela de 31/jan vá para o último dia de fevereiro, não estourar para março. Semanal (+7) e quinzenal (+14) são aritmética de dias simples.

**Data não avança após quitação.** Só avançar `next_due_date` se ainda houver saldo após o pagamento.

**Fuso horário no cálculo de atraso.** "Hoje" é determinado no fuso da loja (`America/Sao_Paulo`), não em UTC, para a comparação com `next_due_date` (que é uma data sem hora) não errar por algumas horas.

**Definição de lucro (regime de competência).** O "lucro sobre vendas" conta a margem assim que a peça sai (incluindo fiado ainda não recebido). O quanto realmente entrou em dinheiro é mostrado separadamente em "recebido", e o que falta receber em "a receber". Se a dona preferir considerar lucro só sobre o que já foi pago, essa é uma decisão a ajustar antes do desenvolvimento.

**Formatação monetária.** Armazenar valores como decimal no banco; formatar como R$ no frontend, com vírgula decimal (padrão pt-BR). Não fazer cálculo financeiro com ponto flutuante impreciso.

**Confirmação em ações que alteram dados.** Marcar parcela paga, confirmar venda e excluir peça devem ter confirmação simples para evitar cliques acidentais, sem encher a tela de avisos.
