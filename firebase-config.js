// Cole aqui a configuração do seu projeto Firebase que você obtém no console do Firebase.
// É seguro manter isso no lado do cliente para aplicativos web.
// Vá para: Console do Firebase > Configurações do Projeto > Geral > Seus aplicativos > SDK setup and configuration.
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDEVEkeE5JM-_RUOD7S-rVic6phL4cBINw",
  authDomain: "finance-31d3d.firebaseapp.com",
  databaseURL: "https://finance-31d3d-default-rtdb.firebaseio.com",
  projectId: "finance-31d3d",
  storageBucket: "finance-31d3d.firebasestorage.app",
  messagingSenderId: "972250774373",
  appId: "1:972250774373:web:3055add8b99769f3ce3f8c",
  measurementId: "G-LR8JZPFNK5"
};

// Inicializa o Firebase
firebase.initializeApp(firebaseConfig);

// Exporta as instâncias dos serviços do Firebase para serem usadas em outros scripts
window.auth = firebase.auth();
window.db = firebase.firestore();
window.firebase = firebase; // Opcional, mas útil para acessar outros recursos como FieldValue
