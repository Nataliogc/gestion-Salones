// js/firebase-init.js
const firebaseConfig = {
  apiKey: "AIzaSyAXv_wKD48EFDe8FBQ-6m0XGUNoxSRiTJY",
  authDomain: "mesa-chef-prod.firebaseapp.com",
  projectId: "mesa-chef-prod",
  storageBucket: "mesa-chef-prod.firebasestorage.app",
  messagingSenderId: "43170330072",
  appId: "1:43170330072:web:bcdd09e39930ad08bf2ead"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
