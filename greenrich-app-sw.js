/* GreenRich ONE app shell: never cache customer records, authenticated API responses or GPS. */
'use strict';
const CACHE='greenrich-one-shell-20261119-v2';
const SHELL=['./greenrich-app-icon.svg','./greenrich-app-192.png','./greenrich-app-512.png','./manifest.webmanifest'];
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('greenrich-one-shell-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
 const req=event.request;
 if(req.method!=='GET'||new URL(req.url).origin!==self.location.origin)return;
 // Online-only for secure ERP documents and JS; prevents stale code and confidential offline copies.
 if(req.mode==='navigate')return;
 const url=new URL(req.url);
 if(!SHELL.some(path=>url.pathname.endsWith(path.slice(1))))return;
 event.respondWith(caches.match(req).then(hit=>hit||fetch(req)));
});
