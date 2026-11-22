/* Kira Imobiliare pe telefon: pornește și fără internet, iar pozele (/_blob/<id>) vin din baza de date a telefonului. */
var VERSION = '1.10.0-d04f3e99';
var CACHE = 'crm-' + VERSION;
var SHELL = ['./', './manifest.webmanifest', './apple-touch-icon.png', './icon-192.png', './icon-512.png', './icon-maskable-512.png'];

// Safari refuses redirected responses for page loads: keep a clean copy.
function clean(r){
  if (!r || !r.redirected) return Promise.resolve(r);
  return r.blob().then(function(b){ return new Response(b, {status: r.status, statusText: r.statusText, headers: r.headers}); });
}
self.addEventListener('install', function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){
    return Promise.all(SHELL.map(function(u){
      return fetch(new Request(u, {cache: 'reload'})).then(function(r){ if (!r.ok) throw new Error(u + ' ' + r.status); return clean(r); }).then(function(r){ return c.put(u, r); });
    }));
  }).then(function(){ return self.skipWaiting(); }));
});
self.addEventListener('activate', function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){ return k.indexOf('crm-') === 0 && k !== CACHE; }).map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});
self.addEventListener('message', function(e){ if (e.data === 'claim') e.waitUntil(self.clients.claim()); });

function openDb(){
  return new Promise(function(res, rej){
    var r = indexedDB.open('crm-imobiliar', 1);
    r.onupgradeneeded = function(){
      var d = r.result;
      if (!d.objectStoreNames.contains('docs')) d.createObjectStore('docs', {keyPath: 'k'}).createIndex('col', 'col');
      if (!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs', {keyPath: 'id'});
      if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv', {keyPath: 'k'});
    };
    r.onsuccess = function(){ res(r.result); };
    r.onerror = function(){ rej(r.error); };
  });
}
// One connection, dropped when the page upgrades or replaces the database.
var dbp = null;
function conn(){
  if (!dbp) dbp = openDb().then(function(d){
    d.onversionchange = function(){ d.close(); dbp = null; };
    d.onclose = function(){ dbp = null; };
    return d;
  }, function(e){ dbp = null; throw e; });
  return dbp;
}
function getBlob(id, again){
  return conn().then(function(d){
    return new Promise(function(res, rej){
      var t;
      try { t = d.transaction('blobs', 'readonly'); } catch(e){ rej(e); return; }
      var r = t.objectStore('blobs').get(id);
      r.onsuccess = function(){ res(r.result); };
      r.onerror = function(){ rej(r.error); };
    });
  }).catch(function(e){ if (again) throw e; dbp = null; return getBlob(id, true); });
}

self.addEventListener('fetch', function(e){
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  var m = /\/_blob\/([A-Za-z0-9_-]{6,128})$/.exec(url.pathname);
  if (m){
    e.respondWith(getBlob(m[1]).then(function(b){
      if (!b || !b.buf) return new Response('', {status: 404});
      return new Response(b.buf, {headers: {'Content-Type': b.type || 'image/jpeg', 'Cache-Control': 'no-store'}});
    }, function(){ return new Response('', {status: 503}); }));
    return;
  }
  var scope = new URL(self.registration.scope);
  if (url.pathname.indexOf(scope.pathname) !== 0) return;
  var nav = req.mode === 'navigate';
  // The signing page (semnare.html) and any other page are not the app: they always come from the network.
  if (nav && !/\/(index\.html)?$/.test(url.pathname)) return;
  if (/\/semnare\.html$/.test(url.pathname)) return;
  // Downloads (the Windows kit) always come fresh from the address, never from the phone's copy.
  if (/\/descarca\//.test(url.pathname)) return;
  // The agency's database address comes fresh too (it is never kept on the phone by the worker).
  if (/\/conectare\.json$/.test(url.pathname)) return;
  var key = nav ? './' : req;
  // Answer from the phone at once (works offline); fetch the newest version for the next start.
  e.respondWith(caches.open(CACHE).then(function(c){
    return c.match(key, {ignoreSearch: true}).then(function(hit){
      var net = fetch(req).then(function(r){
        if (r && r.ok && r.type === 'basic') return clean(r.clone()).then(function(cr){ return c.put(key, cr); }).then(function(){ return r; }, function(){ return r; });
        return r;
      });
      if (hit){ e.waitUntil(net.catch(function(){})); return hit; }
      return net.catch(function(){ return c.match('./'); });
    });
  }));
});
