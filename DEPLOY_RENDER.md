## Деплой “самый быстрый/дешёвый” (Render + HTTPS)

Этот вариант даёт бесплатный HTTPS URL вида `https://xxx.onrender.com` — домен покупать не надо.

### 1) Залить проект в GitHub

1. Создай новый репозиторий на GitHub (пустой).
2. В этой папке (`D:\Adaptum BPMN`) выполни команды:

```bash
git init
git add .
git commit -m "init amoCRM widget + server"
git branch -M main
git remote add origin <URL_твоего_репозитория>
git push -u origin main
```

### 2) Создать сервис на Render

1. Зайди в Render → **New** → **Blueprint**
2. Выбери репозиторий GitHub
3. Render прочитает `render.yaml` и создаст сервис

После создания открой сервис и скопируй его URL, например:

`https://adaptum-bpmn.onrender.com`

### 3) Прописать переменные окружения (Render → Environment)

- `PUBLIC_BASE_URL` = URL сервиса (например `https://adaptum-bpmn.onrender.com`)
- `AMO_CLIENT_ID` = из amoCRM developer/marketplace
- `AMO_CLIENT_SECRET` = из amoCRM developer/marketplace
- `TOKENS_SECRET` = сгенерируй командой локально:

```bash
cd server
npm i
npm run gen:secret
```

Скопируй вывод в переменную `TOKENS_SECRET`.

### 4) Настроить Redirect URL в amoCRM

В карточке интеграции укажи redirect:

`{PUBLIC_BASE_URL}/oauth/callback`

Пример:

`https://adaptum-bpmn.onrender.com/oauth/callback`

### 5) Установить виджет

1. Собери архив:

```powershell
.\package-widget.ps1
```

2. Загрузи `widget.zip` в amoCRM (виджеты/интеграции).
3. В настройках виджета укажи:
   - **URL сервера (HTTPS)** = `{PUBLIC_BASE_URL}`

После этого вкладка **“Процессы”** появится в расширенных настройках виджета.

