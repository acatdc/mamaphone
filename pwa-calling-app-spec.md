# Техническое задание для Claude Code

## Обзор проекта

Создать PWA приложение для интернет аудио-звонков между друзьями с использованием WebRTC и Firebase.

## Технологический стек

**Frontend:**
- Vanilla JavaScript (или React - на твое усмотрение)
- HTML5 + CSS3
- WebRTC API
- Firebase SDK (Realtime Database)
- PWA (Service Worker + manifest.json)

**Инфраструктура:**
- Firebase Realtime Database (сигналинг + хранение списка пользователей)
- Google STUN: `stun:stun.l.google.com:19302`
- Open Relay TURN: `turn:openrelay.metered.ca:80` (опционально, релиз в фазе-2)

**Хостинг:**
- GitHub Pages / Vercel / Netlify (на выбор)

## Архитектура

```
[Браузер A] ←──WebRTC P2P аудио──→ [Браузер B]
      ↓                                  ↓
      └────Firebase Realtime DB──────────┘
           (обмен SDP + ICE candidates)
```

Firebase заменяет традиционный сигнальный сервер. Все обмены offer/answer и ICE candidates происходят через Firebase listeners.

## Минимально рабочая версия (MVP)

### Функционал

1. **Список контактов**
   - Отображение списка друзей
   - Кнопка "Позвонить" напротив каждого
2. **Исходящий звонок**
   - Клик "Позвонить" → начать вызов
   - Показать "Звоним..." пока абонент не ответит
   - Кнопка "Отменить"
3. **Входящий звонок**
   - Уведомление о входящем
   - Показать кто звонит
   - Кнопки: "Ответить" / "Отклонить"
4. **Активный звонок**
   - Таймер разговора
   - Кнопка "Завершить"
   - Кнопка "Громкая связь" (toggle speaker)
5. **PWA функции**
   - Установка на домашний экран
   - Офлайн fallback (показать "Нет интернета")
   - Иконки и splash screen

### UI требования

- Простой, минималистичный интерфейс
- Мобильно-ориентированный дизайн
- Большие кнопки для удобства на телефоне
- Темная тема

## Структура Firebase Realtime Database

```json
{
  "users": {
    "userId1": {
      "name": "Имя",
      "status": "online",
      "lastSeen": 1234567890
    }
  },
  "calls": {
    "callId": {
      "caller": "userId1",
      "callee": "userId2",
      "status": "ringing|active|ended",
      "offer": { "type": "offer", "sdp": "..." },
      "answer": { "type": "answer", "sdp": "..." },
      "iceCandidatesCaller": [
        { "candidate": "...", "sdpMid": "...", "sdpMLineIndex": 0 }
      ],
      "iceCandidatesCallee": [ ... ]
    }
  }
}
```

## WebRTC конфигурация

```javascript
const iceServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
  // TURN добавим позже если понадобится
];
```

## Поток звонка

### Исходящий (caller)
1. Нажать "Позвонить" на контакте
2. Создать запись в `/calls/{callId}` с offer
3. Получить медиа-поток (getUserMedia)
4. Создать RTCPeerConnection
5. Создать offer, записать в Firebase
6. Слушать answer от callee
7. Обмениваться ICE candidates через Firebase
8. Установить P2P соединение

### Входящий (callee)
1. Firebase listener видит новый `/calls/{callId}` где callee = myId
2. Показать UI входящего звонка
3. При "Ответить":
   - Получить медиа-поток
   - Создать RTCPeerConnection
   - Установить remote offer
   - Создать answer, записать в Firebase
   - Обмениваться ICE candidates
4. При "Отклонить":
   - Обновить статус звонка на "declined"

## Файловая структура

```
/project-root
  /public
    index.html
    manifest.json
    /icons
      icon-192.png
      icon-512.png
    /css
      styles.css
    /js
      app.js (главная логика)
      firebase-config.js
      webrtc.js (WebRTC логика)
      ui.js (UI обновления)
    sw.js (service worker)
  README.md
  .gitignore
```

## Первые шаги

1. Создать структуру проекта
2. Настроить Firebase проект (я предоставлю credentials)
3. Реализовать базовый UI списка контактов
4. Добавить Firebase подключение и listeners
5. Реализовать WebRTC логику звонка
6. Настроить PWA (manifest + service worker)
7. Протестировать локально
8. Задеплоить на хостинг (детали решим на месте)

## Вопросы на которые пока я незнаю ответа

1. Авторизация/регистрация (надо обсудить с тобой этот этап)
2. Как организовать добавление контактов? В частности, как система будет четко привязывать реального человека к нашей базе? Ведь IP у всех всегда будет разный.. в зависимости от местанахождения человека. Видимо должен быть какой то уникальный айди внтури нашей системы по которому все контакты будут получать возможность найти друг друга. В общем тут надо разобраться.

## Что НЕ нужно на этом этапе

- ❌ Видео звонки (только аудио)
- ❌ Групповые звонки
- ❌ История звонков
- ❌ Шифрование (E2E)
- ❌ Чат/текстовые сообщения
- ❌ Push уведомления

## Справочные материалы

- Google WebRTC Codelab: https://codelabs.developers.google.com/codelabs/webrtc-web
- Firebase Realtime DB Docs: https://firebase.google.com/docs/database
- WebRTC API: https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API
- PWA Guide: https://web.dev/progressive-web-apps/

## Важные замечания

- Firebase никогда не "засыпает" - это критично для звонков
- Сигналинг сообщения (offer/answer/ICE) должны удаляться после установления соединения
- Все WebRTC трафик идет P2P напрямую между браузерами (не через Firebase)
- STUN нужен только для определения публичных IP
- Тестировать нужно на HTTPS (localhost = ok, иначе нужен SSL)

## Цель

Минимально рабочее приложение, где я могу:
1. Открыть список друзей
2. Нажать "Позвонить"
3. Друг видит входящий и жмет "Ответить"
4. Слышим друг друга
5. Включить громкую связь
6. Завершить звонок
7. Сервис должен позволять осуществлять непрерывный разговор длительностью 30 минут . Больше - лучше но опционально.

Начни с создания базовой структуры проекта и UI. Я помогу с Firebase credentials когда понадобится.
