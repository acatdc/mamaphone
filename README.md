# Mamaphone

PWA приложение для аудио-звонков через WebRTC + Firebase.

## Технологии

- Vanilla JavaScript
- Firebase (Auth + Realtime DB)
- WebRTC
- PWA (Service Worker + Manifest)

## Запуск локально

1. Открыть `public/index.html` в браузере
2. Или запустить локальный сервер:
   ```bash
   npx serve public
   ```

## Firebase Setup

Создать `public/js/firebase-config.js`:
```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  databaseURL: "YOUR_DATABASE_URL",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

## Деплой

GitHub Pages:
```bash
git push origin main
```
Settings → Pages → Source: main branch / public folder
