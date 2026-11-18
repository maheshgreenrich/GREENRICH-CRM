/* GreenRich ONE PWA: online-first, no CRM or GPS response caching. */
'use strict';
const CACHE='greenrich-one-assets-20261119-v3';
self.addEventListener('install',event=>{
 event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('greenrich-one-')).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
 // Explicit network response for navigations, required by some PWA install checks.
 // Never cache authenticated CRM, photos, employee positions or Supabase API data.
 if(event.request.mode==='navigate')event.respondWith(fetch(event.request));
});
