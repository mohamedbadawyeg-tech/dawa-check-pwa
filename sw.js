
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

const CACHE_NAME = 'health-track-cache-v2';
const assetsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://cdn-icons-png.flaticon.com/512/883/883356.png'
];

// Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyCbjITpAZBfA-NItVOX6Hc3AJlet6EKk7E",
  authDomain: "eladwya-92754604-eb321.firebaseapp.com",
  projectId: "eladwya-92754604-eb321",
  storageBucket: "eladwya-92754604-eb321.firebasestorage.app",
  messagingSenderId: "319834803886",
  appId: "1:319834803886:web:6a71f628e1a20d01c5a73f"
};

firebase.initializeApp(firebaseConfig);

let messaging = null;
try {
  messaging = firebase.messaging();
  messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Received background message ', payload);
    const notificationTitle = payload.notification.title;
    const notificationOptions = {
      body: payload.notification.body,
      icon: payload.notification.icon || 'https://cdn-icons-png.flaticon.com/512/883/883356.png',
      badge: payload.notification.badge || 'https://cdn-icons-png.flaticon.com/512/883/883356.png',
      data: payload.data,
      vibrate: [200, 100, 200]
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
  });
} catch (e) {
  console.log('Firebase messaging failed to init in SW:', e);
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(assetsToCache);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Bypass Service Worker for Firestore and Google APIs to avoid conflicts with long-polling
  if (event.request.url.includes('firestore.googleapis.com') || 
      event.request.url.includes('googleapis.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request).catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      if (clientList.length > 0) {
        let client = clientList[0];
        for (let c of clientList) {
          if (c.focused) return c.focus();
        }
        return client.focus();
      }
      return clients.openWindow('/');
    })
  );
});
