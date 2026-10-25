// =====================================================================
//  CONFIGURAÇÃO DA URNA. Este é o ÚNICO arquivo que você precisa editar.
// =====================================================================

// 1) Cole aqui a configuração do seu projeto Firebase
//    (Console do Firebase > Configurações do projeto > Seus apps > Web > firebaseConfig)
export const firebaseConfig = {
  apiKey: "AIzaSyCtGdnrf-9167gaBdp0cLUe2nZasV714wc",
  authDomain: "urna-losttapes.firebaseapp.com",
  projectId: "urna-losttapes",
  storageBucket: "urna-losttapes.firebasestorage.app",
  messagingSenderId: "602097954260",
  appId: "1:602097954260:web:577b294aa48567db41fa41",
};

// 2) E-mail da conta de administrador que você criou no Firebase (Authentication).
//    No painel de admin você só digita a senha.
export const ADMIN_EMAIL = "noemykrl@gmail.com";

// 3) Nome da eleição (aparece no painel de admin)
export const TITULO_ELEICAO = "Eleição Simulada";

// Cargos, na ordem em que aparecem na urna.
// ATENÇÃO: se mudar os "id", mude também a lista no arquivo firestore.rules.
export const CARGOS = [
  { id: "presidente", nome: "Presidente",       digitos: 2, vice: "Vice-Presidente" },
  { id: "governador", nome: "Governador",       digitos: 2, vice: "Vice-Governador" },
  { id: "senador",    nome: "Senador",          digitos: 3, vice: "Suplentes" },
  { id: "depfederal", nome: "Deputado Federal", digitos: 4, vice: null },
];
