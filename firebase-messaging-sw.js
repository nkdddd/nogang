/* 웹 푸시 수신용 서비스 워커 (Firebase Cloud Messaging)
   앱이 꺼져 있을 때 도착한 알림을 보여 주고, 누르면 플래너를 엽니다. */
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");
firebase.initializeApp({
  apiKey: "AIzaSyD9lZX32VYmHKBJjyovm84Df7B-25953V4",
  authDomain: "splan-5512.firebaseapp.com",
  projectId: "splan-5512",
  storageBucket: "splan-5512.firebasestorage.app",
  messagingSenderId: "161378084495",
  appId: "1:161378084495:web:3bf34e83ced6461488b2fa",
});
const messaging=firebase.messaging();
// notification 필드가 있는 메시지는 브라우저가 자동으로 표시. 데이터만 온 경우를 대비해 직접 표시
messaging.onBackgroundMessage(payload=>{
  if(payload.notification) return;
  const d=payload.data||{};
  self.registration.showNotification(d.title||"우리집 학습플래너", {body:d.body||"", icon:"assets/icon-192.png", badge:"assets/icon-192.png", data:{link:d.link||"./"}});
});
self.addEventListener("notificationclick", e=>{
  e.notification.close();
  const link=(e.notification.data && (e.notification.data.link || (e.notification.data.FCM_MSG && e.notification.data.FCM_MSG.fcmOptions && e.notification.data.FCM_MSG.fcmOptions.link))) || "./";
  e.waitUntil(clients.matchAll({type:"window", includeUncontrolled:true}).then(list=>{
    for(const c of list){ if("focus" in c){ c.navigate && c.navigate(link); return c.focus(); } }
    return clients.openWindow(link);
  }));
});
