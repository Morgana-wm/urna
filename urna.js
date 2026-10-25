import { db, auth, pronto } from "./firebase.js";
import { CARGOS, TITULO_ELEICAO } from "./config.js";
import {
  collection, doc, getDoc, onSnapshot, writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const tela = document.getElementById("tela");
const sons = {
  tecla: document.getElementById("somTecla"),
  confirma: document.getElementById("somConfirma"),
  fim: document.getElementById("somFim"),
};

// ---------------- Estado ----------------
let modo = "carregando";       // carregando | votando | gravando | fim | ja-votou | fechada | erro
let etapa = 0;                 // índice do cargo atual
let numero = "";               // dígitos digitados
let branco = false;
let cedula = {};               // { presidente: "13" | "BRANCO" | "NULO", ... }
let candidatos = {};           // { "presidente_13": {...} }
let eleicao = { aberta: false, rodada: 1 };
let usuario = null;

// ---------------- Utilidades ----------------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let somLigado = localStorage.getItem("urna_som") !== "0";
function tocar(nome) {
  if (!somLigado) return;
  const a = sons[nome];
  if (!a) return;
  try { a.currentTime = 0; a.play().catch(() => {}); } catch (_) {}
}

const chaveLocal = () => `urna_votou_rodada_${eleicao.rodada || 1}`;

// ---------------- Renderização ----------------
function render() {
  if (modo !== "votando") setTimeout(atualizarEtapa);
  if (modo === "carregando") {
    tela.innerHTML = `<div class="centro"><div class="msg-grande">AGUARDE</div><div class="msg">Carregando a urna...</div></div>`;
    return;
  }
  if (modo === "erro-config") {
    tela.innerHTML = `<div class="centro"><div class="msg-grande">URNA NÃO CONFIGURADA</div>
      <div class="msg">Edite o arquivo <code>config.js</code> e cole a configuração do seu projeto Firebase.</div></div>`;
    return;
  }
  if (modo === "erro") {
    tela.innerHTML = `<div class="centro"><div class="msg-grande">ERRO</div><div class="msg">${esc(erroMsg)}</div></div>`;
    return;
  }
  if (modo === "fechada") {
    tela.innerHTML = `<div class="centro"><div class="msg-grande">VOTAÇÃO ENCERRADA</div>
      <div class="msg">A votação não está aberta no momento. Aguarde a liberação.</div></div>`;
    return;
  }
  if (modo === "gravando") {
    tela.innerHTML = `<div class="centro"><div class="msg-grande">GRAVANDO</div><div class="barra"><i></i></div></div>`;
    return;
  }
  if (modo === "fim" || modo === "ja-votou") {
    tela.innerHTML = `<div class="centro"><div class="fim">FIM</div>
      ${modo === "ja-votou" ? `<div class="msg">Este aparelho já votou nesta eleição.</div>` : ""}</div>
      <div class="votou">VOTOU</div>`;
    return;
  }

  // ---- votando ----
  const cargo = CARGOS[etapa];
  const completo = numero.length === cargo.digitos;
  const cand = completo ? candidatos[`${cargo.id}_${numero}`] : null;

  let caixas = "";
  for (let i = 0; i < cargo.digitos; i++) {
    const pisca = !branco && i === numero.length ? " pisca" : "";
    caixas += `<div class="digito${pisca}">${esc(numero[i] ?? "")}</div>`;
  }

  let meio = "";
  let fotoHtml = "";

  if (branco) {
    meio = `<div class="aviso-grande">VOTO EM BRANCO</div>`;
  } else if (completo && cand) {
    meio = `<div class="info">
      <div class="linha"><span class="rot">Nome:</span><span class="val">${esc(cand.nome)}</span></div>
      <div class="linha"><span class="rot">Partido:</span><span class="val">${esc(cand.partido)}</span></div>
      ${cargo.vice && cand.vice ? `<div class="linha"><span class="rot">${esc(cargo.vice)}:</span><span class="val">${esc(cand.vice)}</span></div>` : ""}
    </div>`;
    fotoHtml = `<div class="foto">
      ${cand.foto ? `<img src="${cand.foto}" alt="">` : `<div class="sem-foto">SEM FOTO</div>`}
      <span>${esc(cargo.nome)}</span></div>`;
  } else if (completo) {
    meio = `<div class="aviso-pequeno">NÚMERO ERRADO</div><div class="aviso-grande">VOTO NULO</div>`;
  }

  const mostrarSeuVoto = completo || branco;
  const dica = (!completo && !branco && numero.length === 0)
    ? `<div class="dica">Digite o número do seu candidato (${cargo.digitos} dígitos)<br>ou aperte BRANCO para votar em branco.</div>` : "";

  tela.innerHTML = `
    <div class="progresso"><i style="width:${(etapa / CARGOS.length) * 100}%"></i></div>
    <div class="cabecalho"><span>${esc(TITULO_ELEICAO)}</span><span>${etapa + 1} / ${CARGOS.length}</span></div>
    <div class="t-corpo">
      <div class="t-esq">
        <div class="seu-voto">${mostrarSeuVoto ? "SEU VOTO PARA" : ""}</div>
        <div class="cargo">${esc(cargo.nome)}</div>
        ${branco ? "" : `<div class="numero"><span class="rotulo">Número:</span>${caixas}</div>`}
        ${dica}${meio}
      </div>
      <div class="t-dir">${fotoHtml}</div>
    </div>
    <div class="instrucoes">
      Aperte a tecla:<br>
      <b>CONFIRMA</b> para confirmar este voto<br>
      <b>CORRIGE</b> para reiniciar este voto
    </div>`;
  atualizarEtapa();
}

function atualizarEtapa() {
  const el = document.getElementById("etapaTxt");
  if (modo === "votando") el.textContent = `${CARGOS[etapa].nome}`;
  else if (modo === "fim" || modo === "ja-votou") el.textContent = "Voto registrado";
  else el.textContent = "";
}

// ---------------- Braille nas teclas ----------------
const BR = { a:[1],b:[1,2],c:[1,4],d:[1,4,5],e:[1,5],f:[1,2,4],g:[1,2,4,5],h:[1,2,5],i:[2,4],j:[2,4,5],
  k:[1,3],l:[1,2,3],m:[1,3,4],n:[1,3,4,5],o:[1,3,5],p:[1,2,3,4],r:[1,2,3,5],s:[2,3,4],t:[2,3,4,5],"#":[3,4,5,6] };
const DIG = { 1:"a",2:"b",3:"c",4:"d",5:"e",6:"f",7:"g",8:"h",9:"i",0:"j" };
function brailleSVG(celulas, r) {
  const passo = r * 2.7, celW = passo + r * 2, gap = r * 2.2;
  const w = celulas.length * celW + (celulas.length - 1) * gap, h = passo * 2 + r * 2;
  let c = "";
  celulas.forEach((ch, i) => {
    const dots = BR[ch] || [];
    const x0 = i * (celW + gap) + r;
    for (let d = 1; d <= 6; d++) {
      const col = d <= 3 ? 0 : 1, row = (d - 1) % 3;
      c += `<circle class="${dots.includes(d) ? "on" : "off"}" cx="${x0 + col * passo}" cy="${r + row * passo}" r="${r}"/>`;
    }
  });
  return `<svg class="braille" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">${c}</svg>`;
}
document.querySelectorAll(".tecla").forEach((b) => b.insertAdjacentHTML("beforeend", brailleSVG(["#", DIG[b.dataset.n]], 2.4)));
document.querySelectorAll(".acao").forEach((b) => b.insertAdjacentHTML("beforeend", brailleSVG(b.dataset.braille.split(""), 1.9)));

// ---------------- Som ----------------
const btnSom = document.getElementById("btnSom");
btnSom.setAttribute("aria-pressed", String(somLigado));
btnSom.addEventListener("click", () => {
  somLigado = !somLigado;
  localStorage.setItem("urna_som", somLigado ? "1" : "0");
  btnSom.setAttribute("aria-pressed", String(somLigado));
});

// ---------------- Ações ----------------
function digitar(n) {
  if (modo !== "votando" || branco) return;
  const cargo = CARGOS[etapa];
  if (numero.length >= cargo.digitos) return;
  tocar("tecla");
  numero += n;
  render();
}

function votoBranco() {
  if (modo !== "votando") return;
  if (numero.length > 0) return; // na urna real é preciso CORRIGE antes
  tocar("tecla");
  branco = true;
  render();
}

function corrige() {
  if (modo !== "votando") return;
  tocar("tecla");
  numero = "";
  branco = false;
  render();
}

async function confirma() {
  if (modo !== "votando") return;
  const cargo = CARGOS[etapa];
  const completo = numero.length === cargo.digitos;
  if (!completo && !branco) return;

  if (branco) cedula[cargo.id] = "BRANCO";
  else if (candidatos[`${cargo.id}_${numero}`]) cedula[cargo.id] = numero;
  else cedula[cargo.id] = "NULO";

  numero = "";
  branco = false;

  if (etapa < CARGOS.length - 1) {
    tocar("confirma");
    etapa++;
    render();
    return;
  }

  // Último cargo: grava o voto
  modo = "gravando";
  render();
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, "eleitores", usuario.uid), { votou: true });
    batch.set(doc(collection(db, "cedulas")), { ...cedula });
    await Promise.all([batch.commit(), new Promise((r) => setTimeout(r, 1400))]);
    localStorage.setItem(chaveLocal(), "1");
    modo = "fim";
    tocar("fim");
    render();
  } catch (e) {
    console.error(e);
    // Se já existe registro deste aparelho, as regras do Firebase recusam
    const jaVotou = await verificarSeJaVotou().catch(() => false);
    if (jaVotou) { modo = "ja-votou"; }
    else { modo = "erro"; erroMsg = "Não foi possível gravar o voto. Verifique a internet e se a votação está aberta."; }
    render();
  }
}
let erroMsg = "";

// ---------------- Teclado (tela e físico) ----------------
function piscarBotao(el) {
  if (!el) return;
  el.classList.add("apertada");
  setTimeout(() => el.classList.remove("apertada"), 110);
}

document.getElementById("teclado").addEventListener("click", (e) => {
  const b = e.target.closest(".tecla");
  if (b) digitar(b.dataset.n);
});
document.getElementById("btnBranco").addEventListener("click", votoBranco);
document.getElementById("btnCorrige").addEventListener("click", corrige);
document.getElementById("btnConfirma").addEventListener("click", confirma);

document.addEventListener("keydown", (e) => {
  if (/^[0-9]$/.test(e.key)) { piscarBotao(document.querySelector(`.tecla[data-n="${e.key}"]`)); digitar(e.key); }
  else if (e.key === "Enter") { piscarBotao(document.getElementById("btnConfirma")); confirma(); }
  else if (e.key === "Backspace" || e.key === "Escape") { piscarBotao(document.getElementById("btnCorrige")); corrige(); }
  else if (e.key.toLowerCase() === "b") { piscarBotao(document.getElementById("btnBranco")); votoBranco(); }
});

// ---------------- Inicialização ----------------
async function verificarSeJaVotou() {
  if (localStorage.getItem(chaveLocal())) return true;
  const snap = await getDoc(doc(db, "eleitores", usuario.uid));
  return snap.exists();
}

function reiniciarVotacao() {
  etapa = 0; numero = ""; branco = false; cedula = {};
}

async function atualizarModo() {
  if (modo === "gravando" || modo === "fim") return;
  if (!eleicao.aberta) { modo = "fechada"; render(); return; }
  if (await verificarSeJaVotou()) { modo = "ja-votou"; render(); return; }
  if (modo !== "votando") { reiniciarVotacao(); modo = "votando"; }
  render();
}

async function iniciar() {
  render();
  if (!pronto) { modo = "erro-config"; render(); return; }

  // Candidatos (públicos)
  onSnapshot(collection(db, "candidatos"), (snap) => {
    candidatos = {};
    snap.forEach((d) => { candidatos[d.id] = d.data(); });
    if (modo === "votando") render();
  });

  onAuthStateChanged(auth, async (u) => {
    if (!u) { await signInAnonymously(auth).catch((e) => { erroMsg = "Ative o login Anônimo no Firebase (Authentication)."; modo = "erro"; render(); console.error(e); }); return; }
    usuario = u;
    // Situação da eleição (aberta/fechada) em tempo real
    onSnapshot(doc(db, "config", "eleicao"), (s) => {
      eleicao = s.exists() ? { aberta: false, rodada: 1, ...s.data() } : { aberta: false, rodada: 1 };
      if (modo === "fim" && !localStorage.getItem(chaveLocal())) modo = "carregando"; // votação zerada
      atualizarModo().catch((e) => { console.error(e); erroMsg = "Erro ao conectar com o banco de dados."; modo = "erro"; render(); });
    }, (e) => { console.error(e); erroMsg = "Erro ao ler a configuração. Verifique as regras do Firestore."; modo = "erro"; render(); });
  });
}

iniciar();
