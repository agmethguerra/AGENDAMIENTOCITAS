// ==============================
// CONFIGURACIÓN FIREBASE
// ==============================

const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyAUGmD0wQ3xk_HNlx4UmwWY3wQ9cAU78CI",
  authDomain:        "barberia-a7141.firebaseapp.com",
  projectId:         "barberia-a7141",
  storageBucket:     "barberia-a7141.appspot.com",
  messagingSenderId: "1064291170129",
  appId:             "1:1064291170129:web:433080bc9154e0ece7c570"
};

if (!firebase.apps.length) {
  firebase.initializeApp(FIREBASE_CONFIG);
}

const db = firebase.firestore();
