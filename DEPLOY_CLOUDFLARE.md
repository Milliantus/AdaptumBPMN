## Деплой “самый дешёвый/быстрый” (Cloudflare Pages + Functions, бесплатно)

Render действительно часто просит карту/план. Вариант ниже работает на **бесплатном** Cloudflare:
один URL `https://<project>.pages.dev` и для виджета, и для OAuth/API.

### 0) Что получится по URL

- Статика виджета: `https://<project>.pages.dev/widget/...`
- OAuth старт: `https://<project>.pages.dev/oauth/start?base_domain=https://xxx.amocrm.ru`
- OAuth callback (его надо указать в amoCRM): `https://<project>.pages.dev/oauth/callback`

### 1) Cloudflare Pages → создать проект

1. Зарегистрируйся на Cloudflare.
2. Cloudflare Dashboard → **Workers & Pages** → **Pages** → **Create a project**
3. Подключи GitHub и выбери репозиторий `Milliantus/AdaptumBPMN`
4. Настройки сборки:
   - **Framework preset**: `None`
   - **Build command**: пусто
   - **Build output directory**: `public`

Нажми Deploy. Получишь URL вида `https://adaptum-bpmn.pages.dev`.

### 2) KV хранилище для токенов (бесплатно)

1. Cloudflare → **Workers & Pages** → **KV** → **Create a namespace**
   - Name: `ADAPTUM_BPMN_TOKENS`
2. Открой Pages project → **Settings** → **Functions** → **KV namespace bindings**
   - Variable name: `TOKENS_KV`
   - KV namespace: `ADAPTUM_BPMN_TOKENS`

### 3) Переменные окружения (Pages → Settings → Environment variables)

Добавь (в Production):

- `PUBLIC_BASE_URL` = `https://<project>.pages.dev`
- `AMO_CLIENT_ID` = из amoCRM (интеграция/маркетплейс)
- `AMO_CLIENT_SECRET` = из amoCRM
- `TOKENS_SECRET` = любая длинная случайная строка (можно взять из чата)

### 4) Настроить Redirect URL в amoCRM

В интеграции amoCRM укажи Redirect:

`https://<project>.pages.dev/oauth/callback`

### 5) Установка виджета

1. Собери архив (если нужно):

```powershell
cd "D:\Adaptum BPMN"
.\package-widget.ps1
```

2. Загрузи `widget.zip` в amoCRM.
3. В настройках виджета укажи:
   - **URL сервера (HTTPS)** = `https://<project>.pages.dev`

