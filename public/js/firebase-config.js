// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBM3gRVzNgfUVX4dAEl6jlQhfGLnLwQi3U",
  authDomain: "mamaphone-1.firebaseapp.com",
  databaseURL: "https://mamaphone-1-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "mamaphone-1",
  storageBucket: "mamaphone-1.firebasestorage.app",
  messagingSenderId: "26536331635",
  appId: "1:26536331635:web:37e37ca1a58e57d8f91d06"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Get references
const auth = firebase.auth();
const db = firebase.database();

// Google Auth Provider
const googleProvider = new firebase.auth.GoogleAuthProvider();
