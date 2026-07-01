/* 서비스워커: 앱 껍데기(HTML/CSS/JS)를 캐시해 오프라인에서도 화면이 뜨게 함.
   ※ 시세 데이터는 항상 실시간으로 네트워크에서 가져옵니다(캐시 안 함). */
const CACHE = "kabu-v3";
const SHELL = ["./", "./index.html", "./styles.css", "./app.js", "./manifest.json"];

// 설치 시 앱 껍데기 캐시
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

// 오래된 캐시 정리
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

// 요청 처리: 시세 API/프록시는 네트워크 우선, 그 외 앱 파일은 캐시 우선
self.addEventListener("fetch", (e) => {
  const url = e.request.url;
  const isData = url.includes("finance.yahoo") || url.includes("proxy") || url.includes("allorigins");
  if (isData) return; // 데이터 요청은 그대로 네트워크로
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request))
  );
});
