import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from "./config.js";

export const configurado = !String(firebaseConfig.apiKey || "").startsWith("COLE");

// Modo de teste local (só funciona em localhost com ?emulador na URL)
const params = new URLSearchParams(location.search);
if (params.has("emulador")) sessionStorage.setItem("emulador", "1");
const usarEmulador = location.hostname === "localhost" && sessionStorage.getItem("emulador") === "1";

const cfg = configurado ? firebaseConfig : { apiKey: "demo", projectId: "demo-urna", authDomain: "localhost", appId: "demo" };

export const app = (configurado || usarEmulador) ? initializeApp(cfg) : null;
export const db = app ? getFirestore(app) : null;
export const auth = app ? getAuth(app) : null;

if (app && usarEmulador) {
  connectFirestoreEmulator(db, "localhost", 8080);
  connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
}

export const pronto = !!app;
