// Minimal Service Worker 
const CACHE_NAME = 'printsafe-v1';

self.addEventListener('install', (event) => {
  // Activate right away without waiting
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  // Claim clients so the SW takes control immediately for the Share Target POST
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1) INTERCEPT THE NATIVE WEB SHARE TARGET payload
  // The OS will POST to /share-target when a user shares a file from their gallery
  if (url.pathname === '/share-target' && event.request.method === 'POST') {
    event.respondWith(
      (async () => {
        try {
          const formData = await event.request.formData();
          const file = formData.get('file');

          if (file) {
            // Open native IndexedDB securely
            const db = await new Promise((resolve, reject) => {
              const request = indexedDB.open('ps_share', 1);
              request.onupgradeneeded = () => request.result.createObjectStore('files');
              request.onsuccess = () => resolve(request.result);
              request.onerror = () => reject(request.error);
            });

            // Store the hijacked file into IndexedDB temporarily
            await new Promise((resolve, reject) => {
              const tx = db.transaction('files', 'readwrite');
              const store = tx.objectStore('files');
              const request = store.put(file, 'shared-file');
              request.onsuccess = () => resolve();
              request.onerror = () => reject(request.error);
            });
          }
          
          // 2) REDIRECT TO HOME PAGE WITH FLAG
          // App handles it client-side without ever sending the decrypted payload to server
          return Response.redirect('/?shared=1', 303);
        } catch (err) {
          console.error('Share Target processing failed:', err);
          return Response.redirect('/?error=share_failed', 303);
        }
      })()
    );
    return;
  }
});
