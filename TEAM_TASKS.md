# 📋 ТЗ для команды — Smart City AI Core

**Дата:** 15.02.2026  
**Ревьюер:** Амир  
**Репозиторий:** `https://github.com/Beksanoff/smart-city-ai`

---

## 🔧 Инструкция по работе с проектом (для всех) 

### 1. Скачать проект (один раз)

```bash
# Клонировать репо
git clone https://github.com/Beksanoff/smart-city-ai.git
cd smart-city-ai

# Проверить что всё скачалось
ls -la
# Должны быть: backend-go/  frontend-react/  ml-python/  docker-compose.yml  ...
```

### 2. Создать свою ветку (ОБЯЗАТЕЛЬНО перед началом работы)

```bash
# Убедиться что ты на main
git checkout main
git pull origin main

# Создать свою ветку от main
# Формат: feature/имя-задачи
git checkout -b feature/имя-ветки

# Примеры:
# git checkout -b feature/bakhtiyar-ml-security
# git checkout -b feature/roman-analytics-charts
# git checkout -b feature/marlen-nginx-docker
# git checkout -b feature/dima-design-fixes
```

### 3. Запустить проект для тестирования

```bash
# Поставить Docker если не стоит: https://docs.docker.com/get-docker/
# Запустить все 4 сервиса
sudo docker compose up -d --build

# Проверить что контейнеры работают
sudo docker compose ps
# Все 4 должны быть "Up" и "(healthy)"
```

**Адреса для проверки:**
| Сервис | URL | Что увидишь |
|--------|-----|-------------|
| Фронтенд | http://localhost:3000 | Дашборд с картой |
| Бэкенд API | http://localhost:8080/health | `{"status":"ok"}` |
| ML сервис | http://localhost:8000/health | `{"status":"ok"}` |
| API погоды | http://localhost:8080/api/v1/weather | JSON с данными |
| API трафика | http://localhost:8080/api/v1/traffic | JSON с данными |

### 4. Внести изменения и закоммитить

```bash
# Посмотреть что изменилось
git status

# Добавить файлы в коммит
git add .

# Закоммитить с понятным сообщением
git commit -m "fix: описание что сделал"

# Примеры хороших коммитов:
# git commit -m "fix: ML CORS security — restrict origins"
# git commit -m "feat: analytics charts use real API data"
# git commit -m "fix: nginx security headers added"
```

### 5. Запушить и создать Pull Request

```bash
# Запушить свою ветку на GitHub
git push origin feature/имя-ветки

# Пример:
# git push origin feature/bakhtiyar-ml-security
```

После пуша:
1. Открой GitHub в браузере → раздел **Pull Requests**
2. Нажми **"New Pull Request"**
3. Выбери: `base: main` ← `compare: feature/твоя-ветка`
4. Напиши что сделал
5. Назначь **Амира** ревьюером (Reviewers → Beksanoff)
6. Нажми **"Create Pull Request"**

### 6. Как проверять свои изменения

```bash
# После изменений — пересобрать
sudo docker compose up -d --build

# Смотреть логи нужного сервиса
sudo docker compose logs -f backend-go    # логи бэкенда
sudo docker compose logs -f ml-python     # логи ML
sudo docker compose logs -f frontend      # логи фронта

# Проверить API через терминал
curl http://localhost:8080/api/v1/weather | python3 -m json.tool
curl http://localhost:8080/api/v1/traffic | python3 -m json.tool
curl -X POST http://localhost:8080/api/v1/predict \
  -H "Content-Type: application/json" \
  -d '{"query":"Как дороги завтра?"}' | python3 -m json.tool

# Остановить проект
sudo docker compose down
```

---

## 👤 БАХТИЯР — ML-сервис (Python) + валидация на бэкенде

**Ветка:** `feature/bakhtiyar-ml-security`  
**Файлы:** `ml-python/main.py`, `ml-python/services/logic.py`, `backend-go/internal/delivery/http/handlers.go`

### Задача 1 — КРИТИЧНО: Исправить CORS в ML-сервисе

**Файл:** `ml-python/main.py`, строки 27–32

**Сейчас (ПЛОХО):**
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # ← Любой сайт может слать запросы
    allow_credentials=True,       # ← Вместе со звёздочкой — дыра безопасности
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**Нужно заменить на:**
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://smartcity-backend:8080",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)
```

**Почему:** `allow_origins=["*"]` + `allow_credentials=True` — это прямая уязвимость. Любой сайт в интернете может слать запросы к нашему ML-сервису от имени пользователя.

---

### Задача 2 — КРИТИЧНО: Убрать утечку ошибок в ML

**Файл:** `ml-python/main.py`, строки 84–85 и 93–94

**Сейчас (ПЛОХО):**
```python
except Exception as e:
    logger.error(f"Prediction error: {e}")
    raise HTTPException(status_code=500, detail=str(e))  # ← Утечка внутренних ошибок!
```

**Нужно заменить на:**
```python
except Exception as e:
    logger.error(f"Prediction error: {e}")
    raise HTTPException(
        status_code=500,
        detail="Ошибка при генерации прогноза. Попробуйте позже."
    )
```

Аналогично для `/stats` (строка 94):
```python
except Exception as e:
    logger.error(f"Stats error: {e}")
    raise HTTPException(
        status_code=500,
        detail="Ошибка при получении статистики."
    )
```

**Почему:** `detail=str(e)` отправляет клиенту полный текст ошибки Python — путь к файлам, стек-трейс, имена переменных. Хакер может использовать это для атаки.

---

### Задача 3 — ВЫСОКИЙ: Groq SDK блокирует event loop

**Файл:** `ml-python/services/logic.py`, строки 188–196

**Сейчас (ПЛОХО):**
```python
response = self.groq_client.chat.completions.create(
    model="llama-3.1-8b-instant",
    messages=[...],
    max_tokens=200,
    temperature=0.7
)
```

Это **синхронный** вызов внутри `async def`. Из-за этого FastAPI зависает на 3-10 секунд для ВСЕХ пользователей пока ждёт Groq.

**Нужно заменить на:**
```python
import asyncio

# ... внутри метода _get_groq_prediction:
response = await asyncio.to_thread(
    self.groq_client.chat.completions.create,
    model="llama-3.1-8b-instant",
    messages=[
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ],
    max_tokens=200,
    temperature=0.7
)
```

**Как проверить:** Открой два терминала и одновременно отправь два запроса:
```bash
# Терминал 1
time curl -X POST http://localhost:8000/predict -H "Content-Type: application/json" -d '{"query":"test1"}'
# Терминал 2
time curl -X POST http://localhost:8000/predict -H "Content-Type: application/json" -d '{"query":"test2"}'
```
До фикса: второй ждёт пока первый закончится (6+ сек). После: оба завершаются примерно одновременно (~3 сек).

---

### Задача 4 — СРЕДНИЙ: Валидация запроса predict на бэкенде

**Файл:** `backend-go/internal/delivery/http/handlers.go`, найди функцию `Predict`

Сейчас запрос парсится, но никак не проверяется. Добавь проверку **после** `c.BodyParser(&req)`:

```go
// Валидация входных данных
if req.Query != "" && len(req.Query) > 1000 {
    return fiber.NewError(fiber.StatusBadRequest, "Query too long (max 1000 chars)")
}
if req.Date != "" {
    if _, err := time.Parse("2006-01-02", req.Date); err != nil {
        return fiber.NewError(fiber.StatusBadRequest, "Invalid date format, use YYYY-MM-DD")
    }
}
if req.Temperature != 0 && (req.Temperature < -50 || req.Temperature > 55) {
    return fiber.NewError(fiber.StatusBadRequest, "Temperature out of range (-50 to 55)")
}
```

Не забудь добавить `"time"` в импорты файла если его нет.

**Как проверить:**
```bash
# Должен вернуть 400 ошибку
curl -X POST http://localhost:8080/api/v1/predict \
  -H "Content-Type: application/json" \
  -d '{"date":"not-a-date"}'

# Должен тоже вернуть 400
curl -X POST http://localhost:8080/api/v1/predict \
  -H "Content-Type: application/json" \
  -d '{"temperature": 999}'
```

---

### Чеклист Бахтияра:
- [ ] CORS в ML ограничен конкретными origins
- [ ] Ошибки в ML не утекают наружу
- [ ] Groq вызывается через `asyncio.to_thread()`
- [ ] Валидация predict-запроса на бэкенде
- [ ] Все 4 контейнера запускаются и работают
- [ ] Создан Pull Request с ревьюером Амир

---

## 👤 РОМАН — Аналитика (Frontend) + .env.example

**Ветка:** `feature/roman-analytics-realdata`  
**Файлы:** `frontend-react/src/components/analytics/`, `frontend-react/src/services/api.ts`, корень проекта

### Задача 1 — ВЫСОКИЙ: Подключить AQIHistoryChart к реальным данным

**Файл:** `frontend-react/src/components/analytics/AQIHistoryChart.tsx`

Сейчас весь график — захардкоженный массив (строки 12–20):
```tsx
const data = [
    { day: 'Пн', aqi: 45, text: 'Хорошо' },
    { day: 'Вт', aqi: 52, text: 'Средне' },
    // ... 100% фейк
]
```

**Нужно:** Заменить на вызов API `/api/v1/history/weather?hours=168` (7 дней = 168 часов).

Пример реализации:
```tsx
import { useQuery } from '@tanstack/react-query'
import { api, Weather } from '../../services/api'

// ... внутри компонента:

export default function AQIHistoryChart() {
    const { data: weatherHistory = [], isLoading } = useQuery({
        queryKey: ['weatherHistory'],
        queryFn: () => api.getWeatherHistory(168),  // 7 дней
        refetchInterval: 60000,  // раз в минуту
    })

    // Группировка по дням — берём среднее AQI за каждый день
    const chartData = useMemo(() => {
        if (weatherHistory.length === 0) {
            // Fallback на статику если нет данных
            return [
                { day: 'Пн', aqi: 45 }, { day: 'Вт', aqi: 52 },
                // ...
            ]
        }

        const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
        const grouped = new Map<string, number[]>()

        weatherHistory.forEach(w => {
            const date = new Date(w.timestamp)
            const dayName = days[date.getDay()]
            if (!grouped.has(dayName)) grouped.set(dayName, [])
            grouped.get(dayName)!.push(w.aqi)
        })

        return Array.from(grouped.entries()).map(([day, values]) => ({
            day,
            aqi: Math.round(values.reduce((a, b) => a + b, 0) / values.length)
        }))
    }, [weatherHistory])

    if (isLoading) return <div className="cyber-card h-[300px] animate-pulse" />

    return (
        // ... остальной JSX такой же, но data={chartData} вместо data={data}
    )
}
```

**Как проверить:**
1. Открой http://localhost:3000 → вкладка "Аналитика"
2. Если система работает больше суток — данные будут реальными
3. Если нет — увидишь fallback (это нормально, напиши "(нет данных)" вместо "(Mock Data)")

---

### Задача 2 — ВЫСОКИЙ: Подключить CorrelationChart к ML-статистике

**Файл:** `frontend-react/src/components/analytics/CorrelationChart.tsx`

Сейчас захардкожены 6 месяцев (строки 14–20). ML-сервис умеет отдавать корреляцию через `GET http://localhost:8000/stats`.

1. Добавь в `api.ts` новый метод:
```typescript
getMLStats: async (): Promise<any> => {
    try {
        const response = await apiClient.get('/api/v1/stats')
        return response.data.data
    } catch {
        return null
    }
},
```

2. Для этого нужно добавить проксирование `/stats` через Go бэкенд, ИЛИ вызывать ML напрямую. Проще — сделать прямой вызов (т.к. stats — read-only):
```typescript
getMLStats: async (): Promise<any> => {
    try {
        const response = await axios.get('http://localhost:8000/stats')
        return response.data.data
    } catch {
        return null
    }
},
```

3. В CorrelationChart используй `useQuery` аналогично задаче 1.

---

### Задача 3 — ВЫСОКИЙ: Подключить TrafficByHourChart к реальным данным

**Файл:** `frontend-react/src/components/analytics/TrafficByHourChart.tsx`

Аналогично задаче 1, но вызываем `api.getTrafficHistory(24)` (24 часа) и группируем по часам.

```tsx
const { data: trafficHistory = [] } = useQuery({
    queryKey: ['trafficHistory'],
    queryFn: () => api.getTrafficHistory(24),
    refetchInterval: 60000,
})

const chartData = useMemo(() => {
    if (trafficHistory.length === 0) {
        return HOURLY_PATTERN.map((base, i) => ({
            hour: `${i}:00`, congestion: base
        }))
    }
    // Группировка реальных данных по часам
    const byHour = new Map<number, number[]>()
    trafficHistory.forEach(t => {
        const hour = new Date(t.timestamp).getHours()
        if (!byHour.has(hour)) byHour.set(hour, [])
        byHour.get(hour)!.push(t.congestion_index)
    })
    return Array.from({ length: 24 }, (_, i) => ({
        hour: `${i}:00`,
        congestion: byHour.has(i)
            ? Math.round(byHour.get(i)!.reduce((a, b) => a + b, 0) / byHour.get(i)!.length)
            : HOURLY_PATTERN[i]
    }))
}, [trafficHistory])
```

---

### Задача 4 — СРЕДНИЙ: Убрать "(Mock Data)" из заголовка аналитики

**Файл:** `frontend-react/src/components/analytics/AnalyticsDashboard.tsx`, строка 17

Заменить:
```tsx
<p className="text-sm text-cyber-muted">Исторические тренды и корреляции (Mock Data)</p>
```
На:
```tsx
<p className="text-sm text-cyber-muted">Исторические тренды и корреляции</p>
```

---

### Задача 5 — СРЕДНИЙ: Создать .env.example

**Файл:** Создай новый файл `.env.example` в корне проекта

```env
# Smart City AI Core — Environment Variables
# Скопируй этот файл: cp .env.example .env

# ===== Обязательные для реальных данных =====
# OpenWeatherMap (погода + AQI): https://openweathermap.org/appid
OPENWEATHER_API_KEY=

# TomTom (трафик): https://developer.tomtom.com
TOMTOM_API_KEY=

# Groq AI (LLM прогнозы): https://console.groq.com
GROQ_API_KEY=

# ===== Опциональные =====
# База данных
POSTGRES_USER=smartcity
POSTGRES_PASSWORD=change_me_password
POSTGRES_DB=smartcity_db

# Среда (development | production)
GO_ENV=development
```

---

### Чеклист Романа:
- [ ] AQIHistoryChart использует `api.getWeatherHistory(168)`
- [ ] CorrelationChart получает данные из `/stats` или API истории
- [ ] TrafficByHourChart использует `api.getTrafficHistory(24)`
- [ ] Все три графика показывают fallback если данных нет
- [ ] Удалён текст "(Mock Data)" из заголовка аналитики
- [ ] Создан `.env.example` в корне проекта
- [ ] Создан Pull Request с ревьюером Амир

---

## 👤 МАРЛЕН — Инфраструктура (Docker, Nginx, HTML)

**Ветка:** `feature/marlen-infra-security`  
**Файлы:** `frontend-react/nginx.conf`, `frontend-react/index.html`, `docker-compose.yml`, `.dockerignore` файлы

### Задача 1 — ВЫСОКИЙ: Security-заголовки в Nginx

**Файл:** `frontend-react/nginx.conf`

Сейчас nginx отдаёт страницы БЕЗ заголовков безопасности. Это значит: сайт можно вставить в iframe на другом сайте (clickjacking), браузер не защищён от XSS-атак.

Добавь внутрь блока `server { ... }` (после `index index.html;`):

```nginx
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
```

---

### Задача 2 — ВЫСОКИЙ: Nginx должен передавать реальный IP клиента

**Файл:** `frontend-react/nginx.conf`, блок `location /api { ... }`

Сейчас (строки 23–29):
```nginx
location /api {
    proxy_pass http://backend-go:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
}
```

**Нужно заменить на:**
```nginx
location /api {
    proxy_pass http://backend-go:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;

    # Таймауты для ML-прогнозов (могут занимать до 30 секунд)
    proxy_read_timeout 60s;
    proxy_connect_timeout 10s;
    proxy_send_timeout 10s;
}
```

**Почему:** Без `X-Real-IP` бэкенд видит все запросы как от nginx (127.0.0.1) и rate limiter (60 req/min) считает всех за одного пользователя!

---

### Задача 3 — ВЫСОКИЙ: Исправить `lang="en"` на `lang="ru"`

**Файл:** `frontend-react/index.html`, строка 2

Заменить:
```html
<html lang="en" class="dark">
```
На:
```html
<html lang="ru" class="dark">
```

**Почему:** Весь UI на русском, а `lang="en"` сбивает скринридеры и поисковики.

---

### Задача 4 — СРЕДНИЙ: Добавить restart политики и ресурсные лимиты в Docker

**Файл:** `docker-compose.yml`

Для **каждого** из 4 сервисов (`postgres`, `backend-go`, `ml-python`, `frontend`) добавь:

```yaml
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 512M
```

Для `postgres` — `memory: 256M`, для `ml-python` — `memory: 1G` (Groq SDK + pandas тяжёлые).

Пример как это выглядит для backend-go:
```yaml
  backend-go:
    build:
      context: ./backend-go
      dockerfile: Dockerfile
    container_name: smartcity-backend
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 512M
    environment:
      # ... остальное без изменений
```

---

### Задача 5 — СРЕДНИЙ: Создать .dockerignore файлы

Создай 3 файла:

**Файл 1:** `backend-go/.dockerignore`
```
.git
.env
*.md
.vscode
tmp/
```

**Файл 2:** `frontend-react/.dockerignore`
```
.git
.env
node_modules
dist
*.md
.vscode
```

**Файл 3:** `ml-python/.dockerignore`
```
.git
.env
__pycache__
*.pyc
.venv
venv
*.md
.vscode
```

**Почему:** Без `.dockerignore` Docker копирует в образ всё подряд — node_modules, .git, images. Сборка медленнее, образы тяжелее.

---

### Задача 6 — СРЕДНИЙ: Заменить npm install на npm ci

**Файл:** `frontend-react/Dockerfile`, строка 10

Заменить:
```dockerfile
RUN npm install
```
На:
```dockerfile
RUN npm ci
```

**Почему:** `npm ci` делает чистую установку строго по `package-lock.json`, что гарантирует одинаковые сборки у всех.

---

### Чеклист Марлена:
- [ ] Nginx: добавлены security-заголовки (X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, Referrer-Policy)
- [ ] Nginx: proxy передаёт X-Real-IP, X-Forwarded-For + таймауты
- [ ] `index.html`: `lang="ru"`
- [ ] Docker Compose: `restart: unless-stopped` + `memory limits` для каждого сервиса
- [ ] Созданы 3 файла `.dockerignore`
- [ ] Dockerfile: `npm ci` вместо `npm install`
- [ ] Все 4 контейнера запускаются и работают после изменений
- [ ] Создан Pull Request с ревьюером Амир

---

## 🎨 ДИМА — Дизайн и UX

**Ветка:** `feature/dima-design-ux`  
**Файлы:** `frontend-react/src/`, `frontend-react/index.html`, `images/`

### Задача 1 — Кастомная иконка (favicon)

**Файл:** `frontend-react/index.html`, строка 5

Сейчас стоит дефолтный Vite favicon:
```html
<link rel="icon" type="image/svg+xml" href="/vite.svg" />
```

**Нужно:**
1. Создать SVG-иконку для Smart City (город/здание/граф сети — на твой вкус)
2. Положить файл в `frontend-react/public/favicon.svg`
3. Заменить строку на:
```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
```

---

### Задача 2 — Обновить скриншоты

**Папка:** `images/`

Сейчас в `images/` лежат старые скриншоты (до всех наших изменений — карта была с тепловой картой, теперь PathLayer).

1. Запусти проект: `sudo docker compose up -d --build`
2. Открой http://localhost:3000
3. Сделай 3 скриншота:
   - **images/1.png** — Вкладка "Мониторинг" (виджеты + карта)
   - **images/2.png** — Вкладка "Аналитика" (графики)
   - **images/3.png** — Вкладка "Планировщик" (AI чат)
4. Замени старые файлы новыми

---

### Задача 3 — Проверить адаптивность на мобильных

Открой http://localhost:3000 → Нажми F12 → включи мобильный вид (Ctrl+Shift+M).

Проверь экраны:
- iPhone 14 (390×844)
- iPad (768×1024)
- Full HD (1920×1080)

**Запиши** список проблем если что-то выглядит плохо:
- Обрезается текст?
- Карта слишком маленькая?
- Виджеты наложены друг на друга?
- Шрифт слишком мелкий?

Если найдёшь баги — исправь CSS. Все стили в файлах:
- `frontend-react/src/index.css` — общие стили
- `frontend-react/tailwind.config.js` — тема и цвета
- В каждом компоненте — Tailwind классы

---

### Задача 4 — Нотификация при ошибке API

Сейчас если API недоступен — система молча показывает фейковые данные. Пользователь об этом не знает.

**Файл:** `frontend-react/src/App.tsx`

Найди в header блоке (примерно строка 55) индикатор "Онлайн данные" и добавь рядом проверку на `is_mock` трафика:

```tsx
{dashboardData?.traffic.is_mock && (
    <span className="text-xs px-2 py-1 rounded bg-orange-500/20 text-orange-400">
        ⚠ Нет связи с API
    </span>
)}
```

---

### Чеклист Димы:
- [ ] Создан кастомный favicon.svg
- [ ] Обновлены 3 скриншота в images/
- [ ] Проверена адаптивность (мобилки, планшет, десктоп)
- [ ] Добавлена индикация "Нет связи с API" при mock-данных трафика
- [ ] Создан Pull Request с ревьюером Амир

---

## 📊 Сводная таблица задач

| Кому | Задача | Приоритет | Файлы |
|------|--------|-----------|-------|
| **Бахтияр** | CORS в ML-сервисе | 🔴 Критично | `ml-python/main.py` |
| **Бахтияр** | Утечка ошибок в ML | 🔴 Критично | `ml-python/main.py` |
| **Бахтияр** | Groq async fix | 🟠 Высокий | `ml-python/services/logic.py` |
| **Бахтияр** | Валидация predict | 🟡 Средний | `backend-go/.../handlers.go` |
| **Роман** | AQI график → реальные данные | 🟠 Высокий | `AQIHistoryChart.tsx` |
| **Роман** | Корреляция → реальные данные | 🟠 Высокий | `CorrelationChart.tsx` |
| **Роман** | Трафик по часам → реальные данные | 🟠 Высокий | `TrafficByHourChart.tsx` |
| **Роман** | Убрать "(Mock Data)" | 🟡 Средний | `AnalyticsDashboard.tsx` |
| **Роман** | Создать .env.example | 🟡 Средний | `.env.example` |
| **Марлен** | Security headers nginx | 🟠 Высокий | `nginx.conf` |
| **Марлен** | X-Real-IP + таймауты | 🟠 Высокий | `nginx.conf` |
| **Марлен** | lang="ru" | 🟠 Высокий | `index.html` |
| **Марлен** | Docker restart + limits | 🟡 Средний | `docker-compose.yml` |
| **Марлен** | .dockerignore файлы | 🟡 Средний | 3 файла |
| **Марлен** | npm ci | 🟡 Средний | `Dockerfile` |
| **Дима** | Favicon | 🟡 Средний | `index.html`, `public/` |
| **Дима** | Скриншоты | 🟡 Средний | `images/` |
| **Дима** | Адаптивность | 🟡 Средний | CSS/Tailwind |
| **Дима** | Mock-индикатор | 🟡 Средний | `App.tsx` |

---

## ⚠️ Важные правила

1. **НЕ коммитить в main напрямую** — только через Pull Request
2. **НЕ менять файлы которые не указаны в твоём задании** — чтобы не было конфликтов
3. **Перед началом работы** — `git pull origin main` чтобы взять последнюю версию
4. **После каждого изменения** — проверяй что `sudo docker compose up -d --build` работает
5. **Если что-то непонятно** — пишите в чат, спрашивайте Амира

---

*Сгенерировано: 15.02.2026*
