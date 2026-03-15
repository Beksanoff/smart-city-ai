# Smart City AI Core -- Задачи команды

**Дата создания:** 15.02.2026  
**Последнее обновление:** 15.03.2026  
**Ревьюер:** Амир  
**Репозиторий:** `https://github.com/Beksanoff/smart-city-ai`

---

## Статус проекта

Все задачи выполнены. Проект готов к защите диплома.

---

## Инструкция по работе с проектом

### 1. Скачать проект

```bash
git clone https://github.com/Beksanoff/smart-city-ai.git
cd smart-city-ai
```

### 2. Настроить окружение

```bash
cp .env.example .env
# Заполнить API-ключи (опционально -- без них работает демо-режим)
```

### 3. Запустить проект

```bash
# Через Make (рекомендуется)
make up

# Или вручную
docker compose up -d --build
```

### 4. Проверить работу

| Сервис | URL | Ожидаемый ответ |
|--------|-----|-----------------|
| Фронтенд | http://localhost:3000 | Дашборд с картой |
| Бэкенд API | http://localhost:8080/health | `{"status":"ok"}` |
| ML сервис | http://localhost:8000/health | `{"status":"ok"}` |
| Погода | http://localhost:8080/api/v1/weather | JSON с данными |
| Трафик | http://localhost:8080/api/v1/traffic | JSON с данными |

### 5. Запуск тестов

```bash
make test    # Go (32), Python (36), Frontend (7)
make lint    # ESLint + TypeScript + go vet
```

### 6. Полезные команды

```bash
make up       # Запуск
make down     # Остановка
make restart  # Перезапуск
make logs     # Просмотр логов
make status   # Статус контейнеров
make clean    # Полная очистка (удалить volumes)
```

---

## Выполненные задачи

### Бахтияр -- ML-сервис (Python) + валидация на бэкенде

**Файлы:** `ml-python/main.py`, `ml-python/services/logic.py`, `backend-go/internal/delivery/http/handlers.go`

| Задача | Приоритет | Статус |
|--------|-----------|--------|
| CORS в ML-сервисе ограничен конкретными origins | Критичный | Готово |
| Ошибки ML не утекают наружу (generic-сообщения) | Критичный | Готово |
| Groq вызывается через `asyncio.to_thread()` | Высокий | Готово |
| Валидация predict-запроса на бэкенде (дата, температура, длина) | Средний | Готово |

---

### Роман -- Аналитика (Frontend) + .env.example

**Файлы:** `frontend-react/src/components/analytics/`, `frontend-react/src/services/api.ts`, `.env.example`

| Задача | Приоритет | Статус |
|--------|-----------|--------|
| AQIHistoryChart использует `api.getWeatherHistory(168)` | Высокий | Готово |
| CorrelationChart получает данные из `/stats` | Высокий | Готово |
| TrafficByHourChart использует `api.getTrafficHistory(24)` | Высокий | Готово |
| Удален текст "(Mock Data)" из заголовка аналитики | Средний | Готово |
| Создан `.env.example` в корне проекта | Средний | Готово |

---

### Марлен -- Инфраструктура (Docker, Nginx, HTML)

**Файлы:** `frontend-react/nginx.conf`, `frontend-react/index.html`, `docker-compose.yml`, `.dockerignore`

| Задача | Приоритет | Статус |
|--------|-----------|--------|
| Security-заголовки в Nginx (X-Frame-Options и др.) | Высокий | Готово |
| Nginx передает X-Real-IP, X-Forwarded-For + таймауты | Высокий | Готово |
| `index.html`: `lang="ru"` | Высокий | Готово |
| Docker Compose: `restart: unless-stopped` для всех сервисов | Средний | Готово |
| Созданы 3 файла `.dockerignore` | Средний | Готово |
| Dockerfile: `npm ci` вместо `npm install` | Средний | Готово |

---

### Дима -- Дизайн и UX

**Файлы:** `frontend-react/src/`, `frontend-react/index.html`, `images/`

| Задача | Приоритет | Статус |
|--------|-----------|--------|
| Кастомная иконка (favicon.svg) | Средний | Готово |
| Обновлены скриншоты в `images/` | Средний | Готово |
| Проверена адаптивность (мобилки, планшет, десктоп) | Средний | Готово |
| Индикация "Нет связи с API" при mock-данных | Средний | Готово |

---

### Амир -- Код-ревью, архитектура, тесты, CI/CD

| Задача | Приоритет | Статус |
|--------|-----------|--------|
| Аудит и исправление 34 багов (безопасность, производительность, корректность) | Критичный | Готово |
| Отдельные scalers для PM2.5 и traffic моделей | Высокий | Готово |
| EPA AQI: исправлен gap в breakpoints (truncation fix) | Высокий | Готово |
| Groq SDK обновлен с 0.4.2 до 0.15.0 (httpx совместимость) | Высокий | Готово |
| Pydantic валидаторы: пустая строка `""` -> `None` | Средний | Готово |
| Go тесты: 32 test case для `pm25ToAQI()` | Средний | Готово |
| Python тесты: 36 test case (AQI, /health, /predict) | Средний | Готово |
| Frontend тесты: 7 test case (App, навигация, i18n) | Средний | Готово |
| GitHub Actions CI: 4 jobs (Go, Python, Frontend, Docker) | Средний | Готово |
| ESLint: 10 warnings -> 0 (Recharts tooltips, YMaps interfaces) | Низкий | Готово |
| `.gitignore`: добавлен `*.pkl` | Низкий | Готово |
| ErrorBoundary в `main.tsx` | Низкий | Готово |
| `<meta name="theme-color">` в `index.html` | Низкий | Готово |
| Makefile: убран sudo, добавлены `test` и `lint` targets | Низкий | Готово |

---

## Сводная таблица

| Кто | Задач | Статус |
|-----|-------|--------|
| Бахтияр | 4 | Все выполнены |
| Роман | 5 | Все выполнены |
| Марлен | 6 | Все выполнены |
| Дима | 4 | Все выполнены |
| Амир | 14 | Все выполнены |
| **Итого** | **33** | **Все выполнены** |

---

*Последнее обновление: 15.03.2026*
