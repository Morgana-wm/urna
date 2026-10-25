import { db, auth, pronto } from "./firebase.js";
import { CARGOS, ADMIN_EMAIL, TITULO_ELEICAO } from "./config.js";
import {
  collection, doc, setDoc, deleteDoc, getDocs, onSnapshot, writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let candidatos = {};   // id -> dados
let cedulas = [];      // lista de { presidente: "13", ... }
let eleicao = { aberta: false, rodada: 1 };
let fotoAtual = null;  // dataURL
let editando = null;   // id do candidato em edição
let desligar = [];     // listeners ativos

$("tituloEleicao").textContent = TITULO_ELEICAO;

function mostrar(tela) {
  for (const t of ["telaLogin", "telaPainel", "telaAviso"]) $(t).hidden = t !== tela;
}
function aviso(titulo, texto) { $("avisoTitulo").textContent = titulo; $("avisoTexto").innerHTML = texto; mostrar("telaAviso"); }

// ---------------- Login ----------------
$("formLogin").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("erroLogin").textContent = "";
  const btn = e.submitter; btn.disabled = true;
  try {
    await signInWithEmailAndPassword(auth, ADMIN_EMAIL, $("senha").value);
    $("senha").value = "";
  } catch (err) {
    console.error(err);
    $("erroLogin").textContent = "Senha incorreta.";
  } finally { btn.disabled = false; }
});

$("btnSair").addEventListener("click", () => signOut(auth));

// ---------------- Abas ----------------
document.querySelectorAll(".aba").forEach((b) => b.addEventListener("click", () => {
  document.querySelectorAll(".aba").forEach((x) => x.classList.toggle("ativa", x === b));
  document.querySelectorAll(".painel-aba").forEach((p) => { p.hidden = p.id !== `aba-${b.dataset.aba}`; });
}));

// ---------------- Resultados ----------------
function renderResultados() {
  $("kpiVotantes").textContent = cedulas.length;
  $("kpiSituacao").textContent = eleicao.aberta ? "Aberta" : "Encerrada";
  $("kpiSituacao").style.color = eleicao.aberta ? "var(--verde)" : "var(--vermelho)";

  let html = "";
  for (const cargo of CARGOS) {
    const contagem = {}; let brancos = 0, nulos = 0;
    for (const c of cedulas) {
      const v = c[cargo.id];
      if (v === "BRANCO") brancos++;
      else if (v && candidatos[`${cargo.id}_${v}`]) contagem[v] = (contagem[v] || 0) + 1;
      else nulos++;
    }
    const lista = Object.values(candidatos)
      .filter((c) => c.cargo === cargo.id)
      .map((c) => ({ ...c, votos: contagem[c.numero] || 0 }))
      .sort((a, b) => b.votos - a.votos || a.nome.localeCompare(b.nome));
    const validos = lista.reduce((s, c) => s + c.votos, 0);
    const total = cedulas.length;
    const pct = (n, base) => (base ? ((n / base) * 100).toFixed(1).replace(".", ",") : "0,0") + "%";

    html += `<div class="cartao res-cargo"><h3>${esc(cargo.nome)} <small>${validos} votos válidos</small></h3>`;
    if (!lista.length) html += `<p class="vazio">Nenhum candidato cadastrado.</p>`;
    lista.forEach((c, i) => {
      html += `<div class="res-linha ${i === 0 && c.votos > 0 ? "lider" : ""}">
        ${c.foto ? `<img class="res-foto" src="${c.foto}" alt="">` : `<div class="res-foto"></div>`}
        <div><div class="res-nome">${esc(c.numero)} · ${esc(c.nome)} <span>(${esc(c.partido)})</span></div>
          <div class="res-barra"><i style="width:${validos ? (c.votos / validos) * 100 : 0}%"></i></div></div>
        <div class="res-num"><strong>${c.votos}</strong>${pct(c.votos, validos)} dos válidos</div>
      </div>`;
    });
    for (const [rot, n] of [["Brancos", brancos], ["Nulos", nulos]]) {
      html += `<div class="res-linha especial"><div></div>
        <div><div class="res-nome">${rot}</div><div class="res-barra"><i style="width:${total ? (n / total) * 100 : 0}%"></i></div></div>
        <div class="res-num"><strong>${n}</strong>${pct(n, total)} do total</div></div>`;
    }
    html += `</div>`;
  }
  $("listaResultados").innerHTML = html;
}

// ---------------- Candidatos ----------------
const selCargo = $("cCargo");
selCargo.innerHTML = CARGOS.map((c) => `<option value="${c.id}">${esc(c.nome)}</option>`).join("");

function atualizarCamposCargo() {
  const cargo = CARGOS.find((c) => c.id === selCargo.value);
  $("dicaDigitos").textContent = `(${cargo.digitos} dígitos)`;
  $("cNumero").maxLength = cargo.digitos;
  $("cNumero").pattern = `\\d{${cargo.digitos}}`;
  $("cNumero").placeholder = "0".repeat(cargo.digitos);
  $("rotVice").hidden = !cargo.vice;
  $("rotVice").firstChild.textContent = cargo.vice || "Vice";
}
selCargo.addEventListener("change", atualizarCamposCargo);
atualizarCamposCargo();

$("cNumero").addEventListener("input", (e) => { e.target.value = e.target.value.replace(/\D/g, ""); });

function setPrevia(url) {
  fotoAtual = url;
  $("previa").innerHTML = url ? `<img src="${url}" alt="">` : `<span>Sem foto</span>`;
}

// Redimensiona a foto para 300x400 (formato 3:4 da urna) para caber no banco
function redimensionar(arquivo) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const W = 300, H = 400;
      const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
      const ctx = cv.getContext("2d");
      const escala = Math.max(W / img.width, H / img.height);
      const w = img.width * escala, h = img.height * escala;
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
      ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
      URL.revokeObjectURL(img.src);
      resolve(cv.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(arquivo);
  });
}

$("cFoto").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try { setPrevia(await redimensionar(f)); } catch { $("erroCand").textContent = "Não consegui abrir essa imagem."; }
});

function limparForm() {
  editando = null;
  $("formCand").reset();
  setPrevia(null);
  $("tituloForm").textContent = "Adicionar candidato";
  $("btnCancelar").hidden = true;
  selCargo.disabled = false;
  atualizarCamposCargo();
}
$("btnCancelar").addEventListener("click", limparForm);

$("formCand").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("erroCand").textContent = "";
  const cargo = CARGOS.find((c) => c.id === selCargo.value);
  const numero = $("cNumero").value.trim();
  if (numero.length !== cargo.digitos) { $("erroCand").textContent = `O número para ${cargo.nome} precisa ter ${cargo.digitos} dígitos.`; return; }
  const id = `${cargo.id}_${numero}`;
  if (id !== editando && candidatos[id]) { $("erroCand").textContent = `Já existe um candidato ${numero} para ${cargo.nome}.`; return; }

  const dados = {
    cargo: cargo.id,
    numero,
    nome: $("cNome").value.trim(),
    partido: $("cPartido").value.trim(),
    vice: cargo.vice ? $("cVice").value.trim() : "",
    foto: fotoAtual || "",
  };
  const btn = $("btnSalvar"); btn.disabled = true;
  try {
    await setDoc(doc(db, "candidatos", id), dados);
    if (editando && editando !== id) await deleteDoc(doc(db, "candidatos", editando));
    limparForm();
  } catch (err) {
    console.error(err);
    $("erroCand").textContent = "Erro ao salvar. Confira se você está logado como administrador.";
  } finally { btn.disabled = false; }
});

function renderCandidatos() {
  let html = "";
  for (const cargo of CARGOS) {
    const lista = Object.entries(candidatos).filter(([, c]) => c.cargo === cargo.id)
      .sort((a, b) => a[1].numero.localeCompare(b[1].numero));
    html += `<div class="cartao cand-grupo"><h3>${esc(cargo.nome)} (${lista.length})</h3>`;
    if (!lista.length) html += `<p class="vazio">Nenhum candidato.</p>`;
    else {
      html += `<div class="cand-lista">`;
      for (const [id, c] of lista) {
        html += `<div class="cand-item">
          ${c.foto ? `<img src="${c.foto}" alt="">` : `<div class="sem"></div>`}
          <div class="cand-info"><div class="cand-num">${esc(c.numero)}</div><strong>${esc(c.nome)}</strong><span>${esc(c.partido)}${c.vice ? " · " + esc(c.vice) : ""}</span></div>
          <div class="cand-botoes">
            <button class="btn fantasma pequeno" data-editar="${esc(id)}">Editar</button>
            <button class="btn fantasma pequeno" data-apagar="${esc(id)}">Excluir</button>
          </div></div>`;
      }
      html += `</div>`;
    }
    html += `</div>`;
  }
  $("listaCandidatos").innerHTML = html;
}

$("listaCandidatos").addEventListener("click", async (e) => {
  const ed = e.target.closest("[data-editar]");
  const ap = e.target.closest("[data-apagar]");
  if (ed) {
    const id = ed.dataset.editar; const c = candidatos[id];
    editando = id;
    selCargo.value = c.cargo; atualizarCamposCargo();
    $("cNumero").value = c.numero; $("cNome").value = c.nome; $("cPartido").value = c.partido; $("cVice").value = c.vice || "";
    $("cFoto").value = ""; setPrevia(c.foto || null);
    $("tituloForm").textContent = `Editando ${c.nome}`;
    $("btnCancelar").hidden = false;
    $("formCand").scrollIntoView({ behavior: "smooth" });
  }
  if (ap) {
    const c = candidatos[ap.dataset.apagar];
    if (!confirm(`Excluir ${c.numero} - ${c.nome}?`)) return;
    await deleteDoc(doc(db, "candidatos", ap.dataset.apagar)).catch((err) => alert("Erro ao excluir: " + err.message));
  }
});

// ---------------- Votação ----------------
function renderVotacao() {
  const b = $("btnAlternar");
  b.textContent = eleicao.aberta ? "Encerrar votação" : "Abrir votação";
  b.className = "btn " + (eleicao.aberta ? "vermelho" : "primario");
}

$("btnAlternar").addEventListener("click", async () => {
  const b = $("btnAlternar"); b.disabled = true;
  try { await setDoc(doc(db, "config", "eleicao"), { aberta: !eleicao.aberta, rodada: eleicao.rodada || 1 }); }
  catch (err) { alert("Erro: " + err.message); }
  finally { b.disabled = false; }
});

async function apagarColecao(nome) {
  const snap = await getDocs(collection(db, nome));
  let batch = writeBatch(db); let n = 0;
  for (const d of snap.docs) {
    batch.delete(d.ref);
    if (++n % 400 === 0) { await batch.commit(); batch = writeBatch(db); }
  }
  await batch.commit();
}

$("btnZerar").addEventListener("click", async () => {
  if (!confirm("Apagar TODOS os votos? Isso não pode ser desfeito.")) return;
  if (prompt('Digite ZERAR para confirmar') !== "ZERAR") return;
  const b = $("btnZerar"); b.disabled = true; b.textContent = "Zerando...";
  try {
    await apagarColecao("cedulas");
    await apagarColecao("eleitores");
    await setDoc(doc(db, "config", "eleicao"), { aberta: eleicao.aberta, rodada: (eleicao.rodada || 1) + 1 });
    alert("Votação zerada.");
  } catch (err) { alert("Erro ao zerar: " + err.message); }
  finally { b.disabled = false; b.textContent = "Zerar todos os votos"; }
});

// ---------------- Início ----------------
function pararListeners() { desligar.forEach((f) => f()); desligar = []; }

function semPermissao(err) {
  console.error(err);
  pararListeners();
  aviso("Sem permissão", `Esta conta entrou, mas não é o administrador definido nas regras do Firestore.<br><br>
    Confira se o <b>UID</b> no arquivo <code>firestore.rules</code> (e publicado no Firebase) é o UID desta conta.<br><br>
    <button class="btn fantasma" onclick="location.reload()">Tentar de novo</button>`);
}

function iniciarPainel() {
  mostrar("telaPainel");
  desligar.push(onSnapshot(collection(db, "candidatos"), (s) => {
    candidatos = {}; s.forEach((d) => { candidatos[d.id] = d.data(); });
    renderCandidatos(); renderResultados();
  }));
  desligar.push(onSnapshot(doc(db, "config", "eleicao"), (s) => {
    eleicao = s.exists() ? { aberta: false, rodada: 1, ...s.data() } : { aberta: false, rodada: 1 };
    renderVotacao(); renderResultados();
  }));
  desligar.push(onSnapshot(collection(db, "cedulas"), (s) => {
    cedulas = s.docs.map((d) => d.data());
    renderResultados();
  }, semPermissao));
}

if (!pronto) {
  aviso("Urna não configurada", "Edite o arquivo <code>config.js</code> e cole a configuração do seu projeto Firebase.");
} else {
  onAuthStateChanged(auth, (u) => {
    pararListeners();
    if (u && !u.isAnonymous) iniciarPainel();
    else mostrar("telaLogin");
  });
}
