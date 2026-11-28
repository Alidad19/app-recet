import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = window.FIREBASE_CONFIG || {
  apiKey: "AIzaSyDiUgo3N3Kcj-iGWZ4Nwj4PqmJxBku51b0",
  authDomain: "app-recet.firebaseapp.com",
  projectId: "app-recet",
  messagingSenderId: "638737537532",
  appId: "1:638737537532:android:63da0c719bcebd9df33a79"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
