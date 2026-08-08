// Plantilla de configuración. Cópiala como config.js y pon tus valores.
// config.js está en .gitignore y NO se sube al repositorio.
//
// Ojo: esto no es un secreto. El navegador necesita estos datos para
// conectarse, así que quien abra las herramientas de desarrollo los verá.
// Lo que protege la base son las reglas de Realtime Database, no esconder
// este archivo. Sacarlo del repo solo evita que los rastreadores
// automáticos de GitHub encuentren el proyecto.

export const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "TU_PROYECTO.firebaseapp.com",
  databaseURL: "https://TU_PROYECTO-default-rtdb.firebaseio.com",
  projectId: "TU_PROYECTO",
  storageBucket: "TU_PROYECTO.firebasestorage.app",
  messagingSenderId: "TU_SENDER_ID",
  appId: "TU_APP_ID",
  measurementId: "TU_MEASUREMENT_ID",
};