import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ---------------- Modelo de dados ----------------
let projeto = novoProjeto();
let uid = 1;

function novoProjeto() {
  return {
    nome: 'Projeto sem título',
    unidades: 'm',
    andares: [{ id: 1, nome: '1º Pavimento', alturaBase: 0, alturaPisoPiso: 3 }],
    idAndarAtivo: 1,
    elementos: [] // { id, tipo, andar, ...geometria/props }
  };
}

// ---------------- Estado ----------------
let ferramenta = 'selecionar';
let selecao = null;          // id do elemento selecionado
let camadaHistorico = [];
let idxHistorico = -1;
let preview = null;          // pontos temporários da ferramenta atual
let mouse2d = { x: 0, y: 0 }; // coordenadas mundo (m)
let snap = 0.25;
let camera2d = { cx: 5, cy: 5, escala: 48 }; // pixels por metro
let arrastando2d = null;    // { tipo: 'pan' | 'mover' | ... }
let elementoArrastado = null;
let mostrarCotas = true;

const nomeTipo = (t) => ({ parede: 'Parede', porta: 'Porta', janela: 'Janela', laje: 'Laje', coluna: 'Coluna', escada: 'Escada', telhado: 'Telhado', objeto: 'Objeto', pontoEletrico: 'Ponto elétrico', pontoHidraulico: 'Ponto hidráulico' }[t] || t);

// ---------------- Biblioteca de objetos ----------------
const BIBLIOTECA = {
  sofa:        { nome: 'Sofá',           larg: 1.8, prof: 0.85, alt: 0.75, cor: '#8d6e63' },
  cama:        { nome: 'Cama',           larg: 1.4, prof: 1.9,  alt: 0.5,  cor: '#a1887f' },
  mesa:        { nome: 'Mesa',           larg: 1.6, prof: 0.9,  alt: 0.75, cor: '#a0522d' },
  cadeira:     { nome: 'Cadeira',        larg: 0.45, prof: 0.45, alt: 0.9,  cor: '#8b5a2b' },
  geladeira:   { nome: 'Geladeira',      larg: 0.7,  prof: 0.7,  alt: 1.8,  cor: '#b0bec5' },
  fogao:       { nome: 'Fogão',          larg: 0.6,  prof: 0.6,  alt: 0.9,  cor: '#546e7a' },
  pia:         { nome: 'Bancada/Pia',    larg: 1.2,  prof: 0.6,  alt: 0.9,  cor: '#cfd8dc' },
  vaso:        { nome: 'Vaso sanitário', larg: 0.4,  prof: 0.7,  alt: 0.8,  cor: '#eceff1' },
  box:         { nome: 'Box de chuveiro',larg: 0.9,  prof: 0.9,  alt: 2.0,  cor: '#b3e5fc' },
  armario:     { nome: 'Armário',        larg: 1.0,  prof: 0.6,  alt: 2.2,  cor: '#8d6e63' }
};
let objetoSelecionado = 'sofa';
let pontoInstSelecionado = 'tomada';
const PONTOS_INSTALACOES = {
  tomada:      { nome: 'Tomada',          disciplina: 'eletrica',   icone: 'T' },
  interruptor:{ nome: 'Interruptor',     disciplina: 'eletrica',   icone: 'I' },
  luminaria:   { nome: 'Luminária',      disciplina: 'eletrica',   icone: 'L' },
  quadro:      { nome: 'Quadro de luz',  disciplina: 'eletrica',   icone: 'Q' },
  registro:    { nome: 'Registro',        disciplina: 'hidraulica', icone: 'R' },
  torneira:    { nome: 'Torneira',        disciplina: 'hidraulica', icone: 'Fa' },
  ralo:        { nome: 'Ralo',            disciplina: 'hidraulica', icone: 'Ra' },
  caixaAgua:   { nome: 'Caixa d'água',   disciplina: 'hidraulica', icone: 'CA' }
};
Object.keys(PONTOS_INSTALACOES).forEach(k => { PONTOS_INSTALACOES[k].disciplina = PONTOS_INSTALACOES[k].disciplina || PONTOS_INSTALACOES[k].discipline; });
const dimsObjeto = (e) => {
  const def = BIBLIOTECA[e.objeto] || Object.values(BIBLIOTECA)[0];
  return { larg: e.larg ?? def.larg, prof: e.prof ?? def.prof, alt: e.alt ?? def.alt, cor: def.cor, nome: def.nome };
};

// ---------------- Medição e corte ----------------
let medicao = null;      // { x1, y1, x2, y2 }
let cortes = [];         // [{ id, rotulo, x1, y1, x2, y2 }]
let corteAtivo = null;   // id da linha em traçado
let norteGraus = 0;      // orientação do norte (graus, 0 = +Y)

// camadas por disciplina
const CAMADAS = {
  arquitetura: { nome: 'Arquitetura', cor: '#333', visivel: true },
  eletrica:    { nome: 'Elétrica',    cor: '#f2a900', visivel: true },
  hidraulica:  { nome: 'Hidráulica', cor: '#1976d2', visivel: true }
};
const CAMADA_TIPOS = {
  parede: 'arquitetura', porta: 'arquitetura', janela: 'arquitetura', laje: 'arquitetura',
  coluna: 'arquitetura', escada: 'arquitetura', telhado: 'arquitetura', objeto: 'arquitetura',
  pontoEletrico: 'eletrica', pontoHidraulico: 'hidraulica'
};
const camadaDe = (e) => e.camada || CAMADA_TIPOS[e.tipo] || 'arquitetura';
const letraCorte = (i) => String.fromCharCode(65 + i); // A, B, C...

// circuitos elétricos
let circuitos = []; // [{ id, nome, pontos: [{x,y}... ] }]
let circuitoEmTraço = null; // id do circuito em traçado

// sol (simulação de sombras)
let solCfg = { lat: -23.55, hora: 14, dia: 21, mes: 3, ativo: false };

// terreno: grade de elevações (m) sobre malha regular
let terreno = null; // { origem: {x,y}, cel: 5, nx: 25, ny: 25, alturas: [][] }
// tipologias de unidades
let tipologias = []; // [{ id, nome, elementos: [...] }]

const $ = (s) => document.querySelector(s);
const el = (id) => projeto.elementos.find(e => e.id === id);
const andarAtivo = () => projeto.andares.find(a => a.id === projeto.idAndarAtivo);

// ---------------- Histórico (desfazer/refazer) ----------------
function salvarEstado() {
  camadaHistorico = camadaHistorico.slice(0, idxHistorico + 1);
  camadaHistorico.push(JSON.stringify(projeto));
  if (camadaHistorico.length > 60) camadaHistorico.shift();
  idxHistorico = camadaHistorico.length - 1;
}
function desfazer() {
  if (idxHistorico > 0) { idxHistorico--; projeto = JSON.parse(camadaHistorico[idxHistorico]); sincronizar(); }
}
function refazer() {
  if (idxHistorico < camadaHistorico.length - 1) { idxHistorico++; projeto = JSON.parse(camadaHistorico[idxHistorico]); sincronizar(); }
}

// ---------------- Canvas 2D ----------------
const cv2 = $('#cv2d'), cx2 = cv2.getContext('2d');

function redimensionar() {
  [cv2, cv3].forEach(c => {
    const r = c.parentElement.getBoundingClientRect();
    c.width = r.width * devicePixelRatio; c.height = r.height * devicePixelRatio;
  });
  atualizarCamera3d();
  desenhar2d();
}
window.addEventListener('resize', redimensionar);

function mundoParaTela(x, y) {
  return { x: (x - camera2d.cx) * camera2d.escala + cv2.width / devicePixelRatio,
           y: -(y - camera2d.cy) * camera2d.escala + cv2.height / devicePixelRatio };
}
function telaParaMundo(sx, sy) {
  return { x: (sx - cv2.clientWidth / 2) / camera2d.escala + camera2d.cx,
           y: -(sy - cv2.clientHeight / 2) / camera2d.escala + camera2d.cy };
}
function aplicarSnap(v) { return Math.round(v / snap) * snap; }

function desenhar2d() {
  const W = cv2.clientWidth, H = cv2.clientHeight;
  cx2.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  cx2.clearRect(0, 0, W, H);

  // grade
  const passo = 1;
  const iniX = Math.floor(camera2d.cx - W / 2 / camera2d.escala), fimX = Math.ceil(camera2d.cx + W / 2 / camera2d.escala);
  const iniY = Math.floor(camera2d.cy - H / 2 / camera2d.escala), fimY = Math.ceil(camera2d.cy + H / 2 / camera2d.escala);
  cx2.lineWidth = 1;
  for (let x = iniX; x <= fimX; x += passo) {
    const p = mundoParaTela(x, iniY);
    cx2.strokeStyle = x === 0 ? '#c9b03b' : '#e2e4de';
    cx2.beginPath(); cx2.moveTo(p.x, 0); cx2.lineTo(p.x, H); cx2.stroke();
  }
  for (let y = iniY; y <= fimY; y += passo) {
    const p = mundoParaTela(iniX, y);
    cx2.strokeStyle = y === 0 ? '#c9b03b' : '#e2e4de';
    cx2.beginPath(); cx2.moveTo(0, p.y); cx2.lineTo(W, p.y); cx2.stroke();
  }

  const elems = projeto.elementos.filter(e => e.andar === projeto.idAndarAtivo && CAMADAS[camadaDe(e)].visivel);

  // lajes (polígonos)
  for (const e of elems.filter(e => e.tipo === 'laje')) {
    cx2.fillStyle = 'rgba(160,200,230,.35)';
    cx2.strokeStyle = '#4a7fb5';
    if (e.pontos.length >= 3) {
      cx2.beginPath();
      e.pontos.forEach((p, i) => { const s = mundoParaTela(p.x, p.y); i ? cx2.lineTo(s.x, s.y) : cx2.moveTo(s.x, s.y); });
      cx2.closePath(); cx2.fill();
    }
    cx2.beginPath();
    e.pontos.forEach((p, i) => { const s = mundoParaTela(p.x, p.y); i ? cx2.lineTo(s.x, s.y) : cx2.moveTo(s.x, s.y); });
    if (e.fechado) cx2.closePath();
    if (e.id === selecao) { cx2.setLineDash([6, 4]); cx2.lineWidth = 2; }
    cx2.stroke(); cx2.setLineDash([]); cx2.lineWidth = 1;
  }

  // paredes
  for (const e of elems.filter(e => e.tipo === 'parede')) {
    const a = mundoParaTela(e.x1, e.y1), b = mundoParaTela(e.x2, e.y2);
    cx2.strokeStyle = '#333'; cx2.lineWidth = Math.max(2, e.espessura * camera2d.escala);
    cx2.lineCap = 'butt';
    cx2.beginPath(); cx2.moveTo(a.x, a.y); cx2.lineTo(b.x, b.y); cx2.stroke();
    cx2.strokeStyle = e.id === selecao ? '#1565c0' : '#222';
    if (e.id === selecao) {
      cx2.lineWidth = 2; cx2.beginPath(); cx2.moveTo(a.x, a.y); cx2.lineTo(b.x, b.y); cx2.stroke();
      [a, b].forEach(p => { cx2.fillStyle = '#1565c0'; cx2.beginPath(); cx2.arc(p.x, p.y, 4, 0, 7); cx2.fill(); });
    }
  }

  // colunas
  for (const e of elems.filter(e => e.tipo === 'coluna')) {
    const p = mundoParaTela(e.x, e.y);
    const w = e.largura * camera2d.escala, h = e.altura2 * camera2d.escala;
    cx2.fillStyle = '#8d9aa5'; cx2.strokeStyle = e.id === selecao ? '#1565c0' : '#444';
    cx2.fillRect(p.x - w / 2, p.y - h / 2, w, h); cx2.strokeRect(p.x - w / 2, p.y - h / 2, w, h);
  }

  // aberturas (portas/janelas)
  for (const e of elems.filter(e => e.tipo === 'porta' || e.tipo === 'janela')) {
    const parede = el(e.paredeId); if (!parede) continue;
    const ang = Math.atan2(parede.y2 - parede.y1, parede.x2 - parede.x1);
    const t = e.distancia;
    const px = parede.x1 + Math.cos(ang) * t, py = parede.y1 + Math.sin(ang) * t;
    const c = mundoParaTela(px, py);
    const L = e.largura * camera2d.escala, esp = parede.espessura * camera2d.escala;
    cx2.save(); cx2.translate(c.x, c.y); cx2.rotate(-ang);
    cx2.fillStyle = '#fff';
    if (e.tipo === 'porta') {
      cx2.fillRect(-L / 2, -esp / 2, L, esp);
      cx2.strokeStyle = '#b7791f'; cx2.lineWidth = 2;
      cx2.strokeRect(-L / 2, -esp / 2, L, esp);
      cx2.beginPath(); cx2.moveTo(-L / 2, -esp / 2); cx2.lineTo(-L / 2, -esp / 2 - L); // folha da porta
      cx2.moveTo(-L / 2, -esp / 2 - L); cx2.lineTo(L / 2, -esp / 2 - L);
      cx2.lineTo(L / 2, -esp / 2);
      cx2.stroke();
    } else {
      cx2.strokeStyle = '#2a7de1'; cx2.lineWidth = 2;
      cx2.strokeRect(-L / 2, -esp / 2, L, esp);
      cx2.beginPath(); cx2.moveTo(-L / 2, 0); cx2.lineTo(L / 2, 0); cx2.stroke();
    }
    cx2.restore();
  }

  // escadas (2D)
  for (const e of elems.filter(e => e.tipo === 'escada')) {
    const p = mundoParaTela(e.x, e.y);
    const L = e.comprimento * camera2d.escala, W = e.largura * camera2d.escala;
    cx2.save(); cx2.translate(p.x, p.y); cx2.rotate(-e.angulo);
    cx2.fillStyle = 'rgba(220,230,220,.6)'; cx2.strokeStyle = e.id === selecao ? '#1565c0' : '#5a7';
    cx2.lineWidth = e.id === selecao ? 2 : 1;
    const nDeg = Math.max(2, Math.round(e.degraus));
    const altDeg = L / nDeg;
    for (let i = 0; i < nDeg; i++) {
      cx2.fillRect(-L / 2 + i * altDeg, -W / 2, altDeg - 1, W);
      cx2.strokeRect(-L / 2 + i * altDeg, -W / 2, altDeg - 1, W);
    }
    cx2.beginPath(); cx2.moveTo(-L / 2, 0); cx2.lineTo(L / 2, 0); cx2.stroke(); // linha de corte
    cx2.restore();
  }

  // telhados (2D: contorno do beiral)
  for (const e of elems.filter(e => e.tipo === 'telhado')) {
    if (e.pontos.length < 3) continue;
    cx2.strokeStyle = e.id === selecao ? '#1565c0' : '#a0522d';
    cx2.lineWidth = e.id === selecao ? 2 : 1.5;
    cx2.setLineDash(e.id === selecao ? [6, 4] : []);
    cx2.beginPath();
    e.pontos.forEach((p, i) => { const s = mundoParaTela(p.x, p.y); i ? cx2.lineTo(s.x, s.y) : cx2.moveTo(s.x, s.y); });
    cx2.closePath(); cx2.stroke(); cx2.setLineDash([]);
    // cumeiral (linha central aproximada entre 1º e último ponto médio das bordas)
    if (e.tipoTelhado === 'duas-aguas' && e.pontos.length >= 4) {
      const meio1 = { x: (e.pontos[0].x + e.pontos[3].x) / 2, y: (e.pontos[0].y + e.pontos[3].y) / 2 };
      const meio2 = { x: (e.pontos[1].x + e.pontos[2].x) / 2, y: (e.pontos[1].y + e.pontos[2].y) / 2 };
      cx2.strokeStyle = '#8b4513'; cx2.setLineDash([4, 3]);
      const a = mundoParaTela(meio1.x, meio1.y), b = mundoParaTela(meio2.x, meio2.y);
      cx2.beginPath(); cx2.moveTo(a.x, a.y); cx2.lineTo(b.x, b.y); cx2.stroke(); cx2.setLineDash([]);
    }
  }

  // objetos (mobiliário/sanitários)
  for (const e of elems.filter(e => e.tipo === 'objeto')) {
    const def = dimsObjeto(e);
    const p = mundoParaTela(e.x, e.y);
    const L = def.larg * camera2d.escala, P = def.prof * camera2d.escala;
    cx2.save(); cx2.translate(p.x, p.y); cx2.rotate(-e.angulo || 0);
    cx2.fillStyle = def.cor + '99';
    cx2.strokeStyle = e.id === selecao ? '#1565c0' : '#5d4037';
    cx2.lineWidth = e.id === selecao ? 2 : 1;
    cx2.fillRect(-L / 2, -P / 2, L, P);
    cx2.strokeRect(-L / 2, -P / 2, L, P);
    cx2.fillStyle = '#333'; cx2.font = `${Math.min(11, L / 6)}px sans-serif`;
    cx2.textAlign = 'center'; cx2.textBaseline = 'middle';
    if (L > 34) cx2.fillText(def.nome, 0, 0);
    // marca de rotação (setinha)
    cx2.beginPath(); cx2.moveTo(-L / 2, 0); cx2.lineTo(-L / 2 - 9, 0); cx2.stroke();
    cx2.restore();
  }

  // terreno (curvas de nível)
  desenharTerreno2d();

  // pontos de instalações (elétrica/hidráulica)
  for (const e of elems.filter(e => e.tipo === 'pontoEletrico' || e.tipo === 'pontoHidraulico')) {
    const def = PONTOS_INSTALACOES[e.ponto] || Object.values(PONTOS_INSTALACOES)[0];
    const cor = e.tipo === 'pontoEletrico' ? '#f2a900' : '#1976d2';
    const p = mundoParaTela(e.x, e.y);
    cx2.save();
    cx2.strokeStyle = cor; cx2.fillStyle = cor; cx2.lineWidth = 1.5;
    // círculo com o ícone
    cx2.beginPath(); cx2.arc(p.x, p.y, 8, 0, Math.PI * 2);
    if (e.id === selecao) { cx2.lineWidth = 3; }
    cx2.stroke();
    cx2.font = 'bold 9px sans-serif'; cx2.textAlign = 'center'; cx2.textBaseline = 'middle';
    cx2.fillText(def.icone, p.x, p.y);
    // linha de indicação (leader)
    cx2.beginPath(); cx2.moveTo(p.x + 8, p.y - 8); cx2.lineTo(p.x + 16, p.y - 16); cx2.stroke();
    cx2.font = '9px sans-serif'; cx2.textAlign = 'left';
    if (camera2d.escala > 30) cx2.fillText(def.nome, p.x + 18, p.y - 16);
    cx2.restore();
  }

  // fiação de circuitos elétricos
  for (const cir of circuitos) {
    if (!cir.pontos.length) continue;
    cx2.strokeStyle = '#c77800'; cx2.lineWidth = 2;
    cx2.setLineDash([]);
    cx2.beginPath();
    const p0 = mundoParaTela(cir.pontos[0].x, cir.pontos[0].y);
    cx2.moveTo(p0.x, p0.y);
    for (let i = 1; i < cir.pontos.length; i++) {
      const p = mundoParaTela(cir.pontos[i].x, cir.pontos[i].y);
      // fiação ortogonal (duas pernas)
      const anterior = cir.pontos[i - 1];
      const meioX = anterior.x, meioY = cir.pontos[i].y;
      const mA = mundoParaTela(meioX, meioY);
      cx2.lineTo(mA.x, mA.y);
      cx2.lineTo(p.x, p.y);
    }
    cx2.stroke();
    // rótulo do circuito
    const m = mundoParaTela(cir.pontos[0].x, cir.pontos[0].y);
    cx2.font = 'bold 10px sans-serif'; cx2.fillStyle = '#c77800'; cx2.textAlign = 'left';
    cx2.fillText(cir.nome, m.x + 6, m.y - 6);
  }

  // linhas de corte (múltiplas, com rótulos)
  for (const lc of cortes) {
    const a = mundoParaTela(lc.x1, lc.y1), b = mundoParaTela(lc.x2, lc.y2);
    cx2.strokeStyle = '#d81b60'; cx2.lineWidth = 2; cx2.setLineDash([10, 6]);
    cx2.beginPath(); cx2.moveTo(a.x, a.y); cx2.lineTo(b.x, b.y); cx2.stroke(); cx2.setLineDash([]);
    cx2.fillStyle = '#d81b60';
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    [a, b].forEach(pt => {
      cx2.beginPath();
      cx2.moveTo(pt.x + Math.cos(ang + Math.PI / 2) * 9, pt.y + Math.sin(ang + Math.PI / 2) * 9);
      cx2.lineTo(pt.x + Math.cos(ang) * 7, pt.y + Math.sin(ang) * 7);
      cx2.lineTo(pt.x + Math.cos(ang - Math.PI / 2) * 9, pt.y + Math.sin(ang - Math.PI / 2) * 9);
      cx2.closePath(); cx2.fill();
    });
    // rótulo nas duas extremidades
    cx2.font = 'bold 12px sans-serif'; cx2.fillStyle = '#d81b60';
    const rot = lc.rotulo;
    [a, b].forEach(pt => {
      const ox = Math.cos(ang) * 16, oy = Math.sin(ang) * 16;
      cx2.fillText(rot, pt.x - ox, pt.y - oy - 4);
    });
  }

  // rosa dos ventos / norte (canto superior direito da tela)
  {
    const cx0 = cv2.clientWidth - 46, cy0 = 46, raio = 24;
    cx2.save();
    cx2.strokeStyle = '#555'; cx2.fillStyle = '#555'; cx2.lineWidth = 1.5;
    cx2.beginPath(); cx2.arc(cx0, cy0, raio, 0, Math.PI * 2); cx2.stroke();
    const rad = -norteGraus * Math.PI / 180 - Math.PI / 2; // 0° = cima
    const nx = Math.cos(rad) * (raio - 2), ny = Math.sin(rad) * (raio - 2);
    cx2.beginPath();
    cx2.moveTo(cx0 + nx * 0.3, cy0 + ny * 0.3);
    cx2.lineTo(cx0 + nx, cy0 + ny);
    cx2.lineWidth = 3; cx2.stroke();
    // seta da ponta
    cx2.beginPath();
    cx2.moveTo(cx0 + nx, cy0 + ny);
    cx2.lineTo(cx0 + nx * 0.62 + Math.cos(rad + Math.PI/2) * 5, cy0 + ny * 0.62 + Math.sin(rad + Math.PI/2) * 5);
    cx2.lineTo(cx0 + nx * 0.62 + Math.cos(rad - Math.PI/2) * 5, cy0 + ny * 0.62 + Math.sin(rad - Math.PI/2) * 5);
    cx2.closePath(); cx2.fill();
    cx2.font = 'bold 11px sans-serif'; cx2.textAlign = 'center';
    cx2.fillText('N', cx0 + nx * 1.5, cy0 + ny * 1.5 + 4);
    cx2.restore();
  }

  // medição livre
  if (medicao) {
    const a = mundoParaTela(medicao.x1, medicao.y1), b = mundoParaTela(medicao.x2, medicao.y2);
    const dist = Math.hypot(medicao.x2 - medicao.x1, medicao.y2 - medicao.y1);
    cx2.strokeStyle = '#00897b'; cx2.lineWidth = 1.5;
    cx2.beginPath(); cx2.moveTo(a.x, a.y); cx2.lineTo(b.x, b.y); cx2.stroke();
    [a, b].forEach(p => { cx2.fillStyle = '#00897b'; cx2.beginPath(); cx2.arc(p.x, p.y, 3, 0, 7); cx2.fill(); });
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    cx2.save(); cx2.translate(mx, my);
    let at = ang; if (at > Math.PI / 2 || at < -Math.PI / 2) at += Math.PI;
    cx2.rotate(at);
    const texto = dist.toFixed(2).replace('.', ',') + ' m';
    cx2.font = 'bold 12px sans-serif';
    const tw = cx2.measureText(texto).width;
    cx2.fillStyle = '#fff'; cx2.fillRect(-tw / 2 - 3, -16, tw + 6, 15);
    cx2.fillStyle = '#00695c'; cx2.textAlign = 'center'; cx2.fillText(texto, 0, -5);
    cx2.restore();
  }

  // cotas automáticas
  if (mostrarCotas) {
    cx2.font = '11px sans-serif'; cx2.textAlign = 'center';
    for (const e of elems.filter(e => e.tipo === 'parede')) {
      const compr = Math.hypot(e.x2 - e.x1, e.y2 - e.y1);
      if (compr < 0.05) continue;
      const ang = Math.atan2(e.y2 - e.y1, e.x2 - e.x1);
      const offset = (e.espessura / 2 + 0.55); // deslocamento perpendicular em metros
      const ox = Math.cos(ang + Math.PI / 2) * offset, oy = Math.sin(ang + Math.PI / 2) * offset;
      const a = mundoParaTela(e.x1 + ox, e.y1 + oy), b = mundoParaTela(e.x2 + ox, e.y2 + oy);
      cx2.strokeStyle = '#c0392b'; cx2.fillStyle = '#c0392b'; cx2.lineWidth = 1;
      cx2.beginPath(); cx2.moveTo(a.x, a.y); cx2.lineTo(b.x, b.y); cx2.stroke();
      // traços nas extremidades
      const tamT = 6;
      [a, b].forEach(p => {
        cx2.beginPath();
        cx2.moveTo(p.x - tamT / 2, p.y - tamT / 2); cx2.lineTo(p.x + tamT / 2, p.y + tamT / 2);
        cx2.stroke();
      });
      // texto no meio, girado para acompanhar a parede
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      cx2.save();
      cx2.translate(mx, my);
      let angTexto = -ang;
      if (angTexto > Math.PI / 2 || angTexto < -Math.PI / 2) angTexto += Math.PI;
      cx2.rotate(angTexto);
      const texto = compr.toFixed(2).replace('.', ',') + ' m';
      cx2.fillStyle = '#fff'; cx2.strokeStyle = '#c0392b';
      const tw = cx2.measureText(texto).width;
      cx2.strokeRect(-tw / 2 - 2, -8, tw + 4, 14);
      cx2.fillRect(-tw / 2 - 2, -8, tw + 4, 14);
      cx2.fillStyle = '#c0392b'; cx2.fillText(texto, 0, 3);
      cx2.restore();
    }
  }

  // preview da ferramenta atual
  if (preview && preview.pontos.length) {
    cx2.strokeStyle = '#d81b60'; cx2.lineWidth = 1.5; cx2.setLineDash([5, 4]);
    cx2.beginPath();
    preview.pontos.forEach((p, i) => { const s = mundoParaTela(p.x, p.y); i ? cx2.lineTo(s.x, s.y) : cx2.moveTo(s.x, s.y); });
    if (mouse2d && !preview.fechado) { const m = mundoParaTela(mouse2d.x, mouse2d.y); cx2.lineTo(m.x, m.y); }
    cx2.stroke(); cx2.setLineDash([]);
  }

  // régua das coordenadas
  $('#stCoord').textContent = `X: ${mouse2d.x.toFixed(2)} m, Y: ${mouse2d.y.toFixed(2)} m`;
}

// ---------------- Canvas 3D ----------------
const cv3 = $('#cv3d');
const renderer = new THREE.WebGLRenderer({ canvas: cv3, antialias: true });
renderer.setPixelRatio(devicePixelRatio);
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#dfe8ee');
const camera3 = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
camera3.position.set(15, 12, 15);
const controls = new OrbitControls(camera3, cv3);
controls.target.set(5, 1, 5);
controls.enableDamping = true;
scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const sol = new THREE.DirectionalLight(0xffffff, 1.2);
sol.name = 'solDirecional';
sol.position.set(10, 20, 8); sol.castShadow = true;
sol.shadow.mapSize.set(2048, 2048);
scene.add(sol);

function atualizarCamera3d() {
  const r = cv3.parentElement.getBoundingClientRect();
  camera3.aspect = Math.max(0.1, r.width / r.height);
  camera3.updateProjectionMatrix();
  renderer.setSize(r.width, r.height, false);
}

function reconstruir3d() {
  while (scene.children.length) {
    const c = scene.children.pop();
    c.traverse?.(o => { o.geometry?.dispose?.(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose()); });
  }
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const s2 = new THREE.DirectionalLight(0xffffff, 1.2);
  s2.name = 'solDirecional';
  s2.position.set(10, 20, 8); s2.castShadow = true; s2.shadow.mapSize.set(2048, 2048);
  scene.add(s2);

  reconstruirTerreno3d();

  // chão / terreno
  const chao = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshLambertMaterial({ color: 0xa9c0a5 }));
  chao.rotation.x = -Math.PI / 2; chao.position.set(5, -0.01, 5); chao.receiveShadow = true;
  scene.add(chao);

  for (const a of projeto.andares) {
    const z0 = a.alturaBase, h = a.alturaPisoPiso;
    const elems = projeto.elementos.filter(e => e.andar === a.id);

    for (const e of elems.filter(e => e.tipo === 'parede')) {
      const dx = e.x2 - e.x1, dy = e.y2 - e.y1;
      const comprimento = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
      const geometria = new THREE.BoxGeometry(comprimento, h, e.espessura);
      const malha = new THREE.Mesh(geometria, new THREE.MeshLambertMaterial({ color: e.cor || '#e8e4dc' }));
      malha.position.set((e.x1 + e.x2) / 2, z0 + h / 2, -(e.y1 + e.y2) / 2);
      malha.rotation.y = ang;
      malha.castShadow = true; malha.receiveShadow = true;
      scene.add(malha);
      // furos das aberturas desta parede
      const aberturas = elems.filter(o => (o.tipo === 'porta' || o.tipo === 'janela') && o.paredeId === e.id);
      for (const ab of aberturas) {
        const zBase = ab.tipo === 'porta' ? z0 : z0 + ab.peitoril;
        const alt = ab.tipo === 'porta' ? ab.altura : ab.altura;
        const g2 = new THREE.BoxGeometry(ab.largura, alt, e.espessura + 0.06);
        const m2 = new THREE.Mesh(g2, new THREE.MeshLambertMaterial({ color: ab.tipo === 'porta' ? '#7a4a21' : '#bfe0f5' }));
        const px = e.x1 + Math.cos(ang) * (ab.distancia), py = e.y1 + Math.sin(ang) * (ab.distancia);
        m2.position.set(px, zBase + alt / 2, -py);
        m2.rotation.y = ang;
        scene.add(m2);
      }
    }

    for (const e of elems.filter(e => e.tipo === 'laje')) {
      if (e.pontos.length < 3 || !e.fechado) continue;
      const forma = new THREE.Shape();
      e.pontos.forEach((p, i) => i ? forma.lineTo(p.x, -p.y) : forma.moveTo(p.x, -p.y));
      const g = new THREE.ExtrudeGeometry(forma, { depth: e.espessura || 0.2, bevelEnabled: false });
      const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: '#cfd3d6' }));
      m.rotation.x = Math.PI / 2;
      m.position.y = z0 + h;
      scene.add(m);
    }

    for (const e of elems.filter(e => e.tipo === 'coluna')) {
      const g = new THREE.BoxGeometry(e.largura, h, e.altura2);
      const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: '#9aa5ad' }));
      m.position.set(e.x, z0 + h / 2, -e.y);
      m.castShadow = true;
      scene.add(m);
    }

    // escadas: degraus empilhados (caixa de escada reta)
    for (const e of elems.filter(e => e.tipo === 'escada')) {
      const nDeg = Math.max(2, Math.round(e.degraus));
      const altDeg = h / nDeg;
      const compDeg = e.comprimento / nDeg;
      for (let i = 0; i < nDeg; i++) {
        const g = new THREE.BoxGeometry(compDeg, altDeg * (i + 1), e.largura);
        const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: '#c9b8a0' }));
        const dist = -e.comprimento / 2 + compDeg * (i + 0.5);
        const dx = Math.cos(e.angulo) * dist, dy = Math.sin(e.angulo) * dist;
        m.position.set(e.x + dx, z0 + (altDeg * (i + 1)) / 2, -(e.y + dy));
        m.rotation.y = e.angulo;
        m.castShadow = true;
        scene.add(m);
      }
    }

    // objetos (mobiliário/sanitários) como caixas
    for (const e of elems.filter(e => e.tipo === 'pontoEletrico' || e.tipo === 'pontoHidraulico')) {
      const def = PONTOS_INSTALACOES[e.ponto] || Object.values(PONTOS_INSTALACOES)[0];
      const classe = e.tipo === 'pontoEletrico' ? 'IFCELECTRICAPPLIANCE' : 'IFCSANITARYTERMINAL';
      const idPerfil = novoId();
      const hw = 0.12, hp = 0.12;
      const v1 = xyz(e.x - hw, -(e.y - hp), 0), v2 = xyz(e.x + hw, -(e.y - hp), 0),
            v3 = xyz(e.x + hw, -(e.y + hp), 0), v4 = xyz(e.x - hw, -(e.y + hp), 0);
      const poly = novoId();
      add(`#${poly}=IFCPOLYLINE((#${v1},#${v2},#${v3},#${v4},#${v1}));`);
      add(`#${idPerfil}=IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,#${poly});`);
      const pos = novoId();
      add(`#${pos}=IFCAXIS2PLACEMENT3D(#${xyz(0,0,0)},$,$);`);
      const pds = corpoExtrudado(idPerfil, 0.05, pos);
      add(`#${novoId()}=${classe}('${guidIFC()}',#${idDono},'${escIFC(def.nome)} ${e.id}',$,$,#${idsPlaceAndar[a.id]},#${pds},$);`);
    }

    for (const e of elems.filter(e => e.tipo === 'objeto')) {
      const def = dimsObjeto(e);
      const g = new THREE.BoxGeometry(def.larg, def.alt, def.prof);
      const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: def.cor }));
      m.position.set(e.x, z0 + def.alt / 2, -e.y);
      m.rotation.y = e.angulo || 0;
      m.castShadow = true;
      scene.add(m);
    }

    // telhados: duas águas a partir do polígono (usando eixo 1º-3º vértice como cumeiral)
    for (const e of elems.filter(e => e.tipo === 'telhado' && e.fechado && e.pontos.length >= 4)) {
      const zTopo = z0 + h + e.altura;
      // base (beiral) como extrusão fina
      const formaB = new THREE.Shape();
      e.pontos.forEach((p, i) => i ? formaB.lineTo(p.x, -p.y) : formaB.moveTo(p.x, -p.y));
      const gB = new THREE.ExtrudeGeometry(formaB, { depth: e.espessura, bevelEnabled: false });
      const mB = new THREE.Mesh(gB, new THREE.MeshLambertMaterial({ color: '#b0532d' }));
      mB.rotation.x = Math.PI / 2; mB.position.y = z0 + h;
      scene.add(mB);
      // duas águas: cada água é um prisma triangular entre pares de vértices opostos
      const [p0, p1, p2, p3] = e.pontos;
      const aguas = [[p0, p1], [p2, p3], [p3, p0], [p1, p2]].filter(par => par.every(Boolean));
      for (const [pa, pb] of aguas) {
        const gA = new THREE.BufferGeometry();
        const y0 = z0 + h, y1 = zTopo;
        // vértices do prisma: beiral (2 pts) + cumeiral no ponto médio elevado
        const mx2 = (pa.x + pb.x) / 2, my2 = (pa.y + pb.y) / 2;
        const verts = new Float32Array([
          pa.x, y0, -pa.y,  pb.x, y0, -pb.y,  mx2, y1, -my2
        ]);
        gA.setAttribute('position', new THREE.BufferAttribute(verts, 3));
        gA.computeVertexNormals();
        const mA = new THREE.Mesh(gA, new THREE.MeshLambertMaterial({ color: '#a0522d', side: THREE.DoubleSide }));
        mA.castShadow = true;
        scene.add(mA);
      }
    }
  }
}

// loop de render
function animar() {
  controls.update();
  renderer.render(scene, camera3);
  requestAnimationFrame(animar);
}

// ---------------- Interações 2D ----------------
let espacoPressionado = false;
window.addEventListener('keydown', ev => {
  if (ev.target.tagName === 'INPUT') return;
  if (ev.key === 'Escape') { preview = null; circuitoEmTraço = null; desenhar2d(); }
  if (ev.key === ' ') { espacoPressionado = true; }
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') { ev.preventDefault(); ev.shiftKey ? refazer() : desfazer(); }
  if ((ev.key === 'Delete' || ev.key === 'Backspace') && selecao) { apagarElemento(selecao); }
});
window.addEventListener('keyup', ev => { if (ev.key === ' ') espacoPressionado = false; });

function posMouse2d(ev) {
  const r = cv2.getBoundingClientRect();
  return telaParaMundo(ev.clientX - r.left, ev.clientY - r.top);
}

cv2.addEventListener('wheel', ev => {
  ev.preventDefault();
  const antes = telaParaMundo(ev.offsetX, ev.offsetY);
  camera2d.escala *= ev.deltaY < 0 ? 1.12 : 1 / 1.12;
  camera2d.escala = Math.min(400, Math.max(6, camera2d.escala));
  const depois = telaParaMundo(ev.offsetX, ev.offsetY);
  camera2d.cx += antes.x - depois.x; camera2d.cy += antes.y - depois.y;
  desenhar2d();
}, { passive: false });

cv2.addEventListener('mousedown', ev => {
  if (ev.button === 1 || espacoPressionado) { arrastando2d = { tipo: 'pan', x: ev.clientX, y: ev.clientY }; return; }
  if (tipologiaParaEstampar != null) { const m0 = posMouse2d(ev); clicarEstamparTipologia(m0.x, m0.y); return; }
  const m = posMouse2d(ev);
  const mx = aplicarSnap(m.x), my = aplicarSnap(m.y);

  if (ferramenta === 'parede') {
    if (!preview) preview = { pontos: [] };
    preview.pontos.push({ x: mx, y: my });
    if (preview.pontos.length === 2) {
      const [p1, p2] = preview.pontos;
      projeto.elementos.push({ id: ++uid, tipo: 'parede', andar: projeto.idAndarAtivo,
        x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, espessura: 0.15, cor: '#e8e4dc' });
      preview = { pontos: [{ ...p2 }] }; // encadeia paredes
      salvarEstado(); sincronizar();
    }
    desenhar2d();
  } else if (ferramenta === 'laje') {
    if (!preview) preview = { pontos: [], fechado: false };
    if (preview.pontos.length >= 3 && Math.hypot(mx - preview.pontos[0].x, my - preview.pontos[0].y) < 0.4) {
      projeto.elementos.push({ id: ++uid, tipo: 'laje', andar: projeto.idAndarAtivo, pontos: preview.pontos, fechado: true, espessura: 0.2 });
      preview = null; salvarEstado(); sincronizar();
    } else {
      preview.pontos.push({ x: mx, y: my });
    }
    desenhar2d();
  } else if (ferramenta === 'coluna') {
    projeto.elementos.push({ id: ++uid, tipo: 'coluna', andar: projeto.idAndarAtivo, x: mx, y: my, largura: 0.3, altura2: 0.3 });
    salvarEstado(); sincronizar();
  } else if (ferramenta === 'escada') {
    if (!preview) { preview = { pontos: [{ x: mx, y: my }] }; }
    else {
      const p1 = preview.pontos[0];
      const comprimento = Math.hypot(mx - p1.x, my - p1.y);
      if (comprimento < 0.5) { alert('Escada muito curta — clique o início e depois o fim da escada.'); return; }
      projeto.elementos.push({ id: ++uid, tipo: 'escada', andar: projeto.idAndarAtivo,
        x: (p1.x + mx) / 2, y: (p1.y + my) / 2,
        comprimento, largura: 0.9, angulo: Math.atan2(my - p1.y, mx - p1.x),
        degraus: Math.max(2, Math.round(comprimento / 0.28)) });
      preview = null; salvarEstado(); sincronizar();
    }
    desenhar2d();
  } else if (ferramenta === 'telhado') {
    if (!preview) preview = { pontos: [], fechado: false };
    if (preview.pontos.length >= 3 && Math.hypot(mx - preview.pontos[0].x, my - preview.pontos[0].y) < 0.4) {
      projeto.elementos.push({ id: ++uid, tipo: 'telhado', andar: projeto.idAndarAtivo, pontos: preview.pontos, fechado: true,
        altura: 1.8, espessura: 0.15, tipoTelhado: 'duas-aguas', beiral: 0.5 });
      preview = null; salvarEstado(); sincronizar();
    } else {
      preview.pontos.push({ x: mx, y: my });
    }
    desenhar2d();
  } else if (ferramenta === 'objeto') {
    const def = BIBLIOTECA[objetoSelecionado];
    projeto.elementos.push({ id: ++uid, tipo: 'objeto', andar: projeto.idAndarAtivo,
      x: mx, y: my, angulo: 0, objeto: objetoSelecionado,
      larg: def.larg, prof: def.prof, alt: def.alt });
    salvarEstado(); sincronizar();
  } else if (ferramenta === 'terreno') {
    ferramentaTerrenoClick(m.x, m.y, ev.shiftKey);
  } else if (ferramenta === 'circuito') {
    // snap: se houver ponto elétrico perto, usa sua posição
    const perto = projeto.elementos.find(e => e.tipo === 'pontoEletrico' &&
      Math.hypot(e.x - m.x, e.y - m.y) < 0.3);
    const px = perto ? perto.x : mx, py = perto ? perto.y : my;
    if (circuitoEmTraço == null) {
      const nome = 'C' + (circuitos.length + 1);
      circuitos.push({ id: ++uid, nome, pontos: [{ x: px, y: py }] });
      circuitoEmTraço = circuitos[circuitos.length - 1].id;
    } else {
      const cir = circuitos.find(x => x.id === circuitoEmTraço);
      const ultimo = cir.pontos[cir.pontos.length - 1];
      if (Math.hypot(px - ultimo.x, py - ultimo.y) < 0.01) return;
      cir.pontos.push({ x: px, y: py });
    }
    desenhar2d();
  } else if (ferramenta === 'pontoInst') {
    const def = PONTOS_INSTALACOES[pontoInstSelecionado];
    const tipo = def.disciplina === 'eletrica' ? 'pontoEletrico' : 'pontoHidraulico';
    projeto.elementos.push({ id: ++uid, tipo, andar: projeto.idAndarAtivo,
      x: mx, y: my, ponto: pontoInstSelecionado });
    salvarEstado(); sincronizar();
  } else if (ferramenta === 'medir') {
    if (!medicao) medicao = { x1: mx, y1: my, x2: mx, y2: my };
    else { medicao = null; desenhar2d(); }
  } else if (ferramenta === 'corte') {
    if (corteAtivo == null) {
      const novo = { id: ++uid, rotulo: letraCorte(cortes.length), x1: mx, y1: my, x2: mx, y2: my };
      cortes.push(novo);
      corteAtivo = novo.id;
    } else {
      const lc = cortes.find(x => x.id === corteAtivo);
      lc.x2 = mx; lc.y2 = my;
      corteAtivo = null;
      desenhar2d();
    }
  } else if (ferramenta === 'porta' || ferramenta === 'janela') {
    const parede = paredeSobMouse(m.x, m.y);
    if (!parede) { alert('Clique sobre uma parede para inserir ' + (ferramenta === 'porta' ? 'a porta' : 'a janela') + '.'); return; }
    const d = distanciaNaParede(parede, m.x, m.y);
    const obj = { id: ++uid, tipo: ferramenta, andar: projeto.idAndarAtivo, paredeId: parede.id,
      distancia: d, largura: ferramenta === 'porta' ? 0.9 : 1.2, altura: ferramenta === 'porta' ? 2.1 : 1.2, peitoril: 1.0 };
    projeto.elementos.push(obj);
    salvarEstado(); sincronizar();
  } else if (ferramenta === 'selecionar' || ferramenta === 'apagar') {
    const clicado = elementoSobMouse(m.x, m.y);
    if (ferramenta === 'apagar' && clicado) { apagarElemento(clicado.id); return; }
    selecao = clicado ? clicado.id : null;
    atualizarPainelProps(); desenhar2d();
  }
});

cv2.addEventListener('mousemove', ev => {
  const m = posMouse2d(ev);
  mouse2d = { x: m.x, y: m.y };
  if (arrastando2d?.tipo === 'pan') {
    camera2d.cx -= (ev.clientX - arrastando2d.x) / camera2d.escala;
    camera2d.cy += (ev.clientY - arrastando2d.y) / camera2d.escala;
    arrastando2d.x = ev.clientX; arrastando2d.y = ev.clientY;
  }
  if (ferramenta === 'medir' && medicao) { medicao.x2 = m.x; medicao.y2 = m.y; desenhar2d(); }
  else if (ferramenta === 'corte' && corteAtivo != null) { const lc = cortes.find(x => x.id === corteAtivo); if (lc) { lc.x2 = m.x; lc.y2 = m.y; desenhar2d(); } }
  else if (['parede', 'laje', 'telhado', 'escada'].includes(ferramenta) && preview) desenhar2d();
  else atualizarCoordStatus(m);
  else if (ferramenta === 'selecionar' || ferramenta === 'apagar') { $('#stCoord').textContent = `X: ${m.x.toFixed(2)} m, Y: ${m.y.toFixed(2)} m`; }
});

cv2.addEventListener('mouseup', () => {
  arrastando2d = null;
  if (ferramenta === 'medir' && medicao) { medicao = { ...medicao }; desenhar2d(); }
});
cv2.addEventListener('dblclick', () => {
  if ((ferramenta === 'laje' || ferramenta === 'telhado') && preview && preview.pontos.length >= 3) {
    const tipo = ferramenta;
    const comum = { id: ++uid, tipo, andar: projeto.idAndarAtivo, pontos: preview.pontos, fechado: true };
    if (tipo === 'laje') Object.assign(comum, { espessura: 0.2 });
    else Object.assign(comum, { altura: 1.8, espessura: 0.15, tipoTelhado: 'duas-aguas', beiral: 0.5 });
    projeto.elementos.push(comum);
    preview = null; salvarEstado(); sincronizar();
  } else if (ferramenta === 'parede' || ferramenta === 'escada') { preview = null; desenhar2d(); }
  else if (ferramenta === 'circuito') { circuitoEmTraço = null; desenhar2d(); }
});
cv2.addEventListener('contextmenu', ev => { ev.preventDefault(); preview = null; desenhar2d(); });

function paredeSobMouse(x, y) {
  let melhor = null, melhorD = 0.3;
  for (const e of projeto.elementos.filter(e => e.tipo === 'parede' && e.andar === projeto.idAndarAtivo)) {
    const d = distanciaPontoSegmento(x, y, e.x1, e.y1, e.x2, e.y2);
    if (d < melhorD) { melhorD = d; melhor = e; }
  }
  return melhor;
}
function distanciaPontoSegmento(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
function distanciaNaParede(parede, x, y) {
  const dx = parede.x2 - parede.x1, dy = parede.y2 - parede.y1;
  return Math.max(0, Math.min(Math.hypot(dx, dy), ((x - parede.x1) * dx + (y - parede.y1) * dy) / (Math.hypot(dx, dy) || 1)));
}
function atualizarCoordStatus(m) {
  $('#stCoord').textContent = `X: ${m.x.toFixed(2)} m, Y: ${m.y.toFixed(2)} m`;
}
function elementoSobMouse(x, y) {
  // ordem de prioridade: aberturas > escadas > colunas > telhados > lajes > paredes
  for (const e of projeto.elementos.filter(e => e.andar === projeto.idAndarAtivo && (e.tipo === 'pontoEletrico' || e.tipo === 'pontoHidraulico'))) {
    if (Math.hypot(x - e.x, y - e.y) < 0.25) return e;
  }
  for (const e of projeto.elementos.filter(e => e.andar === projeto.idAndarAtivo && e.tipo === 'objeto')) {
    const def = dimsObjeto(e);
    const co = Math.cos(-(e.angulo || 0)), si = Math.sin(-(e.angulo || 0));
    const dx = x - e.x, dy = y - e.y;
    const lx = dx * co - dy * si, ly = dx * si + dy * co;
    if (Math.abs(lx) < def.larg / 2 && Math.abs(ly) < def.prof / 2) return e;
  }
  for (const e of projeto.elementos.filter(e => e.andar === projeto.idAndarAtivo && e.tipo === 'escada')) {
    const c = Math.cos(-e.angulo), s = Math.sin(-e.angulo);
    const dx = x - e.x, dy = y - e.y;
    const lx = dx * c - dy * s, ly = dx * s + dy * c;
    if (Math.abs(lx) < e.comprimento / 2 && Math.abs(ly) < e.largura / 2) return e;
  }
  for (const e of projeto.elementos.filter(e => e.andar === projeto.idAndarAtivo && (e.tipo === 'porta' || e.tipo === 'janela'))) {
    const p = el(e.paredeId); if (!p) continue;
    const ang = Math.atan2(p.y2 - p.y1, p.x2 - p.x1);
    const px = p.x1 + Math.cos(ang) * e.distancia, py = p.y1 + Math.sin(ang) * e.distancia;
    if (Math.abs(x - px) < e.largura / 2 + 0.1 && Math.abs(y - py) < p.espessura / 2 + 0.15) return e;
  }
  for (const e of projeto.elementos.filter(e => e.andar === projeto.idAndarAtivo && e.tipo === 'coluna')) {
    if (Math.abs(x - e.x) < e.largura / 2 && Math.abs(y - e.y) < e.altura2 / 2) return e;
  }
  for (const e of projeto.elementos.filter(e => e.andar === projeto.idAndarAtivo && e.tipo === 'telhado' && e.fechado)) {
    if (pontoEmPoligono(x, y, e.pontos)) return e;
  }
  for (const e of projeto.elementos.filter(e => e.andar === projeto.idAndarAtivo && e.tipo === 'laje' && e.fechado)) {
    if (pontoEmPoligono(x, y, e.pontos)) return e;
  }
  const parede = paredeSobMouse(x, y);
  return parede;
}
function pontoEmPoligono(x, y, pts) {
  let dentro = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    if ((pts[i].y > y) !== (pts[j].y > y) &&
        x < (pts[j].x - pts[i].x) * (y - pts[i].y) / (pts[j].y - pts[i].y) + pts[i].x) dentro = !dentro;
  }
  return dentro;
}
function apagarElemento(id) {
  projeto.elementos = projeto.elementos.filter(e => e.id !== id && e.paredeId !== id);
  if (selecao === id) selecao = null;
  salvarEstado(); sincronizar();
}

// ---------------- Painéis ----------------
function atualizarPainelProps() {
  const div = $('#props');
  const e = selecao && el(selecao);
  if (!e) { div.innerHTML = '<span class="vazio">Nenhum elemento selecionado.</span>'; return; }
  let linhas = '';
  const inp = (campo, rotulo, passo = 0.1) =>
    `<tr><td>${rotulo}</td><td><input data-campo="${campo}" type="number" step="${passo}" value="${e[campo]}"></td></tr>`;
  if (e.tipo === 'parede') {
    linhas = inp('x1', 'Início X') + inp('y1', 'Início Y') + inp('x2', 'Fim X') + inp('y2', 'Fim Y') +
             inp('espessura', 'Espessura (m)', 0.01) +
             `<tr><td>Compr.</td><td>${Math.hypot(e.x2 - e.x1, e.y2 - e.y1).toFixed(2)} m</td></tr>`;
  } else if (e.tipo === 'porta' || e.tipo === 'janela') {
    linhas = inp('largura', 'Largura (m)', 0.05) + inp('altura', e.tipo === 'porta' ? 'Altura (m)' : 'Altura (m)', 0.05) +
             inp('distancia', 'Posição na parede (m)', 0.05) + (e.tipo === 'janela' ? inp('peitoril', 'Peitoril (m)', 0.05) : '');
  } else if (e.tipo === 'coluna') {
    linhas = inp('x', 'X (m)') + inp('y', 'Y (m)') + inp('largura', 'Largura (m)', 0.05) + inp('altura2', 'Prof. (m)', 0.05);
  } else if (e.tipo === 'laje') {
    linhas = inp('espessura', 'Espessura (m)', 0.01) + `<tr><td>Vértices</td><td>${e.pontos.length}</td></tr>`;
  } else if (e.tipo === 'escada') {
    linhas = inp('comprimento', 'Comprimento (m)', 0.05) + inp('largura', 'Largura (m)', 0.05) +
             inp('degraus', 'Nº de degraus', 1) +
             `<tr><td>Altura/degrau</td><td>${(andarAtivo().alturaPisoPiso / Math.max(2, e.degraus)).toFixed(3)} m</td></tr>`;
  } else if (e.tipo === 'pontoEletrico' || e.tipo === 'pontoHidraulico') {
    const def = PONTOS_INSTALACOES[e.ponto];
    linhas = `<tr><td>Tipo</td><td>${def ? def.nome : e.ponto}</td></tr>` +
             `<tr><td>Camada</td><td>${CAMADAS[camadaDe(e)].nome}</td></tr>` +
             inp('x', 'X (m)') + inp('y', 'Y (m)');
  } else if (e.tipo === 'objeto') {
    const def = BIBLIOTECA[e.objeto];
    linhas = `<tr><td>Tipo</td><td>${def ? def.nome : e.objeto}</td></tr>` +
             inp('x', 'X (m)') + inp('y', 'Y (m)') +
             inp('larg', 'Largura (m)', 0.05) + inp('prof', 'Profundidade (m)', 0.05) + inp('alt', 'Altura (m)', 0.05) +
             `<tr><td>Rotação</td><td><input data-campo="angulo" type="number" step="15" value="${Math.round((e.angulo || 0) * 180 / Math.PI)}" data-graus="1"> º</td></tr>`;
  } else if (e.tipo === 'telhado') {
    linhas = inp('altura', 'Altura do telhado (m)', 0.05) + inp('espessura', 'Espessura (m)', 0.01) +
             `<tr><td>Tipo</td><td>Duas águas</td></tr>` +
             `<tr><td>Vértices</td><td>${e.pontos.length}</td></tr>`;
  }
  div.innerHTML = `<div style="margin-bottom:6px"><b>${nomeTipo(e.tipo)}</b> #${e.id}</div><table class="props">${linhas}</table>
    <div style="margin-top:8px"><button class="btn-pequeno" id="btnExcluir">Excluir elemento</button></div>`;
  div.querySelectorAll('input[data-campo]').forEach(i => i.addEventListener('change', () => {
    if (i.dataset.graus) e[i.dataset.campo] = (parseFloat(i.value) || 0) * Math.PI / 180;
    else e[i.dataset.campo] = parseFloat(i.value) || 0;
    salvarEstado(); sincronizar();
  }));
  $('#btnExcluir').addEventListener('click', () => apagarElemento(e.id));
}
function nomeTipo(t) {
  return { parede: 'Parede', porta: 'Porta', janela: 'Janela', laje: 'Laje', coluna: 'Coluna' }[t] || t;
}

function renderizarPainelAndares() {
  const box = $('#listaAndares');
  box.innerHTML = '';
  projeto.andares.sort((a, b) => a.alturaBase - b.alturaBase).forEach(a => {
    const div = document.createElement('div');
    div.className = 'item-andar' + (a.id === projeto.idAndarAtivo ? ' ativo' : '');
    div.innerHTML = `<span class="nome">${a.nome}</span>
      <label style="font-size:10px;color:#888">Piso-piso:</label>
      <input class="alt" type="number" step="0.1" value="${a.alturaPisoPiso}" data-andar="${a.id}">`;
    div.addEventListener('click', ev => {
      if (ev.target.tagName === 'INPUT') return;
      projeto.idAndarAtivo = a.id; selecao = null; sincronizar();
    });
    box.appendChild(div);
  });
  box.querySelectorAll('input.alt').forEach(i => i.addEventListener('change', () => {
    const a = projeto.andares.find(x => x.id === +i.dataset.andar);
    a.alturaPisoPiso = parseFloat(i.value) || 3; salvarEstado(); sincronizar();
  }));
  const bts = document.createElement('div');
  bts.className = 'botoes-andar';
  bts.innerHTML = `<button id="btnAddAndar">+ Adicionar pavimento</button>`;
  bts.querySelector('#btnAddAndar').addEventListener('click', () => {
    const topo = projeto.andares.reduce((m, a) => Math.max(m, a.alturaBase + a.alturaPisoPiso), 0);
    const n = projeto.andares.length + 1;
    const novo = { id: Date.now(), nome: `${n}º Pavimento`, alturaBase: topo, alturaPisoPiso: 3 };
    projeto.andares.push(novo); projeto.idAndarAtivo = novo.id;
    salvarEstado(); sincronizar();
  });
  box.appendChild(bts);
}

function atualizarSeletorCortes() {
  const sel = $('#selCorte');
  if (!sel) return;
  const valorAtual = sel.value;
  sel.innerHTML = cortes.length
    ? cortes.map(lc => `<option value="${lc.id}">Corte ${lc.rotulo}—${lc.rotulo}</option>`).join('')
    : '<option value="">(sem cortes)</option>';
  if ([...sel.options].some(o => o.value === valorAtual)) sel.value = valorAtual;
}

function renderizarCircuitos() {
  const box = $('#listaCircuitos');
  if (!box) return;
  if (!circuitos.length) { box.innerHTML = '<span class="vazio">Nenhum circuito.</span>'; return; }
  box.innerHTML = circuitos.map(cir => {
    const comp = comprimentoCircuito(cir);
    return `<div class="item-andar" data-circ="${cir.id}">
      <span class="nome">${cir.nome}</span>
      <span style="font-size:10px;color:#888">${cir.pontos.length} pts · ${comp.toFixed(1)} m</span>
      <button class="btn-pequeno" data-delcirc="${cir.id}" style="margin-left:auto">✕</button>
    </div>`;
  }).join('');
  box.querySelectorAll('[data-delcirc]').forEach(b => b.addEventListener('click', ev => {
    ev.stopPropagation();
    circuitos = circuitos.filter(x => x.id !== +b.dataset.delcirc);
    renderizarCircuitos();
  renderizarTipologias(); desenhar2d();
  }));
}
function comprimentoCircuito(cir) {
  let t = 0;
  for (let i = 1; i < cir.pontos.length; i++) {
    const a = cir.pontos[i - 1], b = cir.pontos[i];
    t += Math.abs(b.x - a.x) + Math.abs(b.y - a.y); // pernas ortogonais
  }
  return t;
}

function renderizarCamadas() {
  const box = $('#listaCamadas');
  if (!box) return;
  box.innerHTML = Object.entries(CAMADAS).map(([chave, cam]) =>
    `<div class="item-andar" style="gap:6px">
       <input type="checkbox" data-camada="${chave}" ${cam.visivel ? 'checked' : ''} style="accent-color:${cam.cor}">
       <span style="width:12px;height:12px;background:${cam.cor};border-radius:2px;display:inline-block"></span>
       <span class="nome">${cam.nome}</span>
     </div>`).join('');
  box.querySelectorAll('input[data-camada]').forEach(i => i.addEventListener('change', () => {
    CAMADAS[i.dataset.camada].visivel = i.checked;
    desenhar2d(); reconstruir3d();
  }));
}

function renderizarBiblioteca() {
  const box = $('#listaObjetos');
  const elBox = $('#listaPontosInst');
  if (elBox) {
    elBox.innerHTML = Object.entries(PONTOS_INSTALACOES).map(([chave, def]) =>
      `<div class="item-andar ${chave === pontoInstSelecionado ? 'ativo' : ''}" data-ponto="${chave}">
         <span style="width:14px;height:14px;border:1.5px solid ${def.disciplina === 'eletrica' ? '#f2a900' : '#1976d2'};border-radius:50%;display:inline-block;text-align:center;font-size:9px;line-height:14px;font-weight:bold">${def.icone}</span>
         <span class="nome">${def.nome}</span>
       </div>`).join('');
    elBox.querySelectorAll('[data-ponto]').forEach(d => d.addEventListener('click', () => {
      pontoInstSelecionado = d.dataset.ponto;
      ferramenta = 'pontoInst';
      document.querySelectorAll('#toolbar button').forEach(x => x.classList.remove('ativo'));
      document.querySelector('#toolbar button[data-ferr="pontoInst"]')?.classList.add('ativo');
      renderizarBiblioteca();
    }));
  }
  box.innerHTML = Object.entries(BIBLIOTECA).map(([chave, def]) =>
    `<div class="item-andar ${chave === objetoSelecionado ? 'ativo' : ''}" data-obj="${chave}">
       <span class="nome">${def.nome}</span>
       <span style="font-size:10px;color:#888">${def.larg}×${def.prof}m</span>
     </div>`).join('');
  box.querySelectorAll('[data-obj]').forEach(d => d.addEventListener('click', () => {
    objetoSelecionado = d.dataset.obj;
    renderizarBiblioteca();
  }));
}

function renderizarListaElementos() {
  const box = $('#listaElem');
  const elems = projeto.elementos.filter(e => e.andar === projeto.idAndarAtivo);
  if (!elems.length) { box.innerHTML = '<span class="vazio">Pavimento vazio.</span>'; return; }
  box.innerHTML = elems.map(e =>
    `<div class="item-andar ${e.id === selecao ? 'ativo' : ''}" data-id="${e.id}">
       <span class="nome">${e.tipo === 'objeto' ? (BIBLIOTECA[e.objeto]?.nome || 'Objeto') : (PONTOS_INSTALACOES[e.ponto]?.nome || nomeTipo(e.tipo))} #${e.id}</span></div>`).join('');
  box.querySelectorAll('.item-andar').forEach(d => d.addEventListener('click', () => {
    selecao = +d.dataset.id; atualizarPainelProps(); desenhar2d(); renderizarListaElementos();
  }));
}

// ---------------- Sincronização geral ----------------
function sincronizar() {
  renderizarPainelAndares();
  $('#nomeAndarAtual').textContent = andarAtivo().nome;
  $('#infoProj').textContent = projeto.nome + ` · ${projeto.elementos.length} elementos`;
  atualizarPainelProps();
  renderizarListaElementos();
  renderizarBiblioteca();
  renderizarCamadas();
  atualizarSeletorCortes();
  renderizarCircuitos();
  renderizarTipologias();
  $('#secObjetos').style.display = ferramenta === 'objeto' ? '' : 'none';
  const sp = $('#secPontosInst'); if (sp) sp.style.display = ferramenta === 'pontoInst' ? '' : 'none';
  const sc = $('#secCircuitos'); if (sc) sc.style.display = ferramenta === 'circuito' ? '' : 'none';
  desenhar2d();
  reconstruir3d();
  aplicarSol();
  atualizarPainelSol();
  localStorage.setItem('bim-mvp', JSON.stringify(projeto));
  salvarVersao();
  renderizarVersoes();
}

// ---------------- Barra de ferramentas ----------------
document.querySelectorAll('#toolbar button').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('#toolbar button').forEach(x => x.classList.remove('ativo'));
  b.classList.add('ativo');
  ferramenta = b.dataset.ferr;
  preview = null;
  if (ferramenta !== 'medir') medicao = null;
  if (ferramenta !== 'corte') { /* linhaCorte persiste para o botão Gerar corte */ }
  $('#secObjetos').style.display = ferramenta === 'objeto' ? '' : 'none';
  const sp = $('#secPontosInst'); if (sp) sp.style.display = ferramenta === 'pontoInst' ? '' : 'none';
  const sc = $('#secCircuitos'); if (sc) sc.style.display = ferramenta === 'circuito' ? '' : 'none';
  $('#stFerramenta').textContent = 'Ferramenta: ' + b.textContent.trim();
  desenhar2d();
}));

$('#inpSnap').addEventListener('change', ev => snap = parseFloat(ev.target.value) || 0.25);
$('#inpNorte')?.addEventListener('change', ev => { norteGraus = parseFloat(ev.target.value) || 0; desenhar2d(); });
$('#btnDesfazer').addEventListener('click', desfazer);
$('#btnRefazer').addEventListener('click', refazer);
$('#btnNovo').addEventListener('click', () => {
  if (!confirm('Criar um novo projeto? As alterações não salvas serão perdidas.')) return;
  projeto = novoProjeto(); uid = 1; selecao = null; camadaHistorico = []; idxHistorico = -1;
  salvarEstado(); sincronizar();
});
$('#btnSalvar').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(projeto, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = projeto.nome.replace(/\s+/g, '_') + '.json'; a.click();
});
$('#btnAbrir').addEventListener('click', () => $('#arquivoProj').click());
$('#btnIFC').addEventListener('click', exportarIFC);
$('#chkCotas').addEventListener('change', ev => { mostrarCotas = ev.target.checked; desenhar2d(); });
$('#arquivoProj').addEventListener('change', async ev => {
  const f = ev.target.files[0]; if (!f) return;
  projeto = JSON.parse(await f.text());
  uid = projeto.elementos.reduce((m, e) => Math.max(m, e.id), 0) + 1;
  selecao = null; camadaHistorico = []; idxHistorico = -1;
  salvarEstado(); sincronizar();
});

function escIFC(s) { return String(s).replace(/'/g, "''"); }
function guidIFC() {
  // guid IFC (22 chars, base64-like)
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_$';
  let s = '';
  for (let i = 0; i < 22; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// ---------------- Cortes e fachadas 2D automáticos ----------------
const cvVista = () => document.querySelector('#cvVista');
let ultimaVista = null; // { modo } para re-render ao trocar escala

function escalaSelecionada() {
  const v = $('#selEscala')?.value || 'auto';
  if (v === 'auto') return null;
  return parseFloat(v); // 1:X
}
// px CSS por metro para uma escala 1:X (96 dpi: 1 pol = 25,4 mm)
function pxPorMetroDeEscala(ratio) {
  return (1000 / ratio) * (96 / 25.4) * devicePixelRatio;
}

function abrirModalVista(titulo) {
  $('#modalVista').style.display = 'flex';
  $('#tituloVista').textContent = titulo;
  const cv = cvVista();
  const r = cv.getBoundingClientRect();
  cv.width = r.width * devicePixelRatio; cv.height = r.height * devicePixelRatio;
  return cv;
}
$('#btnFecharVista')?.addEventListener('click', () => { $('#modalVista').style.display = 'none'; });

// interseção de segmento (linha de corte infinita) com segmento de parede
function interseccaoLinhas(p1, p2, p3, p4) {
  const d1 = { x: p2.x - p1.x, y: p2.y - p1.y };
  const d2 = { x: p4.x - p3.x, y: p4.y - p3.y };
  const den = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((p3.x - p1.x) * d2.y - (p3.y - p1.y) * d2.x) / den;
  const u = ((p3.x - p1.x) * d1.y - (p3.y - p1.y) * d1.x) / den;
  return { t, u }; // t ao longo de p1->p2 (corte), u ao longo da parede
}

// gerar vista (corte ou fachada) e desenhar no modal
function gerarVista(modo, idCorteSel) {
  if (!projeto.elementos.length) { alert('Desenhe algum elemento antes de gerar vistas.'); return; }

  // direção da vista: corte usa linhaCorte; fachada usa eixo X (vista sul->norte)
  let origem, direcao, rotulo;
  if (modo === 'corte') {
    const lc = cortes.find(x => x.id === idCorteSel) || cortes[0];
    if (!lc) { alert('Use a ferramenta Corte para traçar a linha de corte na planta primeiro.'); return; }
    origem = { x: lc.x1, y: lc.y1 };
    direcao = { x: lc.x2 - lc.x1, y: lc.y2 - lc.y1 };
    const compr = Math.hypot(direcao.x, direcao.y) || 1;
    direcao.x /= compr; direcao.y /= compr;
    rotulo = `Corte ${lc.rotulo}—${lc.rotulo}`;
    modo = 'corte';
  } else {
    const dirFachada = { sul: 0, norte: 180, leste: 90, oeste: 270 }[modo] ?? 0;
    const angRad = dirFachada * Math.PI / 180;
    direcao = { x: Math.cos(angRad), y: Math.sin(angRad) };
    origem = { x: -direcao.x * 50, y: -direcao.y * 50 };
    rotulo = 'Fachada ' + { sul: 'Sul', norte: 'Norte', leste: 'Leste', oeste: 'Oeste' }[modo];
  }
  const perp = { x: -direcao.y, y: direcao.x };

  const cv = abrirModalVista(rotulo);
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#fdfdfb'; ctx.fillRect(0, 0, W, H);

  // coletar cortes: para cada parede, interseção da linha de corte com o segmento
  const fatias = []; // { s, espessura, altPiso, zBase, aberturas: [{s, larg, zBase, alt}], tipo }
  const zMax = projeto.andares.reduce((m, a) => Math.max(m, a.alturaBase + a.alturaPisoPiso), 0) + 4;

  // extensão ao longo do corte
  let sMin = Infinity, sMax = -Infinity;
  const pontoParaVista = (p) => {
    const dx = p.x - origem.x, dy = p.y - origem.y;
    return { s: dx * direcao.x + dy * direcao.y, profundidade: dx * perp.x + dy * perp.y };
  };

  for (const a of projeto.andares) {
    const zBase = a.alturaBase, altPiso = a.alturaPisoPiso;
    for (const e of projeto.elementos.filter(x => x.andar === a.id && x.tipo === 'parede')) {
      // interseção da linha de corte (infinita) com a parede
      if (modo === 'corte') {
        const inter = interseccaoLinhas(
          { x: origem.x, y: origem.y }, { x: origem.x + direcao.x * 1000, y: origem.y + direcao.y * 1000 },
          { x: e.x1, y: e.y1 }, { x: e.x2, y: e.y2 });
        if (!inter || inter.u < 0 || inter.u > 1) continue;
        const px = e.x1 + (e.x2 - e.x1) * inter.u, py = e.y1 + (e.y2 - e.y1) * inter.u;
        const pv = pontoParaVista({ x: px, y: py });
        sMin = Math.min(sMin, pv.s); sMax = Math.max(sMax, pv.s);
        // aberturas desta parede
        const aberturas = [];
        for (const ab of projeto.elementos.filter(x => (x.tipo === 'porta' || x.tipo === 'janela') && x.paredeId === e.id)) {
          const ang = Math.atan2(e.y2 - e.y1, e.x2 - e.x1);
          const ax = e.x1 + Math.cos(ang) * ab.distancia, ay = e.y1 + Math.sin(ang) * ab.distancia;
          const av = pontoParaVista({ x: ax, y: ay });
          aberturas.push({ s: av.s, larg: ab.largura, zBase: ab.tipo === 'porta' ? zBase : zBase + ab.peitoril, alt: ab.altura, tipo: ab.tipo });
        }
        fatias.push({ s: pv.s, espessura: e.espessura, zBase, altPiso, aberturas, tipo: 'parede' });
      } else {
        // fachada: projetar todas as paredes ortogonais à direção (parede inteira)
        // usar apenas paredes "de frente" — aproximação: projeção da parede inteira em s
        const p1v = pontoParaVista({ x: e.x1, y: e.y1 });
        const p2v = pontoParaVista({ x: e.x2, y: e.y2 });
        const ang = Math.atan2(e.y2 - e.y1, e.x2 - e.x1);
        // apenas paredes cujo eixo é perpendicular à direção da vista (fachadas)
        const paralelismo = Math.abs(Math.cos(ang - Math.atan2(direcao.y, direcao.x)));
        if (paralelismo > 0.35) continue; // parede de frente tem eixo perpendicular à vista
        const compr = Math.hypot(e.x2 - e.x1, e.y2 - e.y1);
        const sv = (p1v.s + p2v.s) / 2;
        sMin = Math.min(sMin, sv - compr / 2); sMax = Math.max(sMax, sv + compr / 2);
        const aberturas = [];
        for (const ab of projeto.elementos.filter(x => (x.tipo === 'porta' || x.tipo === 'janela') && x.paredeId === e.id)) {
          const aAng = Math.atan2(e.y2 - e.y1, e.x2 - e.x1);
          const ax = e.x1 + Math.cos(aAng) * ab.distancia, ay = e.y1 + Math.sin(aAng) * ab.distancia;
          const av = pontoParaVista({ x: ax, y: ay });
          aberturas.push({ s: av.s, larg: ab.largura, zBase: ab.tipo === 'porta' ? zBase : zBase + ab.peitoril, alt: ab.altura, tipo: ab.tipo });
        }
        fatias.push({ s: sv, compr, espessura: e.espessura, zBase, altPiso, aberturas, tipo: 'fachada' });
      }
    }
  }

  if (!fatias.length) {
    ctx.fillStyle = '#888'; ctx.font = '16px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(modo === 'corte' ? 'Nenhuma parede cruzada pela linha de corte.' : 'Nenhuma parede de fachada nesta direção.', W / 2, H / 2);
    return;
  }

  // escala e transformação (configurável ou automática)
  const margem = 60;
  const larguraMundo = Math.max(1, sMax - sMin);
  const alturaMundo = zMax;
  const escalaAuto = Math.min((W - 2 * margem) / larguraMundo, (H - 2 * margem - 30) / alturaMundo);
  const ratio = escalaSelecionada();
  const escala = ratio ? pxPorMetroDeEscala(ratio) : escalaAuto;
  ultimaVista = { modo };
  const X = (s) => margem + (s - sMin) * escala;
  const Y = (z) => H - margem - z * escala;

  // chão
  ctx.strokeStyle = '#333'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(X(sMin) - 20, Y(0)); ctx.lineTo(X(sMax) + 20, Y(0)); ctx.stroke();
  // hachura do chão
  ctx.lineWidth = 1; ctx.strokeStyle = '#777';
  for (let x = X(sMin) - 20; x < X(sMax) + 20; x += 10) {
    ctx.beginPath(); ctx.moveTo(x, Y(0)); ctx.lineTo(x - 7, Y(0) + 7); ctx.stroke();
  }

  // fatias
  for (const f of fatias) {
    const espPx = Math.max(3, f.espessura * escala);
    if (f.tipo === 'parede') {
      // parede cortada: retângulo cheio com hachura
      const x0 = X(f.s) - espPx / 2;
      ctx.fillStyle = '#fff'; ctx.fillRect(x0, Y(f.zBase + f.altPiso), espPx, f.altPiso * escala);
      ctx.save();
      ctx.beginPath(); ctx.rect(x0, Y(f.zBase + f.altPiso), espPx, f.altPiso * escala); ctx.clip();
      ctx.strokeStyle = '#555'; ctx.lineWidth = 1;
      for (let y = Y(f.zBase + f.altPiso); y < Y(f.zBase); y += 7) {
        ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + espPx, y - espPx); ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle = '#222'; ctx.lineWidth = 1.5;
      ctx.strokeRect(x0, Y(f.zBase + f.altPiso), espPx, f.altPiso * escala);
      // aberturas vazadas
      for (const ab of f.aberturas) {
        ctx.fillStyle = '#fdfdfb';
        ctx.fillRect(X(ab.s) - ab.larg * escala / 2 - espPx / 2 - 1, Y(ab.zBase + ab.alt), ab.larg * escala + espPx + 2, ab.alt * escala);
        ctx.strokeStyle = '#222'; ctx.lineWidth = 1.5;
        ctx.strokeRect(X(ab.s) - ab.larg * escala / 2 - espPx / 2 - 1, Y(ab.zBase + ab.alt), ab.larg * escala + espPx + 2, ab.alt * escala);
      }
    } else {
      // fachada: parede vista em elevação (contorno + aberturas)
      const x0 = X(f.s - f.compr / 2), wPx = f.compr * escala;
      ctx.fillStyle = '#f5f2ea'; ctx.fillRect(x0, Y(f.zBase + f.altPiso), wPx, f.altPiso * escala);
      ctx.strokeStyle = '#222'; ctx.lineWidth = 1.5;
      ctx.strokeRect(x0, Y(f.zBase + f.altPiso), wPx, f.altPiso * escala);
      for (const ab of f.aberturas) {
        ctx.strokeStyle = '#222'; ctx.lineWidth = 1.5;
        ctx.strokeRect(X(ab.s) - ab.larg * escala / 2, Y(ab.zBase + ab.alt), ab.larg * escala, ab.alt * escala);
        if (ab.tipo === 'janela') {
          ctx.strokeStyle = '#7fb3e0';
          ctx.strokeRect(X(ab.s) - ab.larg * escala / 2 + 3, Y(ab.zBase + ab.alt) + 3, ab.larg * escala - 6, ab.alt * escala - 6);
        }
      }
    }
  }

  // ---- cotas verticais completas (cadeia de níveis) ----
  ctx.font = '11px sans-serif'; ctx.lineWidth = 1;
  const xDim = X(sMax) + 25;
  // 1) níveis de cada pavimento (marcadores de nível)
  for (const a of projeto.andares) {
    const y = Y(a.alturaBase);
    ctx.strokeStyle = '#c0392b'; ctx.fillStyle = '#c0392b';
    ctx.beginPath(); ctx.moveTo(xDim, y); ctx.lineTo(xDim + 45, y); ctx.stroke();
    // triângulo de nível
    ctx.beginPath();
    ctx.moveTo(xDim + 45, y); ctx.lineTo(xDim + 39, y - 5); ctx.lineTo(xDim + 39, y + 5);
    ctx.closePath(); ctx.fill();
    ctx.textAlign = 'left';
    ctx.fillText(`+${a.alturaBase.toFixed(2).replace('.', ',')}`, xDim + 50, y + 4);
  }
  // 2) alturas piso-a-piso (cadeia entre níveis, à esquerda da vista)
  const xCadeia = X(sMin) - 25;
  ctx.strokeStyle = '#c0392b'; ctx.fillStyle = '#c0392b';
  const niveis = projeto.andares.map(a => a.alturaBase);
  const topo = projeto.andares.reduce((m, a) => Math.max(m, a.alturaBase + a.alturaPisoPiso), 0);
  niveis.push(topo);
  for (let i = 0; i < niveis.length - 1; i++) {
    const y1 = Y(niveis[i]), y2 = Y(niveis[i + 1]);
    ctx.beginPath(); ctx.moveTo(xCadeia, y1); ctx.lineTo(xCadeia, y2); ctx.stroke();
    // traços
    [y1, y2].forEach(yy => { ctx.beginPath(); ctx.moveTo(xCadeia - 5, yy); ctx.lineTo(xCadeia + 5, yy); ctx.stroke(); });
    const meio = (y1 + y2) / 2;
    const alturaSeg = niveis[i + 1] - niveis[i];
    ctx.save(); ctx.translate(xCadeia - 8, meio); ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText(alturaSeg.toFixed(2).replace('.', ','), 0, 0);
    ctx.restore();
  }
  // 3) alturas das aberturas do corte (peitoril + altura da esquadria)
  if (modo === 'corte') {
    for (const f of fatias) {
      for (const ab of f.aberturas) {
        const xa = X(ab.s);
        // cota da base ao topo da abertura
        ctx.strokeStyle = '#2a7de1'; ctx.fillStyle = '#2a7de1';
        const yBase = Y(ab.zBase), yTopo = Y(ab.zBase + ab.alt);
        ctx.beginPath(); ctx.moveTo(xa + 4, yBase); ctx.lineTo(xa + 4, yTopo); ctx.stroke();
        [yBase, yTopo].forEach(yy => { ctx.beginPath(); ctx.moveTo(xa + 1, yy); ctx.lineTo(xa + 7, yy); ctx.stroke(); });
        ctx.save(); ctx.translate(xa + 10, (yBase + yTopo) / 2); ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.fillText(ab.alt.toFixed(2).replace('.', ','), 0, 0);
        ctx.restore();
      }
    }
  }

  // título
  ctx.fillStyle = '#222'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'left';
  ctx.fillText(rotulo, margem, 28);
  ctx.font = '11px sans-serif'; ctx.fillStyle = '#666';
  const pxPorMetroCSS = escala / devicePixelRatio;
  const escalaImpressao = Math.max(10, Math.round((1000 / 96) / pxPorMetroCSS)); // 1:X
  ctx.fillText(`Escala 1:${ratio ? ratio : escalaImpressao}${ratio ? '' : ' (aprox.)'} · Projeto: ${projeto.nome}`, margem, 46);

  // ---- carimbo / quadro de título (rodapé) ----
  const ch = 64 * devicePixelRatio; // altura do carimbo
  const cy0 = H - ch;
  ctx.strokeStyle = '#222'; ctx.lineWidth = 1.5;
  ctx.strokeRect(margem - 10, cy0, W - 2 * (margem - 10), ch);
  const colunas = [
    { titulo: 'PROJETO', valor: projeto.nome },
    { titulo: 'VISTA', valor: rotulo },
    { titulo: 'ESCALA', valor: `1:${ratio ? ratio : escalaImpressao}` },
    { titulo: 'DATA', valor: new Date().toLocaleDateString('pt-BR') },
    { titulo: 'PROGRAMA', valor: 'BIM Studio MVP' }
  ];
  const cw = (W - 2 * (margem - 10)) / colunas.length;
  ctx.font = `${9 * devicePixelRatio}px sans-serif`;
  colunas.forEach((col, i) => {
    const x0 = margem - 10 + i * cw;
    if (i > 0) { ctx.beginPath(); ctx.moveTo(x0, cy0); ctx.lineTo(x0, H); ctx.stroke(); }
    ctx.fillStyle = '#555';
    ctx.fillText(col.titulo, x0 + 6, cy0 + 14 * devicePixelRatio);
    ctx.fillStyle = '#111';
    ctx.font = `bold ${11 * devicePixelRatio}px sans-serif`;
    ctx.fillText(String(col.valor).slice(0, 24), x0 + 6, cy0 + 32 * devicePixelRatio);
    ctx.font = `${9 * devicePixelRatio}px sans-serif`;
  });
}

// ---- Planta 2D em prancha (para impressão/PNG) ----
function gerarPlanta2D() {
  const a = andarAtivo();
  const elems = projeto.elementos.filter(e => e.andar === a.id && CAMADAS[camadaDe(e)].visivel);
  if (!elems.length) { alert('Pavimento sem elementos.'); return; }

  const cv = abrirModalVista(`Planta — ${a.nome}`);
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);

  // extensão do desenho
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  for (const e of elems) {
    const pts = e.tipo === 'laje' || e.tipo === 'telhado' ? e.pontos :
      e.tipo === 'parede' ? [{x: e.x1, y: e.y1}, {x: e.x2, y: e.y2}] :
      e.tipo === 'escada' ? [{x: e.x - e.comprimento/2, y: e.y - e.largura/2}, {x: e.x + e.comprimento/2, y: e.y + e.largura/2}] :
      e.tipo === 'objeto' ? [{x: e.x - (e.larg||1)/2, y: e.y - (e.prof||1)/2}, {x: e.x + (e.larg||1)/2, y: e.y + (e.prof||1)/2}] :
      [{x: e.x, y: e.y}];
    for (const p of pts) {
      xMin = Math.min(xMin, p.x); xMax = Math.max(xMax, p.x);
      yMin = Math.min(yMin, p.y); yMax = Math.max(yMax, p.y);
    }
  }
  const margem = 70;
  const ratio = escalaSelecionada();
  const escalaAuto = Math.min((W - 2 * margem) / Math.max(1, xMax - xMin), (H - 2 * margem - 60) / Math.max(1, yMax - yMin));
  const escala = ratio ? pxPorMetroDeEscala(ratio) : escalaAuto;
  ultimaVista = { modo: 'planta' };

  const X = (x) => margem + (x - xMin) * escala;
  const Y = (y) => H - 70 - (y - yMin) * escala;

  // lajes
  for (const e of elems.filter(e => e.tipo === 'laje' && e.fechado)) {
    ctx.fillStyle = 'rgba(200,220,240,.35)';
    ctx.beginPath();
    e.pontos.forEach((p, i) => i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y)));
    ctx.closePath(); ctx.fill();
  }
  // paredes
  ctx.lineCap = 'butt';
  for (const e of elems.filter(e => e.tipo === 'parede')) {
    ctx.strokeStyle = '#111';
    ctx.lineWidth = Math.max(2, e.espessura * escala);
    ctx.beginPath(); ctx.moveTo(X(e.x1), Y(e.y1)); ctx.lineTo(X(e.x2), Y(e.y2)); ctx.stroke();
    // cota
    const compr = Math.hypot(e.x2 - e.x1, e.y2 - e.y1);
    const ang = Math.atan2(e.y2 - e.y1, e.x2 - e.x1);
    const off = e.espessura / 2 + 0.5;
    const ox = Math.cos(ang + Math.PI/2) * off, oy = Math.sin(ang + Math.PI/2) * off;
    const ax = X(e.x1 + ox), ay = Y(e.y1 + oy), bx = X(e.x2 + ox), by = Y(e.y2 + oy);
    ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    [ [ax, ay], [bx, by] ].forEach(([px, py]) => {
      ctx.beginPath(); ctx.moveTo(px - 3, py - 3); ctx.lineTo(px + 3, py + 3); ctx.stroke();
    });
    ctx.save();
    ctx.translate((ax + bx) / 2, (ay + by) / 2);
    let at = -ang; if (at > Math.PI/2 || at < -Math.PI/2) at += Math.PI;
    ctx.rotate(at);
    ctx.fillStyle = '#c0392b'; ctx.font = `${10 * devicePixelRatio}px sans-serif`; ctx.textAlign = 'center';
    ctx.fillText(compr.toFixed(2).replace('.', ','), 0, -3);
    ctx.restore();
  }
  // colunas
  for (const e of elems.filter(e => e.tipo === 'coluna')) {
    ctx.fillStyle = '#8d9aa5'; ctx.strokeStyle = '#333';
    const w = e.largura * escala, h = e.altura2 * escala;
    ctx.fillRect(X(e.x) - w/2, Y(e.y) - h/2, w, h);
    ctx.strokeRect(X(e.x) - w/2, Y(e.y) - h/2, w, h);
  }
  // escadas
  for (const e of elems.filter(e => e.tipo === 'escada')) {
    const nDeg = Math.max(2, Math.round(e.degraus));
    ctx.save();
    ctx.translate(X(e.x), Y(e.y)); ctx.rotate(-e.angulo);
    const L = e.comprimento * escala, Wd = e.largura * escala;
    ctx.strokeStyle = '#5a7';
    for (let i = 0; i < nDeg; i++) {
      ctx.strokeRect(-L/2 + i * (L/nDeg), -Wd/2, L/nDeg, Wd);
    }
    ctx.beginPath(); ctx.moveTo(-L/2, 0); ctx.lineTo(L/2, 0); ctx.stroke();
    ctx.restore();
  }
  // objetos
  for (const e of elems.filter(e => e.tipo === 'objeto')) {
    const d = dimsObjeto(e);
    ctx.save(); ctx.translate(X(e.x), Y(e.y)); ctx.rotate(-(e.angulo || 0));
    ctx.fillStyle = d.cor + '88'; ctx.strokeStyle = '#5d4037'; ctx.lineWidth = 1;
    ctx.fillRect(-d.larg * escala / 2, -d.prof * escala / 2, d.larg * escala, d.prof * escala);
    ctx.strokeRect(-d.larg * escala / 2, -d.prof * escala / 2, d.larg * escala, d.prof * escala);
    ctx.restore();
  }
  // aberturas
  for (const e of elems.filter(e => e.tipo === 'porta' || e.tipo === 'janela')) {
    const p = el(e.paredeId); if (!p) continue;
    const ang = Math.atan2(p.y2 - p.y1, p.x2 - p.x1);
    const px = p.x1 + Math.cos(ang) * e.distancia, py = p.y1 + Math.sin(ang) * e.distancia;
    ctx.save(); ctx.translate(X(px), Y(py)); ctx.rotate(-ang);
    const L = e.largura * escala, esp = p.espessura * escala;
    if (e.tipo === 'porta') {
      ctx.fillStyle = '#fff';
      ctx.fillRect(-L/2, -esp/2, L, esp);
      ctx.strokeStyle = '#b7791f'; ctx.lineWidth = 1.5;
      ctx.strokeRect(-L/2, -esp/2, L, esp);
      ctx.beginPath();
      ctx.moveTo(-L/2, -esp/2); ctx.lineTo(-L/2, -esp/2 - L);
      ctx.lineTo(L/2, -esp/2 - L); ctx.lineTo(L/2, -esp/2);
      ctx.stroke();
    } else {
      ctx.strokeStyle = '#2a7de1'; ctx.lineWidth = 1.5;
      ctx.strokeRect(-L/2, -esp/2, L, esp);
      ctx.beginPath(); ctx.moveTo(-L/2, 0); ctx.lineTo(L/2, 0); ctx.stroke();
    }
    ctx.restore();
  }
  // linhas de corte com rótulos
  for (const lc of cortes) {
    ctx.strokeStyle = '#d81b60'; ctx.lineWidth = 1.5; ctx.setLineDash([8, 5]);
    ctx.beginPath(); ctx.moveTo(X(lc.x1), Y(lc.y1)); ctx.lineTo(X(lc.x2), Y(lc.y2)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#d81b60'; ctx.font = `bold ${11 * devicePixelRatio}px sans-serif`;
    const ax = X(lc.x1), ay = Y(lc.y1), bx = X(lc.x2), by = Y(lc.y2);
    const ang = Math.atan2(by - ay, bx - ax);
    [[ax, ay], [bx, by]].forEach(([px, py]) => {
      ctx.fillText(lc.rotulo, px - Math.cos(ang) * 14, py - Math.sin(ang) * 14 - 3);
    });
  }
  // rosa dos ventos / norte na prancha
  {
    const cx0 = W - 90 * devicePixelRatio, cy0 = 90 * devicePixelRatio, raio = 34 * devicePixelRatio;
    ctx.strokeStyle = '#555'; ctx.fillStyle = '#555'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx0, cy0, raio, 0, Math.PI * 2); ctx.stroke();
    const rad = -norteGraus * Math.PI / 180 - Math.PI / 2;
    const nx = Math.cos(rad) * (raio - 3), ny = Math.sin(rad) * (raio - 3);
    ctx.beginPath(); ctx.moveTo(cx0, cy0); ctx.lineTo(cx0 + nx, cy0 + ny); ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx0 + nx, cy0 + ny);
    ctx.lineTo(cx0 + nx * 0.6 + Math.cos(rad + Math.PI/2) * 7, cy0 + ny * 0.6 + Math.sin(rad + Math.PI/2) * 7);
    ctx.lineTo(cx0 + nx * 0.6 + Math.cos(rad - Math.PI/2) * 7, cy0 + ny * 0.6 + Math.sin(rad - Math.PI/2) * 7);
    ctx.closePath(); ctx.fill();
    ctx.font = `bold ${14 * devicePixelRatio}px sans-serif`; ctx.textAlign = 'center';
    ctx.fillText('N', cx0 + nx * 1.35, cy0 + ny * 1.35 + 5);
  }

  // título + carimbo
  ctx.fillStyle = '#222'; ctx.font = `bold ${14 * devicePixelRatio}px sans-serif`; ctx.textAlign = 'left';
  ctx.fillText(`Planta — ${a.nome}`, margem, 34);
  ctx.font = `${11 * devicePixelRatio}px sans-serif`; ctx.fillStyle = '#666';
  ctx.fillText(`Escala 1:${ratio ? ratio : Math.max(10, Math.round((1000/96)/(escala/devicePixelRatio)))}${ratio ? '' : ' (aprox.)'}`, margem, 52);

  const ch = 64 * devicePixelRatio;
  const cy0 = H - ch;
  ctx.strokeStyle = '#222'; ctx.lineWidth = 1.5;
  ctx.strokeRect(margem - 10, cy0, W - 2 * (margem - 10), ch);
  const colunas = [
    { titulo: 'PROJETO', valor: projeto.nome },
    { titulo: 'VISTA', valor: `Planta ${a.nome}` },
    { titulo: 'ESCALA', valor: `1:${ratio ? ratio : Math.max(10, Math.round((1000/96)/(escala/devicePixelRatio)))}` },
    { titulo: 'DATA', valor: new Date().toLocaleDateString('pt-BR') },
    { titulo: 'PROGRAMA', valor: 'BIM Studio MVP' }
  ];
  const cw = (W - 2 * (margem - 10)) / colunas.length;
  ctx.font = `${9 * devicePixelRatio}px sans-serif`;
  colunas.forEach((col, i) => {
    const x0 = margem - 10 + i * cw;
    if (i > 0) { ctx.beginPath(); ctx.moveTo(x0, cy0); ctx.lineTo(x0, H); ctx.stroke(); }
    ctx.fillStyle = '#555';
    ctx.fillText(col.titulo, x0 + 6, cy0 + 14 * devicePixelRatio);
    ctx.fillStyle = '#111';
    ctx.font = `bold ${11 * devicePixelRatio}px sans-serif`;
    ctx.fillText(String(col.valor).slice(0, 24), x0 + 6, cy0 + 32 * devicePixelRatio);
    ctx.font = `${9 * devicePixelRatio}px sans-serif`;
  });
}

$('#btnPlanta')?.addEventListener('click', () => gerarPlanta2D());

// salvar vista atual como PNG
function salvarPNG() {
  const cv = cvVista();
  if ($('#modalVista').style.display === 'none') { alert('Gere uma vista primeiro.'); return; }
  cv.toBlob(blob => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${projeto.nome.replace(/\s+/g, '_')}_${ultimaVista?.modo || 'vista'}.png`;
    a.click();
  });
}
$('#btnPNG')?.addEventListener('click', salvarPNG);

// imprimir / exportar PDF da vista aberta
function imprimirVista() { window.print(); }

$('#selEscala')?.addEventListener('change', () => { if (ultimaVista) gerarVista(ultimaVista.modo); });

$('#btnCorte')?.addEventListener('click', () => gerarVista('corte', +($('#selCorte')?.value || cortes[0]?.id)));
$('#selCorte')?.addEventListener('change', () => { if (ultimaVista?.modo === 'corte') gerarVista('corte', +$('#selCorte').value); });
$('#btnImprimir')?.addEventListener('click', imprimirVista);
document.querySelectorAll('[data-fachada]').forEach(b =>
  b.addEventListener('click', () => { gerarVista(b.dataset.fachada); $('#menuFachadas').style.display = 'none'; }));
$('#btnFachada')?.addEventListener('click', () => {
  const m = $('#menuFachadas');
  m.style.display = m.style.display === 'none' ? '' : 'none';
});

// ---------------- Simulação de sombra solar ----------------
// posição do sol: azimute (graus a partir do norte, horário) e elevação (graus)
function posicaoSol(cfg) {
  const rad = Math.PI / 180;
  const lat = cfg.lat * rad;
  // declinação solar aproximada (fórmula de Cooper)
  const decl = 23.45 * rad * Math.sin(2 * Math.PI * (284 + diaDoAno(cfg.dia, cfg.mes)) / 365);
  const horaSolar = cfg.hora; // 0-24
  const angHorario = (horaSolar - 12) * 15 * rad;
  const cosElev = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(angHorario);
  const elev = Math.asin(Math.max(-1, Math.min(1, cosElev)));
  const cosAz = (Math.sin(decl) - Math.sin(lat) * Math.sin(elev)) / (Math.cos(lat) * Math.cos(elev));
  let azimute = Math.acos(Math.max(-1, Math.min(1, cosAz)));
  if (angHorario > 0) azimute = 2 * Math.PI - azimute; // tarde
  return { elevacao: elev / rad, azimute: azimute / rad };
}
function diaDoAno(dia, mes) {
  const diasMes = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  return diasMes[mes - 1] + dia;
}

function aplicarSol() {
  const sol = scene.getObjectByName('solDirecional');
  if (!sol) return;
  if (!solCfg.ativo) {
    sol.position.set(10, 20, 8);
    sol.intensity = 1.2;
    return;
  }
  const { elevacao, azimute } = posicaoSol(solCfg);
  if (elevacao <= 0) { sol.intensity = 0.15; return; } // noite
  const elevRad = elevacao * Math.PI / 180, azRad = azimute * Math.PI / 180;
  const dist = 30;
  // x = sin(az)*cos(elev), y = sin(elev) (altura), z = cos(az)*cos(elev)
  const x = Math.sin(azRad) * Math.cos(elevRad) * dist;
  const y = Math.sin(elevRad) * dist;
  const z = Math.cos(azRad) * Math.cos(elevRad) * dist;
  sol.position.set(x, Math.max(0.5, y), z);
  sol.intensity = 0.4 + 0.8 * Math.sin(elevRad);
}

function atualizarPainelSol() {
  const info = $('#infoSol');
  if (!info) return;
  if (!solCfg.ativo) { info.textContent = ''; return; }
  const { elevacao, azimute } = posicaoSol(solCfg);
  info.textContent = elevacao > 0
    ? `Sol: ${elevacao.toFixed(0)}º elevação, ${azimute.toFixed(0)}º azimute`
    : 'Sol abaixo do horizonte (noite)';
}

$('#chkSol')?.addEventListener('change', ev => { solCfg.ativo = ev.target.checked; aplicarSol(); atualizarPainelSol(); });
['inpLat', 'inpHora', 'inpDia', 'inpMes'].forEach(id => {
  $('#' + id)?.addEventListener('change', () => {
    solCfg.lat = parseFloat($('#inpLat')?.value) || 0;
    solCfg.hora = parseFloat($('#inpHora')?.value) || 12;
    solCfg.dia = parseInt($('#inpDia')?.value) || 21;
    solCfg.mes = parseInt($('#inpMes')?.value) || 3;
    if (solCfg.ativo) { aplicarSol(); atualizarPainelSol(); }
  });
});

// nomear o sol para poder encontrá-lo
// ---------------- Iluminação natural por cômodo ----------------
// detecta cômodos: flood-fill em grade fina, delimitada por paredes do pavimento
function detectarComodos(idAndar) {
  const elems = projeto.elementos.filter(e => e.andar === idAndar && e.tipo === 'parede');
  if (!elems.length) return [];
  // bounds
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  for (const e of elems) {
    for (const p of [{x: e.x1, y: e.y1}, {x: e.x2, y: e.y2}]) {
      xMin = Math.min(xMin, p.x); xMax = Math.max(xMax, p.x);
      yMin = Math.min(yMin, p.y); yMax = Math.max(yMax, p.y);
    }
  }
  const cel = 0.05; // 5 cm por célula
  const folga = 3; // 3 m de folga para o exterior alcançar a borda
  xMin -= folga; xMax += folga; yMin -= folga; yMax += folga;
  const nx = Math.ceil((xMax - xMin) / cel);
  const ny = Math.ceil((yMax - yMin) / cel);
  const larg = new Uint8Array(nx * ny); // 1 = parede
  const margem = 1; // células de folga
  const paraCel = (x, y) => ({
    i: Math.floor((x - xMin) / cel) + margem,
    j: Math.floor((y - yMin) / cel) + margem
  });
  // rasterizar paredes (espessura + margem de 1 célula)
  for (const e of elems) {
    const a = paraCel(e.x1, e.y1), b = paraCel(e.x2, e.y2);
    const espCells = Math.ceil(e.espessura / cel / 2) + 1;
    const dx = b.i - a.i, dy = b.j - a.j;
    const passos = Math.max(Math.abs(dx), Math.abs(dy), 1);
    for (let s = 0; s <= passos; s++) {
      const ci = Math.round(a.i + dx * s / passos), cj = Math.round(a.j + dy * s / passos);
      for (let oi = -espCells; oi <= espCells; oi++)
        for (let oj = -espCells; oj <= espCells; oj++) {
          const ii = ci + oi, jj = cj + oj;
          if (ii >= 0 && ii < nx && jj >= 0 && jj < ny) larg[jj * nx + ii] = 1;
        }
    }
  }
  // flood fill
  const comodos = [];
  const visit = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const idx = j * nx + i;
    if (larg[idx] || visit[idx]) continue;
    // BFS
    const pilha = [idx];
    visit[idx] = 1;
    const celulas = [];
    let tocaBorda = false;
    while (pilha.length) {
      const cur = pilha.pop();
      celulas.push(cur);
      const ci = cur % nx, cj = (cur / nx) | 0;
      if (ci === 0 || cj === 0 || ci === nx - 1 || cj === ny - 1) tocaBorda = true;
      for (const [di, dj] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const ni = ci + di, nj = cj + dj;
        if (ni < 0 || ni >= nx || nj < 0 || nj >= ny) continue;
        const nidx = nj * nx + ni;
        if (!larg[nidx] && !visit[nidx]) { visit[nidx] = 1; pilha.push(nidx); }
      }
    }
    const area = celulas.length * cel * cel;
    if (area < 2) continue; // ignora frestas
    if (tocaBorda) continue; // região externa
    // centróide em coordenadas de mundo
    let sx = 0, sy = 0;
    for (const cidx of celulas) { sx += (cidx % nx); sy += ((cidx / nx) | 0); }
    const cxm = xMin + (sx / celulas.length - margem) * cel;
    const cym = yMin + (sy / celulas.length - margem) * cel;
    comodos.push({ area, cx: cxm, cy: cym, celulas, nx });
  }
  // janelas por cômodo: atribuição por proximidade do centróide
  const janelas = projeto.elementos.filter(e => e.andar === idAndar && e.tipo === 'janela');
  for (const com of comodos) com.areaJanelas = 0;
  for (const jan of janelas) {
    const p = el(jan.paredeId); if (!p) continue;
    const ang = Math.atan2(p.y2 - p.y1, p.x2 - p.x1);
    const jx = p.x1 + Math.cos(ang) * jan.distancia, jy = p.y1 + Math.sin(ang) * jan.distancia;
    let melhor = null, melhorD = Infinity;
    for (const com of comodos) {
      const d = Math.hypot(com.cx - jx, com.cy - jy);
      if (d < melhorD) { melhorD = d; melhor = com; }
    }
    if (melhor) melhor.areaJanelas += jan.largura * jan.altura;
  }
  return comodos;
}

function relatorioIluminacao() {
  const linhas = [];
  for (const a of projeto.andares) {
    const comodos = detectarComodos(a.id);
    if (!comodos.length) continue;
    comodos.sort((x, y) => y.area - x.area);
    for (let i = 0; i < comodos.length; i++) {
      const com = comodos[i];
      const minimo = com.area / 6; // regra prática: 1/6 da área de piso
      const ok = com.areaJanelas >= minimo;
      linhas.push({
        andar: a.nome, nome: `Cômodo ${i + 1}`,
        area: com.area, areaJanelas: com.areaJanelas,
        minimo, ok, pct: com.areaJanelas / com.area * 100
      });
    }
  }
  return linhas;
}

function mostrarIluminacao() {
  const linhas = relatorioIluminacao();
  const cv = abrirModalVista('Iluminação natural por cômodo');
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  ultimaVista = { modo: 'ilum' };

  ctx.fillStyle = '#222'; ctx.font = `bold ${15 * devicePixelRatio}px sans-serif`;
  ctx.fillText('Iluminação natural por cômodo', 40, 40);
  ctx.font = `${11 * devicePixelRatio}px sans-serif`; ctx.fillStyle = '#666';
  ctx.fillText(`Referência prática: área de esquadrias ≥ 1/6 da área de piso (NBR contexto residencial)`, 40, 60);

  if (!linhas.length) {
    ctx.fillStyle = '#888'; ctx.font = `${13 * devicePixelRatio}px sans-serif`;
    ctx.fillText('Nenhum cômodo fechado detectado — desenhe paredes formando ambientes.', 40, 100);
    return;
  }
  const x0 = 40, y0 = 100, linhaAlt = 30 * devicePixelRatio;
  ctx.font = `bold ${11 * devicePixelRatio}px sans-serif`; ctx.fillStyle = '#222';
  ctx.fillText('CÔMODO', x0, y0);
  ctx.fillText('PISO', x0 + 220 * devicePixelRatio, y0);
  ctx.fillText('JANELAS', x0 + 300 * devicePixelRatio, y0);
  ctx.fillText('MÍNIMO', x0 + 400 * devicePixelRatio, y0);
  ctx.fillText('%', x0 + 480 * devicePixelRatio, y0);
  ctx.fillText('SITUAÇÃO', x0 + 520 * devicePixelRatio, y0);
  ctx.strokeStyle = '#999'; ctx.beginPath();
  ctx.moveTo(x0, y0 + 6); ctx.lineTo(x0 + 640 * devicePixelRatio, y0 + 6); ctx.stroke();

  linhas.forEach((l, i) => {
    const y = y0 + (i + 1) * linhaAlt;
    if (i % 2 === 1) { ctx.fillStyle = 'rgba(0,0,0,.04)'; ctx.fillRect(x0 - 6, y - linhaAlt + 8, 660 * devicePixelRatio, linhaAlt); }
    ctx.fillStyle = '#222'; ctx.font = `${11 * devicePixelRatio}px sans-serif`;
    ctx.fillText(`${l.nome} (${l.andar})`, x0, y);
    ctx.fillText(l.area.toFixed(1).replace('.', ',') + ' m²', x0 + 220 * devicePixelRatio, y);
    ctx.fillText(l.areaJanelas.toFixed(2).replace('.', ',') + ' m²', x0 + 300 * devicePixelRatio, y);
    ctx.fillText(l.minimo.toFixed(2).replace('.', ',') + ' m²', x0 + 400 * devicePixelRatio, y);
    ctx.fillText(l.pct.toFixed(1).replace('.', ',') + '%', x0 + 480 * devicePixelRatio, y);
    ctx.fillStyle = l.ok ? '#2e7d32' : '#c62828';
    ctx.font = `bold ${11 * devicePixelRatio}px sans-serif`;
    ctx.fillText(l.ok ? '✓ ADEQUADO' : '✗ INSUFICIENTE', x0 + 520 * devicePixelRatio, y);
  });

  // carimbo
  const ch = 64 * devicePixelRatio, cy0 = H - ch;
  ctx.strokeStyle = '#222'; ctx.lineWidth = 1.5;
  ctx.strokeRect(40, cy0, W - 80, ch);
  const cw = (W - 80) / 5;
  [['PROJETO', projeto.nome], ['VISTA', 'Iluminação'], ['DATA', new Date().toLocaleDateString('pt-BR')], ['PROGRAMA', 'BIM Studio MVP'], ['', '']].forEach((col, i) => {
    if (i > 0) { ctx.beginPath(); ctx.moveTo(40 + i * cw, cy0); ctx.lineTo(40 + i * cw, H); ctx.stroke(); }
    ctx.fillStyle = '#555'; ctx.font = `${9 * devicePixelRatio}px sans-serif`;
    ctx.fillText(col[0], 46 + i * cw, cy0 + 14 * devicePixelRatio);
    ctx.fillStyle = '#111'; ctx.font = `bold ${11 * devicePixelRatio}px sans-serif`;
    ctx.fillText(String(col[1]).slice(0, 24), 46 + i * cw, cy0 + 32 * devicePixelRatio);
  });
}
$('#btnIlum')?.addEventListener('click', mostrarIluminacao);

// ---------------- Autosalvamento com histórico de versões ----------------
const CHAVE_VERSOES = 'bim-versoes';
const MAX_VERSOES = 20;

function salvarVersao(autor = 'auto') {
  try {
    let versoes = [];
    try { versoes = JSON.parse(localStorage.getItem(CHAVE_VERSOES) || '[]'); } catch {}
    const agora = Date.now();
    // não criar versão se a última for idêntica e recente (< 60s)
    const ultima = versoes[versoes.length - 1];
    const estadoAtual = JSON.stringify({ projeto, terreno, tipologias, cortes, circuitos });
    if (ultima && ultima.dados === estadoAtual && agora - ultima.ts < 60000) return;
    const n = versoes.length + 1;
    versoes.push({ n, ts: agora, autor, dados: estadoAtual });
    if (versoes.length > MAX_VERSOES) versoes = versoes.slice(versoes.length - MAX_VERSOES);
    localStorage.setItem(CHAVE_VERSOES, JSON.stringify(versoes));
    renderizarVersoes();
  } catch (e) { /* quota cheia: ignora */ }
}

function salvarVersaoManual() {
  const rotulo = prompt('Nome da versão (opcional):') || ('versão manual');
  salvarVersao(rotulo);
}

function restaurarVersao(n) {
  try {
    const versoes = JSON.parse(localStorage.getItem(CHAVE_VERSOES) || '[]');
    const v = versoes.find(x => x.n === n);
    if (!v) return;
    const dados = JSON.parse(v.dados);
    projeto = dados.projeto;
    terreno = dados.terreno || null;
    tipologias = dados.tipologias || [];
    cortes = dados.cortes || [];
    circuitos = dados.circuitos || [];
    uid = projeto.elementos.reduce((m, e) => Math.max(m, e.id), 0) + 1;
    selecao = null;
    salvarEstado();
    sincronizar();
  } catch (e) { alert('Falha ao restaurar a versão.'); }
}

function renderizarVersoes() {
  const box = $('#listaVersoes');
  if (!box) return;
  let versoes = [];
  try { versoes = JSON.parse(localStorage.getItem(CHAVE_VERSOES) || '[]'); } catch {}
  if (!versoes.length) { box.innerHTML = '<span class="vazio">Ainda sem versões salvas.</span>'; return; }
  box.innerHTML = versoes.slice().reverse().map(v => {
    const d = new Date(v.ts);
    const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const dia = d.toLocaleDateString('pt-BR');
    return `<div class="item-andar">
      <span class="nome" style="font-size:11px">#${v.n} · ${v.autor}</span>
      <span style="font-size:10px;color:#888">${dia} ${hora}</span>
      <button class="btn-pequeno" data-restaurar="${v.n}" style="margin-left:4px">Restaurar</button>
    </div>`;
  }).join('');
  box.querySelectorAll('[data-restaurar]').forEach(b => b.addEventListener('click', () => restaurarVersao(+b.dataset.restaurar)));
}

// autosalvamento: o sincronizar() chama salvarVersao() com deduplicação
$('#btnVersaoManual')?.addEventListener('click', salvarVersaoManual);

// ---------------- Unidades tipológicas (blocos de apartamentos) ----------------
// salvar o pavimento atual como tipologia
function salvarTipologia() {
  const nome = prompt('Nome da tipologia (ex.: "Tipo A — 2 quartos"):');
  if (!nome) return;
  const elems = projeto.elementos.filter(e => e.andar === projeto.idAndarAtivo);
  const copia = JSON.parse(JSON.stringify(elems)); // mantém ids como chaves de referência interna
  tipologias.push({ id: Date.now(), nome, elementos: copia });
  renderizarTipologias();
}
// estampar a tipologia no pavimento atual com offset (posição do clique ou centralizado)
function estamparTipologia(idTip, dx, dy) {
  const tip = tipologias.find(t => t.id === idTip);
  if (!tip) return;
  const novos = JSON.parse(JSON.stringify(tip.elementos)).map(e => {
    e.id = ++uid;
    // deslocar geometria
    if (e.tipo === 'parede') { e.x1 += dx; e.x2 += dx; e.y1 += dy; e.y2 += dy; }
    else if (e.tipo === 'coluna' || e.tipo === 'objeto' || e.tipo === 'escada' || e.tipo === 'pontoEletrico' || e.tipo === 'pontoHidraulico') { e.x += dx; e.y += dy; }
    else if (e.tipo === 'laje' || e.tipo === 'telhado') e.pontos = e.pontos.map(p => ({ x: p.x + dx, y: p.y + dy }));
    return e;
  });
  // reatribuir ids de paredes para portas/janelas
  const porParedeAntiga = new Map();
  JSON.parse(JSON.stringify(tip.elementos)).forEach(e => porParedeAntiga.set(e.id, e));
  const idAntigoParaNovo = new Map();
  const orig = JSON.parse(JSON.stringify(tip.elementos));
  orig.forEach((e, i) => { if (e.tipo === 'parede') idAntigoParaNovo.set(e.id, novos[i].id); });
  novos.forEach(e => { if (e.paredeId != null) e.paredeId = idAntigoParaNovo.get(e.paredeId) ?? e.paredeId; });
  projeto.elementos.push(...novos);
  salvarEstado(); sincronizar();
}

function renderizarTipologias() {
  const box = $('#listaTipologias');
  if (!box) return;
  if (!tipologias.length) { box.innerHTML = '<span class="vazio">Nenhuma tipologia salva.</span>'; return; }
  box.innerHTML = tipologias.map(t =>
    `<div class="item-andar" data-tip="${t.id}">
       <span class="nome">${t.nome}</span>
       <button class="btn-pequeno" data-estampar="${t.id}" style="margin-left:4px">Estampar</button>
       <button class="btn-pequeno" data-deltip="${t.id}">✕</button>
     </div>`).join('');
  box.querySelectorAll('[data-estampar]').forEach(b => b.addEventListener('click', ev => {
    ev.stopPropagation();
    const idTip = +b.dataset.estampar;
    // estampar onde o usuário clicar em seguida: usar ferramenta temporária
    tipologiaParaEstampar = idTip;
    alert('Clique na planta para posicionar a unidade.');
  }));
  box.querySelectorAll('[data-deltip]').forEach(b => b.addEventListener('click', ev => {
    ev.stopPropagation();
    tipologias = tipologias.filter(t => t.id !== +b.dataset.deltip);
    renderizarTipologias();
  }));
}
let tipologiaParaEstampar = null;

// clique para posicionar a tipologia
function clicarEstamparTipologia(mx, my) {
  const id = tipologiaParaEstampar;
  tipologiaParaEstampar = null;
  estamparTipologia(id, mx, my);
}

// ---------------- Terreno com curvas de nível ----------------
function novoTerreno(cx0, cy0) {
  const nx = 25, ny = 25, cel = 5;
  const alturas = Array.from({ length: ny }, (_, j) =>
    Array.from({ length: nx }, (_, i) => {
      // suavidade: ondulação suave senoidal como padrão
      return Math.sin(i / 4) * Math.cos(j / 4) * 0.8 + 10;
    }));
  return { origem: { x: cx0 - (nx * cel) / 2, y: cy0 - (ny * cel) / 2 }, cel, nx, ny, alturas };
}
function alturaTerreno(tx, ty) {
  if (!terreno) return 0;
  const i = Math.floor((tx - terreno.origem.x) / terreno.cel);
  const j = Math.floor((ty - terreno.origem.y) / terreno.cel);
  if (i < 0 || j < 0 || i >= terreno.nx || j >= terreno.ny) return 0;
  return terreno.alturas[j][i];
}
function ajustarTerreno(tx, ty, delta) {
  if (!terreno) return;
  const i = Math.floor((tx - terreno.origem.x) / terreno.cel);
  const j = Math.floor((ty - terreno.origem.y) / terreno.cel);
  if (i < 0 || j < 0 || i >= terreno.nx || j >= terreno.ny) return;
  // pincel suave raio 2 células
  for (let jj = Math.max(0, j - 2); jj <= Math.min(terreno.ny - 1, j + 2); jj++)
    for (let ii = Math.max(0, i - 2); ii <= Math.min(terreno.nx - 1, i + 2); ii++) {
      const d = Math.hypot(ii - i, jj - j);
      if (d <= 2) terreno.alturas[jj][ii] = Math.max(0, terreno.alturas[jj][ii] + delta * (1 - d / 3));
    }
}

// curvas de nível por marching squares (casos simples)
function segmentosCurvaNivel(nivel) {
  const segs = [];
  const { alturas, nx, ny, cel, origem } = terreno;
  const X = (i) => origem.x + i * cel;
  const Y = (j) => origem.y + j * cel;
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = alturas[j][i], b = alturas[j][i + 1], cc = alturas[j + 1][i + 1], d = alturas[j + 1][i];
    const casos = [[a, b, X(i), Y(j), X(i + 1), Y(j)], [b, cc, X(i + 1), Y(j), X(i + 1), Y(j + 1)],
                   [cc, d, X(i + 1), Y(j + 1), X(i), Y(j + 1)], [d, a, X(i), Y(j + 1), X(i), Y(j)]];
    for (const [v1, v2, x1, y1, x2, y2] of casos) {
      if ((v1 < nivel) !== (v2 < nivel)) {
        const t = (nivel - v1) / (v2 - v1);
        segs.push({ x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t, i, j });
      }
    }
  }
  return segs;
}

// desenho 2D das curvas de nível
function desenharTerreno2d() {
  if (!terreno) return;
  const niveis = [];
  const amin = Math.min(...terreno.alturas.flat()), amax = Math.max(...terreno.alturas.flat());
  for (let n = Math.ceil(amin); n <= Math.floor(amax); n += 1) niveis.push(n);
  cx2.font = '9px sans-serif'; cx2.textAlign = 'left';
  niveis.forEach((nv, idx) => {
    const segs = segmentosCurvaNivel(nv);
    cx2.strokeStyle = '#7a9a5a'; cx2.lineWidth = nv % 5 === 0 ? 1.8 : 0.7;
    cx2.beginPath();
    for (const s of segs) {
      const p = mundoParaTela(s.x, s.y);
      cx2.moveTo(p.x, p.y);
      // pontos consecutivos do mesmo quadrado formam mini-segmentos: unir por proximidade
      const prox = segs.filter(o => o.i === s.i && o.j === s.j && o !== s);
      if (prox.length) { const q = mundoParaTela(prox[0].x, prox[0].y); cx2.lineTo(q.x, q.y); }
    }
    cx2.stroke();
  });
}

// malha 3D do terreno
function reconstruirTerreno3d() {
  if (!terreno) return;
  const { alturas, nx, ny, cel, origem } = terreno;
  const g = new THREE.PlaneGeometry((nx - 1) * cel, (ny - 1) * cel, nx - 1, ny - 1);
  const pos = g.attributes.position;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const idx = j * nx + i;
    const h = alturas[j][i] - 10; // base em torno de 10
    pos.setY(idx, h);
    pos.setX(idx, (i - (nx - 1) / 2) * cel);
    pos.setZ(idx, -(j - (ny - 1) / 2) * cel);
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: '#8fae6d' }));
  m.name = 'terreno3d';
  m.receiveShadow = true;
  scene.add(m);
}

// ferramenta terreno: clique eleva, shift+clique rebaixa
function ferramentaTerrenoClick(mx, my, shift) {
  if (!terreno) terreno = novoTerreno(5, 5);
  ajustarTerreno(mx, my, shift ? -0.5 : 0.5);
  desenhar2d();
  reconstruir3d();
  aplicarSol();
}

// ---------------- Timelapse solar ----------------
let timelapseAtivo = false;
let timelapseRaf = null;

function iniciarTimelapse() {
  if (timelapseAtivo) { pararTimelapse(); return; }
  timelapseAtivo = true;
  $('#btnTimelapse').textContent = '⏸ Pausar';
  solCfg.ativo = true;
  $('#chkSol').checked = true;
  let t0 = null;
  const duracao = 12000; // 12s para o dia inteiro
  const passo = (ts) => {
    if (!timelapseAtivo) return;
    if (!t0) t0 = ts;
    const frac = Math.min(1, (ts - t0) / duracao);
    solCfg.hora = 6 + frac * 12; // 6h às 18h
    const inp = $('#inpHora');
    if (inp) inp.value = solCfg.hora.toFixed(1);
    aplicarSol();
    atualizarPainelSol();
    if (frac < 1) timelapseRaf = requestAnimationFrame(passo);
    else pararTimelapse();
  };
  timelapseRaf = requestAnimationFrame(passo);
}
function pararTimelapse() {
  timelapseAtivo = false;
  if (timelapseRaf) cancelAnimationFrame(timelapseRaf);
  const b = $('#btnTimelapse');
  if (b) b.textContent = '▶ Timelapse';
}
$('#btnTimelapse')?.addEventListener('click', iniciarTimelapse);
$('#btnSalvarTip')?.addEventListener('click', salvarTipologia);
$('#btnTerreno')?.addEventListener('click', () => {
  if (!terreno) { terreno = novoTerreno(5, 5); desenhar2d(); reconstruir3d(); aplicarSol(); }
});

// ---------------- Quantitativos / Ordem de compra ----------------
function calcularQuantitativos() {
  const itens = [];
  const porAndar = {};
  for (const a of projeto.andares) {
    porAndar[a.id] = { paredeComp: 0, paredeArea: 0, paredeVol: 0, lajeArea: 0, lajeVol: 0,
      portas: 0, janelas: 0, colunas: 0, escadas: 0, pontosEletricos: 0, pontosHidraulicos: 0 };
    const elems = projeto.elementos.filter(e => e.andar === a.id);
    for (const e of elems) {
      if (e.tipo === 'parede') {
        const comp = Math.hypot(e.x2 - e.x1, e.y2 - e.y1);
        porAndar[a.id].paredeComp += comp;
        porAndar[a.id].paredeArea += comp * a.alturaPisoPiso;
        porAndar[a.id].paredeVol += comp * a.alturaPisoPiso * e.espessura;
      } else if (e.tipo === 'laje' && e.fechado && e.pontos.length >= 3) {
        let area = 0;
        for (let i = 0; i < e.pontos.length; i++) {
          const p1 = e.pontos[i], p2 = e.pontos[(i + 1) % e.pontos.length];
          area += p1.x * p2.y - p2.x * p1.y;
        }
        area = Math.abs(area) / 2;
        porAndar[a.id].lajeArea += area;
        porAndar[a.id].lajeVol += area * (e.espessura || 0.2);
      } else if (e.tipo === 'porta') porAndar[a.id].portas++;
      else if (e.tipo === 'janela') porAndar[a.id].janelas++;
      else if (e.tipo === 'coluna') porAndar[a.id].colunas++;
      else if (e.tipo === 'escada') porAndar[a.id].escadas++;
      else if (e.tipo === 'pontoEletrico') porAndar[a.id].pontosEletricos++;
      else if (e.tipo === 'pontoHidraulico') porAndar[a.id].pontosHidraulicos++;
    }
  }
  // agregados por item de obra
  const tot = projeto.andares.reduce((acc, a) => {
    const p = porAndar[a.id];
    acc.paredeComp += p.paredeComp; acc.paredeArea += p.paredeArea; acc.paredeVol += p.paredeVol;
    acc.lajeArea += p.lajeArea; acc.lajeVol += p.lajeVol;
    acc.portas += p.portas; acc.janelas += p.janelas; acc.colunas += p.colunas;
    acc.escadas += p.escadas; acc.pe += p.pontosEletricos; acc.ph += p.pontosHidraulicos;
    return acc;
  }, { paredeComp: 0, paredeArea: 0, paredeVol: 0, lajeArea: 0, lajeVol: 0, portas: 0, janelas: 0, colunas: 0, escadas: 0, pe: 0, ph: 0 });

  const fiação = circuitos.reduce((t, cir) => t + comprimentoCircuito(cir), 0);

  itens.push(
    { item: 'Alvenaria/parede (comprimento)', qtd: tot.paredeComp, un: 'm' },
    { item: 'Alvenaria/parede (área de parede)', qtd: tot.paredeArea, un: 'm²' },
    { item: 'Alvenaria/parede (volume)', qtd: tot.paredeVol, un: 'm³' },
    { item: 'Laje (área)', qtd: tot.lajeArea, un: 'm²' },
    { item: 'Laje (volume/concreto)', qtd: tot.lajeVol, un: 'm³' },
    { item: 'Portas', qtd: tot.portas, un: 'un' },
    { item: 'Janelas', qtd: tot.janelas, un: 'un' },
    { item: 'Colunas', qtd: tot.colunas, un: 'un' },
    { item: 'Escadas (lances)', qtd: tot.escadas, un: 'un' },
    { item: 'Pontos elétricos', qtd: tot.pe, un: 'un' },
    { item: 'Pontos hidráulicos', qtd: tot.ph, un: 'un' },
    { item: 'Fiação elétrica (circuitos)', qtd: fiação, un: 'm' }
  );
  return { itens, porAndar, tot };
}

function mostrarQuantitativos() {
  const { itens } = calcularQuantitativos();
  const cv = abrirModalVista('Quantitativos — Ordem de compra');
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  ultimaVista = { modo: 'quant' };

  ctx.fillStyle = '#222'; ctx.font = `bold ${15 * devicePixelRatio}px sans-serif`;
  ctx.fillText('Quantitativos / Ordem de compra', 40, 40);
  ctx.font = `${11 * devicePixelRatio}px sans-serif`; ctx.fillStyle = '#666';
  ctx.fillText(`Projeto: ${projeto.nome} · ${new Date().toLocaleDateString('pt-BR')}`, 40, 60);

  // tabela
  const x0 = 40, y0 = 90;
  const linhaAlt = 26 * devicePixelRatio;
  ctx.font = `bold ${11 * devicePixelRatio}px sans-serif`; ctx.fillStyle = '#222';
  ctx.fillText('ITEM', x0, y0);
  ctx.fillText('QTD', x0 + 380 * devicePixelRatio, y0);
  ctx.fillText('UN', x0 + 460 * devicePixelRatio, y0);
  ctx.strokeStyle = '#999'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x0, y0 + 6); ctx.lineTo(x0 + 500 * devicePixelRatio, y0 + 6); ctx.stroke();

  ctx.font = `${11 * devicePixelRatio}px sans-serif`;
  itens.forEach((it, i) => {
    const y = y0 + (i + 1) * linhaAlt;
    ctx.fillStyle = '#222';
    ctx.fillText(it.item, x0, y);
    ctx.fillText(it.qtd.toFixed(2).replace('.', ','), x0 + 380 * devicePixelRatio, y);
    ctx.fillText(it.un, x0 + 460 * devicePixelRatio, y);
    if (i % 2 === 1) { ctx.fillStyle = 'rgba(0,0,0,.04)'; ctx.fillRect(x0 - 6, y - linhaAlt + 6, 520 * devicePixelRatio, linhaAlt); }
  });

  // carimbo simplificado
  const ch = 64 * devicePixelRatio, cy0 = H - ch;
  ctx.strokeStyle = '#222'; ctx.lineWidth = 1.5;
  ctx.strokeRect(40, cy0, W - 80, ch);
  const cw = (W - 80) / 5;
  [['PROJETO', projeto.nome], ['VISTA', 'Quantitativos'], ['DATA', new Date().toLocaleDateString('pt-BR')], ['PROGRAMA', 'BIM Studio MVP'], ['', '']].forEach((col, i) => {
    if (i > 0) { ctx.beginPath(); ctx.moveTo(40 + i * cw, cy0); ctx.lineTo(40 + i * cw, H); ctx.stroke(); }
    ctx.fillStyle = '#555'; ctx.font = `${9 * devicePixelRatio}px sans-serif`;
    ctx.fillText(col[0], 46 + i * cw, cy0 + 14 * devicePixelRatio);
    ctx.fillStyle = '#111'; ctx.font = `bold ${11 * devicePixelRatio}px sans-serif`;
    ctx.fillText(String(col[1]).slice(0, 24), 46 + i * cw, cy0 + 32 * devicePixelRatio);
  });
}

function exportarCSVQuantitativos() {
  const { itens } = calcularQuantitativos();
  const linhas = ['Item;Quantidade;Unidade'];
  for (const it of itens) linhas.push(`"${it.item}";${it.qtd.toFixed(2).replace('.', ',')};${it.un}`);
  const blob = new Blob(['\ufeff' + linhas.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${projeto.nome.replace(/\s+/g, '_')}_quantitativos.csv`;
  a.click();
}

$('#btnQuant')?.addEventListener('click', mostrarQuantitativos);
$('#btnCSV')?.addEventListener('click', exportarCSVQuantitativos);

// ---------------- Memorial descritivo automático ----------------
function gerarMemorialTexto() {
  const q = calcularQuantitativos();
  const lin = [];
  lin.push(`MEMORIAL DESCRITIVO — ${projeto.nome.toUpperCase()}`);
  lin.push('');
  lin.push(`Data: ${new Date().toLocaleDateString('pt-BR')}`);
  lin.push(`Programa: BIM Studio MVP`);
  lin.push('');
  lin.push('1. GENERALIDADES');
  lin.push(`O presente memorial descreve as características do projeto "${projeto.nome}".`);
  lin.push('');
  // pavimentos
  lin.push('2. PAVIMENTOS');
  for (const a of projeto.andares) {
    lin.push(`- ${a.nome}: altura de piso a piso ${a.alturaPisoPiso.toFixed(2).replace('.', ',')} m, cota de nível +${a.alturaBase.toFixed(2).replace('.', ',')} m.`);
  }
  lin.push('');
  // cômodos
  const comodosPorAndar = {};
  for (const a of projeto.andares) comodosPorAndar[a.id] = detectarComodos(a.id);
  lin.push('3. AMBIENTES');
  for (const a of projeto.andares) {
    const comodos = comodosPorAndar[a.id] || [];
    if (!comodos.length) continue;
    comodos.sort((x, y) => y.area - x.area);
    lin.push(`${a.nome}:`);
    comodos.forEach((com, i) => {
      const linha = `  - Ambiente ${i + 1}: área de ${com.area.toFixed(1).replace('.', ',')} m², iluminação natural ${com.areaJanelas > 0 ? 'com ' + com.areaJanelas.toFixed(2).replace('.', ',') + ' m² de esquadrias (' + (com.areaJanelas / com.area * 100).toFixed(1).replace('.', ',') + '% do piso)' : 'sem esquadrias'}.`;
      lin.push(linha);
    });
  }
  lin.push('');
  lin.push('4. PAREDES');
  lin.push(`- Comprimento total: ${q.tot.paredeComp.toFixed(2).replace('.', ',')} m.`);
  lin.push(`- Área total de parede: ${q.tot.paredeArea.toFixed(2).replace('.', ',')} m².`);
  lin.push(`- Volume total: ${q.tot.paredeVol.toFixed(2).replace('.', ',')} m³.`);
  const espessuras = [...new Set(projeto.elementos.filter(e => e.tipo === 'parede').map(e => e.espessura))];
  if (espessuras.length) lin.push(`- Espessuras utilizadas: ${espessuras.map(e => e.toFixed(2).replace('.', ',') + ' m').join(', ')}.`);
  lin.push('');
  lin.push('5. LAJES');
  lin.push(`- Área total: ${q.tot.lajeArea.toFixed(2).replace('.', ',')} m².`);
  lin.push(`- Volume de concreto: ${q.tot.lajeVol.toFixed(2).replace('.', ',')} m³.`);
  lin.push('');
  lin.push('6. ESQUADRIAS');
  lin.push(`- Portas: ${q.tot.portas} unidade(s).`);
  lin.push(`- Janelas: ${q.tot.janelas} unidade(s).`);
  lin.push('');
  lin.push('7. INSTALAÇÃO ELÉTRICA');
  lin.push(`- Pontos: ${q.tot.pe} unidade(s).`);
  if (circuitos.length) {
    lin.push(`- Circuitos: ${circuitos.length}, totalizando ${circuitos.reduce((t, cir) => t + comprimentoCircuito(cir), 0).toFixed(1).replace('.', ',')} m de fiação.`);
  }
  lin.push('');
  lin.push('8. INSTALAÇÃO HIDRÁULICA');
  lin.push(`- Pontos: ${q.tot.ph} unidade(s).`);
  lin.push('');
  lin.push('9. ESTRUTURA');
  lin.push(`- Colunas: ${q.tot.colunas} unidade(s).`);
  lin.push(`- Escadas: ${q.tot.escadas} lance(s).`);
  lin.push('');
  lin.push('10. OBSERVAÇÕES');
  lin.push('- Quantitativos estimados a partir do modelo BIM, sem perdas nem desperdícios.');
  lin.push('- Memorial gerado automaticamente; revisar antes de uso oficial.');
  return lin.join('\n');
}

function mostrarMemorial() {
  const cv = abrirModalVista('Memorial descritivo');
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  ultimaVista = { modo: 'memorial' };

  const texto = gerarMemorialTexto();
  ctx.fillStyle = '#222';
  ctx.font = `${11 * devicePixelRatio}px 'Courier New', monospace`;
  const linhasTxt = texto.split('\n');
  let y = 40;
  const linhaAlt = 15 * devicePixelRatio;
  for (const lt of linhasTxt) {
    if (lt.match(/^\d+\./)) { ctx.font = `bold ${11 * devicePixelRatio}px 'Courier New', monospace`; }
    else ctx.font = `${11 * devicePixelRatio}px 'Courier New', monospace`;
    ctx.fillText(lt, 40, y);
    y += linhaAlt;
    if (y > H - 90) break;
  }

  // carimbo
  const ch = 64 * devicePixelRatio, cy0 = H - ch;
  ctx.strokeStyle = '#222'; ctx.lineWidth = 1.5;
  ctx.strokeRect(40, cy0, W - 80, ch);
  const cw = (W - 80) / 5;
  [['PROJETO', projeto.nome], ['VISTA', 'Memorial descritivo'], ['DATA', new Date().toLocaleDateString('pt-BR')], ['PROGRAMA', 'BIM Studio MVP'], ['', '']].forEach((col, i) => {
    if (i > 0) { ctx.beginPath(); ctx.moveTo(40 + i * cw, cy0); ctx.lineTo(40 + i * cw, H); ctx.stroke(); }
    ctx.fillStyle = '#555'; ctx.font = `${9 * devicePixelRatio}px sans-serif`;
    ctx.fillText(col[0], 46 + i * cw, cy0 + 14 * devicePixelRatio);
    ctx.fillStyle = '#111'; ctx.font = `bold ${11 * devicePixelRatio}px sans-serif`;
    ctx.fillText(String(col[1]).slice(0, 24), 46 + i * cw, cy0 + 32 * devicePixelRatio);
  });
}
$('#btnMemorial')?.addEventListener('click', mostrarMemorial);

// ---------------- Comparação sazonal (21/6 vs 21/12) ----------------
function curvaSolDia(lat, dia, mes) {
  const pontos = [];
  for (let h = 4; h <= 20; h += 0.25) {
    const { elevacao, azimute } = posicaoSol({ lat, hora: h, dia, mes });
    if (elevacao > 0) pontos.push({ hora: h, elevacao, azimute });
  }
  return pontos;
}

function mostrarComparacaoSazonal() {
  const cv = abrirModalVista('Estudo sazonal — Solstícios');
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  ultimaVista = { modo: 'sazonal' };

  const lat = solCfg.lat;
  const curvaJun = curvaSolDia(lat, 21, 6);
  const curvaDez = curvaSolDia(lat, 21, 12);

  ctx.fillStyle = '#222'; ctx.font = `bold ${15 * devicePixelRatio}px sans-serif`;
  ctx.fillText('Estudo sazonal — trajetória do sol', 40, 36);
  ctx.font = `${11 * devicePixelRatio}px sans-serif`; ctx.fillStyle = '#666';
  ctx.fillText(`Latitude: ${lat.toFixed(2).replace('.', ',')}º · Comparação dos solstícios (21/6 e 21/12)`, 40, 56);

  // área do gráfico: elevação (Y) vs hora (X)
  const gx0 = 70, gy0 = 90, gw = W - 2 * 70, gh = H - 260;
  // eixos
  ctx.strokeStyle = '#333'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(gx0, gy0); ctx.lineTo(gx0, gy0 + gh); ctx.lineTo(gx0 + gw, gy0 + gh); ctx.stroke();
  // Y: 0-90º
  for (let elev = 0; elev <= 90; elev += 30) {
    const y = gy0 + gh - (elev / 90) * gh;
    ctx.strokeStyle = '#ddd';
    ctx.beginPath(); ctx.moveTo(gx0, y); ctx.lineTo(gx0 + gw, y); ctx.stroke();
    ctx.fillStyle = '#555'; ctx.font = `${10 * devicePixelRatio}px sans-serif`; ctx.textAlign = 'right';
    ctx.fillText(elev + 'º', gx0 - 6, y + 3);
  }
  ctx.textAlign = 'center';
  for (let h = 4; h <= 20; h += 2) {
    const x = gx0 + ((h - 4) / 16) * gw;
    ctx.fillStyle = '#555';
    ctx.fillText(h + 'h', x, gy0 + gh + 16);
  }
  ctx.textAlign = 'left';
  ctx.fillStyle = '#555';
  ctx.save(); ctx.translate(24, gy0 + gh / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center';
  ctx.fillText('Elevação solar (º)', 0, 0); ctx.restore();

  const desenharCurva = (curva, cor) => {
    ctx.strokeStyle = cor; ctx.lineWidth = 2.5; ctx.beginPath();
    curva.forEach((p, i) => {
      const x = gx0 + ((p.hora - 4) / 16) * gw;
      const y = gy0 + gh - (p.elevacao / 90) * gh;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.stroke();
  };
  desenharCurva(curvaJun, '#c62828');
  desenharCurva(curvaDez, '#1565c0');

  // legendas + picos
  const picoJun = curvaJun.reduce((m, p) => p.elevacao > m.elevacao ? p : m, { elevacao: -1 });
  const picoDez = curvaDez.reduce((m, p) => p.elevacao > m.elevacao ? p : m, { elevacao: -1 });
  ctx.font = `bold ${12 * devicePixelRatio}px sans-serif`;
  ctx.fillStyle = '#c62828';
  ctx.fillText(`■ 21/6 (inverno HS): pico ${picoJun.elevacao.toFixed(1).replace('.', ',')}º às ${Math.floor(picoJun.hora)}h`, gx0 + 10, gy0 + 20);
  ctx.fillStyle = '#1565c0';
  ctx.fillText(`■ 21/12 (verão HS): pico ${picoDez.elevacao.toFixed(1).replace('.', ',')}º às ${Math.floor(picoDez.hora)}h`, gx0 + 10, gy0 + 40);

  // conclusão
  ctx.fillStyle = '#444'; ctx.font = `${11 * devicePixelRatio}px sans-serif`;
  const diff = picoJun.elevacao - picoDez.elevacao;
  ctx.fillText(`Diferença de elevação no pico: ${Math.abs(diff).toFixed(1).replace('.', ',')}º — ${Math.abs(diff) < 1 ? 'praticamente nula (trópicos)' : 'variação sazonal significativa'}.`, 40, gy0 + gh + 60);

  // carimbo
  const ch = 64 * devicePixelRatio, cy0 = H - ch;
  ctx.strokeStyle = '#222'; ctx.lineWidth = 1.5;
  ctx.strokeRect(40, cy0, W - 80, ch);
  const cw = (W - 80) / 5;
  [['PROJETO', projeto.nome], ['VISTA', 'Estudo sazonal'], ['DATA', new Date().toLocaleDateString('pt-BR')], ['PROGRAMA', 'BIM Studio MVP'], ['', '']].forEach((col, i) => {
    if (i > 0) { ctx.beginPath(); ctx.moveTo(40 + i * cw, cy0); ctx.lineTo(40 + i * cw, H); ctx.stroke(); }
    ctx.fillStyle = '#555'; ctx.font = `${9 * devicePixelRatio}px sans-serif`;
    ctx.fillText(col[0], 46 + i * cw, cy0 + 14 * devicePixelRatio);
    ctx.fillStyle = '#111'; ctx.font = `bold ${11 * devicePixelRatio}px sans-serif`;
    ctx.fillText(String(col[1]).slice(0, 24), 46 + i * cw, cy0 + 32 * devicePixelRatio);
  });
}
$('#btnSazonal')?.addEventListener('click', mostrarComparacaoSazonal);

// ---------------- Ventilação cruzada ----------------
// um cômodo tem ventilação cruzada se possui aberturas (portas/janelas) em paredes com
// orientações suficientemente distintas (ângulo entre eixos > 60º)
function analisarVentilacao(idAndar) {
  const elems = projeto.elementos.filter(e => e.andar === idAndar);
  const comodos = detectarComodos(idAndar);
  const aberturas = elems.filter(e => e.tipo === 'porta' || e.tipo === 'janela');
  const resultados = [];
  comodos.forEach((com, idx) => {
    const aberturasDoComodo = [];
    for (const ab of aberturas) {
      const p = el(ab.paredeId); if (!p) continue;
      const ang = Math.atan2(p.y2 - p.y1, p.x2 - p.x1);
      const ax = p.x1 + Math.cos(ang) * ab.distancia, ay = p.y1 + Math.sin(ang) * ab.distancia;
      if (Math.hypot(ax - com.cx, ay - com.cy) < Math.sqrt(com.area) / 1.2) {
        aberturasDoComodo.push({ tipo: ab.tipo, angParede: ang });
      }
    }
    // pares de aberturas com eixos de parede bem distintos
    let cruzada = false, parInfo = null;
    for (let i = 0; i < aberturasDoComodo.length && !cruzada; i++) {
      for (let j = i + 1; j < aberturasDoComodo.length; j++) {
        let dAng = Math.abs(aberturasDoComodo[i].angParede - aberturasDoComodo[j].angParede) % Math.PI;
        if (dAng > Math.PI / 2) dAng = Math.PI - dAng;
        if (dAng > Math.PI / 3) { // > 60º entre paredes
          cruzada = true;
          parInfo = { a: aberturasDoComodo[i].tipo, b: aberturasDoComodo[j].tipo, angulo: dAng * 180 / Math.PI };
        }
      }
    }
    resultados.push({ comodo: com, indice: idx + 1, aberturas: aberturasDoComodo.length, cruzada, parInfo });
  });
  return resultados;
}

function mostrarVentilacao() {
  const cv = abrirModalVista('Ventilação cruzada por cômodo');
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  ultimaVista = { modo: 'vent' };

  ctx.fillStyle = '#222'; ctx.font = `bold ${15 * devicePixelRatio}px sans-serif`;
  ctx.fillText('Ventilação cruzada por cômodo', 40, 40);
  ctx.font = `${11 * devicePixelRatio}px sans-serif`; ctx.fillStyle = '#666';
  ctx.fillText('Critério: aberturas em paredes com eixos divergentes (> 60º) no mesmo ambiente.', 40, 60);

  const linhas = [];
  for (const a of projeto.andares) {
    for (const r of analisarVentilacao(a.id)) {
      linhas.push({ andar: a.nome, ...r });
    }
  }
  if (!linhas.length) {
    ctx.fillStyle = '#888'; ctx.font = `${13 * devicePixelRatio}px sans-serif`;
    ctx.fillText('Nenhum cômodo fechado detectado — desenhe paredes formando ambientes.', 40, 100);
    return;
  }
  const x0 = 40, y0 = 100, linhaAlt = 30 * devicePixelRatio;
  ctx.font = `bold ${11 * devicePixelRatio}px sans-serif`; ctx.fillStyle = '#222';
  ctx.fillText('CÔMODO', x0, y0);
  ctx.fillText('PISO', x0 + 200 * devicePixelRatio, y0);
  ctx.fillText('ABERTURAS', x0 + 290 * devicePixelRatio, y0);
  ctx.fillText('SITUAÇÃO', x0 + 420 * devicePixelRatio, y0);
  ctx.strokeStyle = '#999'; ctx.beginPath();
  ctx.moveTo(x0, y0 + 6); ctx.lineTo(x0 + 580 * devicePixelRatio, y0 + 6); ctx.stroke();

  linhas.forEach((l, i) => {
    const y = y0 + (i + 1) * linhaAlt;
    if (i % 2 === 1) { ctx.fillStyle = 'rgba(0,0,0,.04)'; ctx.fillRect(x0 - 6, y - linhaAlt + 8, 600 * devicePixelRatio, linhaAlt); }
    ctx.fillStyle = '#222'; ctx.font = `${11 * devicePixelRatio}px sans-serif`;
    ctx.fillText(`Cômodo ${l.indice} (${l.andar})`, x0, y);
    ctx.fillText(l.comodo.area.toFixed(1).replace('.', ',') + ' m²', x0 + 200 * devicePixelRatio, y);
    ctx.fillText(String(l.aberturas), x0 + 290 * devicePixelRatio, y);
    ctx.font = `bold ${11 * devicePixelRatio}px sans-serif`;
    if (l.cruzada) {
      ctx.fillStyle = '#2e7d32';
      ctx.fillText(`✓ CRUZADA (${l.parInfo.a}+${l.parInfo.b}, ${l.parInfo.angulo.toFixed(0)}º)`, x0 + 420 * devicePixelRatio, y);
    } else {
      ctx.fillStyle = '#c62828';
      ctx.fillText(l.aberturas === 0 ? '✗ SEM ABERTURAS' : '✗ VENTILAÇÃO ÚNICA', x0 + 420 * devicePixelRatio, y);
    }
  });

  const ch = 64 * devicePixelRatio, cy0 = H - ch;
  ctx.strokeStyle = '#222'; ctx.lineWidth = 1.5;
  ctx.strokeRect(40, cy0, W - 80, ch);
  const cw = (W - 80) / 5;
  [['PROJETO', projeto.nome], ['VISTA', 'Ventilação'], ['DATA', new Date().toLocaleDateString('pt-BR')], ['PROGRAMA', 'BIM Studio MVP'], ['', '']].forEach((col, i) => {
    if (i > 0) { ctx.beginPath(); ctx.moveTo(40 + i * cw, cy0); ctx.lineTo(40 + i * cw, H); ctx.stroke(); }
    ctx.fillStyle = '#555'; ctx.font = `${9 * devicePixelRatio}px sans-serif`;
    ctx.fillText(col[0], 46 + i * cw, cy0 + 14 * devicePixelRatio);
    ctx.fillStyle = '#111'; ctx.font = `bold ${11 * devicePixelRatio}px sans-serif`;
    ctx.fillText(String(col[1]).slice(0, 24), 46 + i * cw, cy0 + 32 * devicePixelRatio);
  });
}
$('#btnVent')?.addEventListener('click', mostrarVentilacao);

// ---------------- Orçamento com preços editáveis ----------------
// preços padrão por item (R$), editáveis e persistidos no localStorage
const PRECOS_PADRAO = {
  'Alvenaria/parede (comprimento)': 95,
  'Alvenaria/parede (área de parede)': 55,
  'Alvenaria/parede (volume)': 380,
  'Laje (área)': 45,
  'Laje (volume/concreto)': 420,
  'Portas': 450,
  'Janelas': 520,
  'Colunas': 280,
  'Escadas (lances)': 1800,
  'Pontos elétricos': 85,
  'Pontos hidráulicos': 160,
  'Fiação elétrica (circuitos)': 12
};
function obterPrecos() {
  try {
    const salvo = JSON.parse(localStorage.getItem('bim-precos') || '{}');
    return { ...PRECOS_PADRAO, ...salvo };
  } catch { return { ...PRECOS_PADRAO }; }
}
function salvarPrecos(precos) {
  localStorage.setItem('bim-precos', JSON.stringify(precos));
}

function mostrarOrcamento() {
  const { itens } = calcularQuantitativos();
  const precos = obterPrecos();
  const modal = $('#modalVista');
  modal.style.display = 'flex';
  $('#tituloVista').textContent = 'Orçamento — Ordem de compra';
  ultimaVista = { modo: 'orc' };

  // tabela HTML com inputs de preço
  const box = $('#tabelaOrcamento');
  box.style.display = '';
  $('#cvVista').style.display = 'none';
  let total = 0;
  const linhasHtml = itens.map(it => {
    const preco = precos[it.item] ?? 0;
    const sub = it.qtd * preco;
    total += sub;
    return `<tr>
      <td style="padding:4px 8px;border-bottom:1px solid #ddd">${it.item}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #ddd;text-align:right">${it.qtd.toFixed(2).replace('.', ',')} ${it.un}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #ddd;text-align:right">
        <input data-item="${it.item}" type="number" step="0.01" min="0" value="${preco.toFixed(2)}" style="width:90px;text-align:right">
      </td>
      <td style="padding:4px 8px;border-bottom:1px solid #ddd;text-align:right" data-sub="${it.item}">R$ ${sub.toFixed(2).replace('.', ',')}</td>
    </tr>`;
  }).join('');
  box.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <tr style="background:#2b2f36;color:#fff">
        <th style="padding:6px 8px;text-align:left">Item</th>
        <th style="padding:6px 8px;text-align:right">Qtd</th>
        <th style="padding:6px 8px;text-align:right">Preço unit. (R$)</th>
        <th style="padding:6px 8px;text-align:right">Subtotal</th>
      </tr>
      ${linhasHtml}
      <tr>
        <td colspan="3" style="padding:8px;text-align:right"><b>TOTAL</b></td>
        <td style="padding:8px;text-align:right"><b id="totalOrc">R$ ${total.toFixed(2).replace('.', ',')}</b></td>
      </tr>
    </table>
    <div style="margin-top:10px;font-size:11px;color:#777">Edite os preços — os subtotais recalculam e ficam salvos no navegador.</div>`;
  box.querySelectorAll('input[data-item]').forEach(inp => inp.addEventListener('change', () => {
    const item = inp.dataset.item;
    const preco = parseFloat(inp.value) || 0;
    const novos = obterPrecos();
    novos[item] = preco;
    salvarPrecos(novos);
    mostrarOrcamento();
  }));
}
$('#btnOrc')?.addEventListener('click', mostrarOrcamento);

// CSV do orçamento (usa os preços editados)
function exportarCSVOrcamento() {
  const { itens } = calcularQuantitativos();
  const precos = obterPrecos();
  const linhas = ['Item;Quantidade;Unidade;Preco unitario (R$);Subtotal (R$)'];
  let total = 0;
  for (const it of itens) {
    const preco = precos[it.item] ?? 0;
    const sub = it.qtd * preco;
    total += sub;
    linhas.push(`"${it.item}";${it.qtd.toFixed(2).replace('.', ',')};${it.un};${preco.toFixed(2).replace('.', ',')};${sub.toFixed(2).replace('.', ',')}`);
  }
  linhas.push(`"TOTAL";"";"";"";${total.toFixed(2).replace('.', ',')}`);
  const blob = new Blob(['\ufeff' + linhas.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${projeto.nome.replace(/\s+/g, '_')}_orcamento.csv`;
  a.click();
}
$('#btnCSVOrc')?.addEventListener('click', exportarCSVOrcamento);

// resetar o canvas da vista quando fechar o modal (voltar tabela oculta)
$('#btnFecharVista')?.addEventListener('click', () => {
  $('#modalVista').style.display = 'none';
  const t = $('#tabelaOrcamento');
  if (t) t.style.display = 'none';
  $('#cvVista').style.display = '';
});

// ---------------- Exportação IFC (IFC4) ----------------
function exportarIFC() {
  let idRef = 100;
  const novoId = () => ++idRef;
  const L = [];
  const add = (s) => L.push(s);
  const escIFC = (s) => String(s).replace(/'/g, "''");
  const guidIFC = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_$';
    let s = '';
    for (let i = 0; i < 22; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  };
  const f = (v) => Number(v).toFixed(6);

  add('ISO-10303-21;');
  add('HEADER;');
  add("FILE_DESCRIPTION(('ViewDefinition [CoordinationView_V2.0]'),'2;1');");
  add(`FILE_NAME('${escIFC(projeto.nome)}.ifc','${new Date().toISOString()}',('BIM Studio MVP'),(''),'BIM Studio MVP','','');`);
  add("FILE_SCHEMA(('IFC4'));");
  add('ENDSEC;');
  add('DATA;');

  const idUnid = novoId(); add(`#${idUnid}=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);`);
  const idUnidA = novoId(); add(`#${idUnidA}=IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.);`);
  const idUnidV = novoId(); add(`#${idUnidV}=IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.);`);
  const idUnidS = novoId(); add(`#${idUnidS}=IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.);`);
  const idUom = novoId(); add(`#${idUom}=IFCUNITASSIGNMENT((#${idUnid},#${idUnidA},#${idUnidV},#${idUnidS}));`);
  const idCart = novoId(); add(`#${idCart}=IFCAXIS2PLACEMENT3D(#${xyz(0,0,0)},$,$);`);
  const idCtx = novoId(); add(`#${idCtx}=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#${idCart},#${idUom});`);
  const idSub = novoId(); add(`#${idSub}=IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,#${idCtx},$,$);`);
  add(`#1=IFCDIRECTION((0.,0.,1.));`);

  const idPessoa = novoId(); add(`#${idPessoa}=IFCPERSON($,'BIM Studio','MVP',$,$,$,$,$);`);
  const idOrg = novoId(); add(`#${idOrg}=IFCORGANIZATION($,'BIM Studio MVP',$,$,$);`);
  const idPessoasAp = novoId(); add(`#${idPessoasAp}=IFCPERSONANDORGANIZATION(#${idPessoa},#${idOrg},$);`);
  const idAp = novoId(); add(`#${idAp}=IFCAPPLICATION(#${idOrg},'1.0','BIM Studio MVP','BIMStudio');`);
  const idDono = novoId(); add(`#${idDono}=IFCOWNERHISTORY(#${idPessoasAp},#${idAp},$,.ADDED.,$,$,$,${Math.floor(Date.now()/1000)});`);

  const idProj = novoId();
  const idSite = novoId();
  const idBldg = novoId();
  const idPlaceSite = novoId(); add(`#${idPlaceSite}=IFCLOCALPLACEMENT($,#${xyz(0,0,0)});`);
  const idPlaceBldg = novoId(); add(`#${idPlaceBldg}=IFCLOCALPLACEMENT(#${idPlaceSite},#${xyz(0,0,0)});`);
  add(`#${idProj}=IFCPROJECT('${guidIFC()}',#${idDono},'${escIFC(projeto.nome)}','Projeto BIM Studio MVP',$,$,$,(#${idCtx}),$);`);
  add(`#${idSite}=IFCSITE('${guidIFC()}',#${idDono},'Terreno',$,$,$,#${idPlaceSite},$,$,.ELEMENT.,$,$,$,$);`);
  add(`#${idBldg}=IFCBUILDING('${guidIFC()}',#${idDono},'Edificacao',$,$,$,#${idPlaceBldg},$,$,.ELEMENT.,$,$,$,$);`);
  add(`#${novoId()}=IFCRELAGGREGATES('${guidIFC()}',#${idDono},$,$,#${idProj},(#${idSite}));`);
  add(`#${novoId()}=IFCRELAGGREGATES('${guidIFC()}',#${idDono},$,$,#${idSite},(#${idBldg}));`);


  // helpers geométricos
  function dir(x, y, z) { const id = novoId(); add(`#${id}=IFCDIRECTION((${f(x)},${f(y)},${f(z)}));`); return id; }
  function xyz(x, y, z) { const id = novoId(); add(`#${id}=IFCCARTESIANPOINT((${f(x)},${f(y)},${f(z)}));`); return id; }
  function place3D(x, y, z, ang, refDir) {
    const p = xyz(x, y, z);
    const ax = xyz(0, 0, 0);
    const zDir = dir(0, 0, 1);
    const d = refDir !== undefined ? refDir : dir(Math.cos(ang || 0), Math.sin(ang || 0), 0);
    const id = novoId(); add(`#${id}=IFCAXIS2PLACEMENT3D(#${p},$,$);`);
    return id;
  }
  function perfilPoligono(pontos) {
    // IFCPOLYLINE em coordenadas 2D no plano XY local
    const idPoly = novoId();
    const ptsIds = pontos.map(p => novoId());
    pontos.forEach((p, i) => add(`#${ptsIds[i]}=IFCCARTESIANPOINT((${f(p.x)},${f(-p.y)}));`));
    add(`#${idPoly}=IFCPOLYLINE((${ptsIds.map(i => '#' + i).join(',')},#${ptsIds[0]}));`);
    const idPerfil = novoId();
    add(`#${idPerfil}=IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,#${idPoly});`);
    return idPerfil;
  }
  function corpoExtrudado(idPerfil, dz, idPos) {
    const s = novoId();
    add(`#${s}=IFCEXTRUDEDAREASOLID(#${idPerfil},#${idPos},#1,${f(dz)});`);
    const sh = novoId();
    add(`#${sh}=IFCSHAPEREPRESENTATION(#${idSub},'Body','SweptSolid',(#${s}));`);
    const pds = novoId();
    add(`#${pds}=IFCPRODUCTDEFINITIONSHAPE($,$,(#${sh}));`);
    return pds;
  }


  const idsAndares = {};
  const idsPlaceAndar = {};
  for (const a of projeto.andares) {
    const id = novoId();
    idsAndares[a.id] = id;
    const idPlace = novoId();
    idsPlaceAndar[a.id] = idPlace;
    add(`#${idPlace}=IFCLOCALPLACEMENT(#${idPlaceBldg},#${xyz(0,0,0)});`);
    add(`#${id}=IFCBUILDINGSTOREY('${guidIFC()}',#${idDono},'${escIFC(a.nome)}',$,$,$,#${idPlace},$,$,.ELEMENT.,${f(a.alturaBase)});`);
    add(`#${novoId()}=IFCRELAGGREGATES('${guidIFC()}',#${idDono},$,$,#${idBldg},(#${id}));`);
  }


  for (const a of projeto.andares) {
    const z0 = a.alturaBase, h = a.alturaPisoPiso;
    const elems = projeto.elementos.filter(e => e.andar === a.id);

    for (const e of elems.filter(e => e.tipo === 'parede')) {
      const compr = Math.hypot(e.x2 - e.x1, e.y2 - e.y1);
      const ang = Math.atan2(e.y2 - e.y1, e.x2 - e.x1);
      const mx = (e.x1 + e.x2) / 2, my = (e.y1 + e.y2) / 2;
      // perfil retangular centrado na parede; local X ao longo da parede
      const idPerfil = novoId();
      const p1 = xyz(-compr / 2, -e.espessura / 2, 0);
      const p2 = xyz(compr / 2, -e.espessura / 2, 0);
      const p3 = xyz(compr / 2, e.espessura / 2, 0);
      const p4 = xyz(-compr / 2, e.espessura / 2, 0);
      const poly = novoId();
      add(`#${poly}=IFCPOLYLINE((#${p1},#${p2},#${p3},#${p4},#${p1}));`);
      add(`#${idPerfil}=IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,#${poly});`);
      const pos = novoId();
      const o = xyz(mx, -my, z0);
      const dRef = dir(Math.cos(ang), Math.sin(ang), 0);
      add(`#${pos}=IFCAXIS2PLACEMENT3D(#${o},#1,#${dRef});`);
      const pds = corpoExtrudado(idPerfil, h, pos);
      const idParede = novoId();
      add(`#${idParede}=IFCWALLSTANDARDCASE('${guidIFC()}',#${idDono},'Parede ${e.id}',$,$,#${idsPlaceAndar[a.id]},#${pds},$);`);
      // aberturas: IfcOpeningElement + IfcRelVoidsElement
      for (const ab of elems.filter(x => (x.tipo === 'porta' || x.tipo === 'janela') && x.paredeId === e.id)) {
        const zBase = ab.tipo === 'porta' ? z0 : z0 + ab.peitoril;
        const alt = ab.altura;
        const idPerfilAb = novoId();
        const q1 = xyz(ab.distancia - ab.largura / 2 - e.x1, -e.espessura / 2 - 0.1, 0);
        // coordenadas locais da parede: eixo local X ao longo da parede a partir do início
        const dist = ab.distancia;
        const lx1 = dist - ab.largura / 2, lx2 = dist + ab.largura / 2;
        const q1b = xyz(lx1, -e.espessura / 2 - 0.1, 0);
        const q2b = xyz(lx2, -e.espessura / 2 - 0.1, 0);
        const q3b = xyz(lx2, e.espessura / 2 + 0.1, 0);
        const q4b = xyz(lx1, e.espessura / 2 + 0.1, 0);
        const polyAb = novoId();
        add(`#${polyAb}=IFCPOLYLINE((#${q1b},#${q2b},#${q3b},#${q4b},#${q1b}));`);
        add(`#${idPerfilAb}=IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,#${polyAb});`);
        const posAb = novoId();
        const oAb = xyz(e.x1, -e.y1, zBase);
        add(`#${posAb}=IFCAXIS2PLACEMENT3D(#${oAb},#1,#${dRef});`);
        const pdsAb = corpoExtrudado(idPerfilAb, alt, posAb);
        const idAbertura = novoId();
        add(`#${idAbertura}=IFCOPENINGELEMENT('${guidIFC()}',#${idDono},'Abertura ${ab.id}',$,#${idsPlaceAndar[a.id]},#${pdsAb},$);`);
        add(`#${novoId()}=IFCRELVOIDSELEMENT('${guidIFC()}',#${idDono},$,$,#${idParede},#${idAbertura});`);
        // preenchimento (porta/janela) via IfcRelFillsElement
        const idElem = novoId();
        const classe = ab.tipo === 'porta' ? 'IFCDOOR' : 'IFCWINDOW';
        const perfilP = novoId();
        const r1 = xyz(lx1, -e.espessura / 2, 0), r2 = xyz(lx2, -e.espessura / 2, 0),
              r3 = xyz(lx2, e.espessura / 2, 0), r4 = xyz(lx1, e.espessura / 2, 0);
        const polyP = novoId();
        add(`#${polyP}=IFCPOLYLINE((#${r1},#${r2},#${r3},#${r4},#${r1}));`);
        add(`#${perfilP}=IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,#${polyP});`);
        const pdsP = corpoExtrudado(perfilP, alt, posAb);
        add(`#${idElem}=${classe}('${guidIFC()}',#${idDono},'${ab.tipo === 'porta' ? 'Porta' : 'Janela'} ${ab.id}',$,$,#${idsPlaceAndar[a.id]},#${pdsP},$);`);
        add(`#${novoId()}=IFCRELFILLSELEMENT('${guidIFC()}',#${idDono},$,$,#${idAbertura},#${idElem});`);
      }
    }

    for (const e of elems.filter(e => e.tipo === 'laje' && e.fechado)) {
      const idPerfil = perfilPoligono(e.pontos);
      const pos = novoId();
      const o = xyz(0, 0, z0 + h);
      add(`#${pos}=IFCAXIS2PLACEMENT3D(#${o},$,$);`);
      const pds = corpoExtrudado(idPerfil, e.espessura || 0.2, pos);
      add(`#${novoId()}=IFCSLAB('${guidIFC()}',#${idDono},'Laje ${e.id}',$,$,#${idsPlaceAndar[a.id]},#${pds},$);`);
    }

    for (const e of elems.filter(e => e.tipo === 'coluna')) {
      const idPerfil = novoId();
      const c1 = xyz(e.x - e.largura / 2, -(e.y - e.altura2 / 2), 0),
            c2 = xyz(e.x + e.largura / 2, -(e.y - e.altura2 / 2), 0),
            c3 = xyz(e.x + e.largura / 2, -(e.y + e.altura2 / 2), 0),
            c4 = xyz(e.x - e.largura / 2, -(e.y + e.altura2 / 2), 0);
      const poly = novoId();
      add(`#${poly}=IFCPOLYLINE((#${c1},#${c2},#${c3},#${c4},#${c1}));`);
      add(`#${idPerfil}=IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,#${poly});`);
      const pos = novoId();
      const o = xyz(0, 0, z0);
      add(`#${pos}=IFCAXIS2PLACEMENT3D(#${o},$,$);`);
      const pds = corpoExtrudado(idPerfil, h, pos);
      add(`#${novoId()}=IFCCOLUMN('${guidIFC()}',#${idDono},'Coluna ${e.id}',$,$,#${idsPlaceAndar[a.id]},#${pds},$);`);
    }

    for (const e of elems.filter(e => e.tipo === 'escada')) {
      // escada como série de caixas (IFCSTAIR de geometria composta é complexo; exportamos cada degrau como SLAB fino)
      const nDeg = Math.max(2, Math.round(e.degraus));
      const altDeg = h / nDeg, compDeg = e.comprimento / nDeg;
      const ang = e.angulo;
      for (let i = 0; i < nDeg; i++) {
        const dist = -e.comprimento / 2 + compDeg * (i + 0.5);
        const cx = e.x + Math.cos(ang) * dist, cy = e.y + Math.sin(ang) * dist;
        const idPerfil = novoId();
        const hw = compDeg / 2, hd = e.largura / 2;
        const s1 = xyz(cx - hw * Math.cos(ang) + hd * Math.sin(ang), -cy + hw * Math.sin(ang) + hd * Math.cos(ang), 0);
        const s2 = xyz(cx + hw * Math.cos(ang) + hd * Math.sin(ang), -cy - hw * Math.sin(ang) + hd * Math.cos(ang), 0);
        const s3 = xyz(cx + hw * Math.cos(ang) - hd * Math.sin(ang), -cy - hw * Math.sin(ang) - hd * Math.cos(ang), 0);
        const s4 = xyz(cx - hw * Math.cos(ang) - hd * Math.sin(ang), -cy + hw * Math.sin(ang) - hd * Math.cos(ang), 0);
        const poly = novoId();
        add(`#${poly}=IFCPOLYLINE((#${s1},#${s2},#${s3},#${s4},#${s1}));`);
        add(`#${idPerfil}=IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,#${poly});`);
        const pos = novoId();
        const o = xyz(0, 0, z0);
        add(`#${pos}=IFCAXIS2PLACEMENT3D(#${o},$,$);`);
        const pds = corpoExtrudado(idPerfil, altDeg * (i + 1), pos);
        add(`#${novoId()}=IFCSLAB('${guidIFC()}',#${idDono},'Escada ${e.id} degrau ${i + 1}',$,$,#${idsPlaceAndar[a.id]},#${pds},$,.LANDING.);`);
      }
    }

    for (const e of elems.filter(e => e.tipo === 'pontoEletrico' || e.tipo === 'pontoHidraulico')) {
      const def = PONTOS_INSTALACOES[e.ponto] || Object.values(PONTOS_INSTALACOES)[0];
      const classe = e.tipo === 'pontoEletrico' ? 'IFCELECTRICAPPLIANCE' : 'IFCSANITARYTERMINAL';
      const idPerfil = novoId();
      const hw = 0.12, hp = 0.12;
      const v1 = xyz(e.x - hw, -(e.y - hp), 0), v2 = xyz(e.x + hw, -(e.y - hp), 0),
            v3 = xyz(e.x + hw, -(e.y + hp), 0), v4 = xyz(e.x - hw, -(e.y + hp), 0);
      const poly = novoId();
      add(`#${poly}=IFCPOLYLINE((#${v1},#${v2},#${v3},#${v4},#${v1}));`);
      add(`#${idPerfil}=IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,#${poly});`);
      const pos = novoId();
      add(`#${pos}=IFCAXIS2PLACEMENT3D(#${xyz(0,0,0)},$,$);`);
      const pds = corpoExtrudado(idPerfil, 0.05, pos);
      add(`#${novoId()}=${classe}('${guidIFC()}',#${idDono},'${escIFC(def.nome)} ${e.id}',$,$,#${idsPlaceAndar[a.id]},#${pds},$);`);
    }

    for (const e of elems.filter(e => e.tipo === 'objeto')) {
      const def = dimsObjeto(e);
      const idPerfil = novoId();
      const hw = def.larg / 2, hp = def.prof / 2, ang = e.angulo || 0;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const v1 = xyz(e.x - hw * ca + hp * sa, -(e.y - hw * sa - hp * ca), 0);
      const v2 = xyz(e.x + hw * ca + hp * sa, -(e.y + hw * sa - hp * ca), 0);
      const v3 = xyz(e.x + hw * ca - hp * sa, -(e.y + hw * sa + hp * ca), 0);
      const v4 = xyz(e.x - hw * ca - hp * sa, -(e.y - hw * sa + hp * ca), 0);
      const poly = novoId();
      add(`#${poly}=IFCPOLYLINE((#${v1},#${v2},#${v3},#${v4},#${v1}));`);
      add(`#${idPerfil}=IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,#${poly});`);
      const pos = novoId();
      add(`#${pos}=IFCAXIS2PLACEMENT3D(#${xyz(0,0,0)},$,$);`);
      const pds = corpoExtrudado(idPerfil, def.alt, pos);
      add(`#${novoId()}=IFCFURNITURE('${guidIFC()}',#${idDono},'${escIFC(def.nome)} ${e.id}',$,$,#${idsPlaceAndar[a.id]},#${pds},$);`);
    }

    for (const e of elems.filter(e => e.tipo === 'telhado' && e.fechado && e.pontos.length >= 3)) {
      // telhado: exportamos a base (beiral) como ROOFPLANE simples via slab na cota do topo do pavimento
      const idPerfil = perfilPoligono(e.pontos);
      const pos = novoId();
      const o = xyz(0, 0, z0 + h);
      add(`#${pos}=IFCAXIS2PLACEMENT3D(#${o},$,$);`);
      const pds = corpoExtrudado(idPerfil, e.espessura || 0.15, pos);
      add(`#${novoId()}=IFCROOF('${guidIFC()}',#${idDono},'Telhado ${e.id}',$,$,#${idsPlaceAndar[a.id]},#${pds},$,.FLAT_ROOF.);`);
    }
  }

  add('ENDSEC;');
  add('END-ISO-10303-21;');
  const texto = L.join('\n');
  const blob = new Blob([texto], { type: 'application/ifc' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = projeto.nome.replace(/\s+/g, '_') + '.ifc';
  link.click();
}

// ---------------- Início ----------------
const salvo = localStorage.getItem('bim-mvp');
if (salvo) {
  try { projeto = JSON.parse(salvo); } catch { /* usa novo */ }
  uid = projeto.elementos.reduce((m, e) => Math.max(m, e.id), 0) + 1;
} else {
  // projeto-exemplo: um cômodo com porta e janela
  const a = projeto.idAndarAtivo;
  projeto.elementos.push(
    { id: ++uid, tipo: 'parede', andar: a, x1: 0, y1: 0, x2: 6, y2: 0, espessura: 0.15, cor: '#e8e4dc' },
    { id: ++uid, tipo: 'parede', andar: a, x1: 6, y1: 0, x2: 6, y2: 4, espessura: 0.15, cor: '#e8e4dc' },
    { id: ++uid, tipo: 'parede', andar: a, x1: 6, y1: 4, x2: 0, y2: 4, espessura: 0.15, cor: '#e8e4dc' },
    { id: ++uid, tipo: 'parede', andar: a, x1: 0, y1: 4, x2: 0, y2: 0, espessura: 0.15, cor: '#e8e4dc' },
    { id: ++uid, tipo: 'porta', andar: a, paredeId: 1, distancia: 1, largura: 0.9, altura: 2.1, peitoril: 0 },
    { id: ++uid, tipo: 'janela', andar: a, paredeId: 3, distancia: 3, largura: 1.5, altura: 1.2, peitoril: 1 }
  );
}
salvarEstado();
redimensionar();
atualizarCamera3d();
sincronizar();
animar();
