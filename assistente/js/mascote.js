/* Lumi — mascote em SVG: uma gotinha redonda com topete luminoso.
   13 humores, 5 estilos de olho, 12 acessórios e paletas de corpo/olhos. */
(function (raiz) {
  'use strict';

  const HUMORES = {
    idle: 'Repouso', listen: 'Ouvindo', think: 'Pensando', talk: 'Falando', happy: 'Feliz', laugh: 'Rindo',
    love: 'Carinho', cool: 'Descolado', surprised: 'Surpreso', angry: 'Bravo', cry: 'Chorando', sleep: 'Dormindo', success: 'Conseguiu!',
  };
  const OLHOS = { redondo: 'Redondos', oval: 'Ovais', pixel: 'Pixel', grande: 'Grandões', traco: 'Tracinho' };
  const ACESSORIOS = {
    nenhum: 'Nenhum', festa: 'Chapéu de festa', coroa: 'Coroa', fones: 'Fones', laco: 'Laço', gorro: 'Gorro',
    natal: 'Gorro de Natal', bone: 'Boné', oculos: 'Óculos', aureola: 'Auréola', chifres: 'Chifrinhos', flor: 'Florzinha', cartola: 'Cartola',
    tiara: 'Tiara', coroaflores: 'Coroa de flores', brincos: 'Brincos', presilha: 'Presilha de coração', lacao: 'Lação',
  };
  const CORPOS = [
    ['Nuvem', '#F5F8FF', '#C7D3F7'], ['Água', '#E6FFFA', '#8FE8D6'], ['Coral', '#FFF0EA', '#FFB59A'], ['Lavanda', '#F4EEFF', '#C9B5FF'],
    ['Limão', '#FAFFE4', '#D8EA86'], ['Céu', '#EAF6FF', '#93CCFF'], ['Algodão-doce', '#FFEFF7', '#FFB0D3'], ['Noite', '#5E6580', '#30354A'], ['Mel', '#FFF7DB', '#F0C24E'],
    ['Rosé', '#FFF0F4', '#F4B3C6'], ['Lilás', '#F8F0FF', '#D7B6F4'], ['Framboesa', '#FFE9F1', '#EE7AA6'],
  ];
  const CORES_OLHO = [
    ['Tinta', '#1B1E2B'], ['Oceano', '#1F5AA6'], ['Floresta', '#1E7A4F'], ['Uva', '#5B3A9E'], ['Cacau', '#6B3F2A'], ['Rubi', '#B3264A'], ['Neon', '#46E3C8'], ['Rosa', '#D63A7F'], ['Violeta', '#7B3FC4'],
  ];
  const CABELOS = {
    nenhum: 'Sem cabelo', franja: 'Franjinha', lateral: 'Franja de lado', longo: 'Longo', chanel: 'Chanel',
    rabo: 'Rabo de cavalo', chiquinhas: 'Maria-chiquinha', coque: 'Coque', cacheado: 'Cacheado',
  };
  const CORES_CABELO = [
    ['Castanho', '#7A4A2E'], ['Preto', '#2B2633'], ['Loiro', '#E9C46A'], ['Ruivo', '#D9693A'],
    ['Rosa', '#F28DB9'], ['Lilás', '#B79AF0'], ['Azul', '#6FA8F5'], ['Branco', '#ECECF2'],
  ];
  const CHAPEUS = ['festa', 'coroa', 'gorro', 'natal', 'bone', 'cartola', 'aureola', 'lacao'];

  const L = 18.5, R = 29.5, Y = 24.5;

  function olhos(humor, estilo, c) {
    const brilho = (x, y, r = 0.9) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity=".9"/>`;
    const forma = (x) => {
      if (estilo === 'pixel') return `<rect x="${x - 2.3}" y="${Y - 2.7}" width="4.6" height="5.4" rx=".5" fill="${c}"/>`;
      if (estilo === 'oval') return `<ellipse cx="${x}" cy="${Y}" rx="2.2" ry="3.3" fill="${c}"/>${brilho(x - 0.8, Y - 1.4, 0.7)}`;
      if (estilo === 'grande') return `<circle cx="${x}" cy="${Y}" r="3.9" fill="${c}"/>${brilho(x - 1.3, Y - 1.5, 1.2)}${brilho(x + 1.2, Y + 1.3, 0.5)}`;
      if (estilo === 'traco') return `<rect x="${x - 2.8}" y="${Y - 0.85}" width="5.6" height="1.7" rx=".85" fill="${c}"/>`;
      return `<circle cx="${x}" cy="${Y}" r="2.9" fill="${c}"/>${brilho(x - 1, Y - 1.1)}`;
    };
    const arcoCima = (x) => `<path d="M${x - 2.8} ${Y + 1} Q${x} ${Y - 2.8} ${x + 2.8} ${Y + 1}" stroke="${c}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`;
    const arcoBaixo = (x) => `<path d="M${x - 2.8} ${Y - 0.6} Q${x} ${Y + 2.4} ${x + 2.8} ${Y - 0.6}" stroke="${c}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`;
    const coracao = (x) => `<path d="M${x} ${Y + 2.8} l-3 -3 a1.8 1.8 0 0 1 3 -2.3 a1.8 1.8 0 0 1 3 2.3z" fill="#FF4F86"/>`;
    const estrela = (x) => `<path d="M${x} ${Y - 3.4} l1 2.2 2.4.3-1.8 1.7.5 2.4-2.1-1.2-2.1 1.2.5-2.4-1.8-1.7 2.4-.3z" fill="#FFC93C"/>`;
    switch (humor) {
      case 'happy': case 'laugh': return arcoCima(L) + arcoCima(R);
      case 'love': return coracao(L) + coracao(R);
      case 'success': return estrela(L) + estrela(R);
      case 'sleep': case 'cry': return arcoBaixo(L) + arcoBaixo(R);
      case 'cool': return `<path d="M12 21.5 h24 v2.4 q0 3.6 -4.6 3.6 h-2.6 q-3.2 0 -3.8 -3 h-2 q-.6 3 -3.8 3 h-2.6 q-4.6 0 -4.6 -3.6z" fill="#11131C"/><rect x="14" y="22.4" width="5" height="1.3" rx=".6" fill="#fff" opacity=".4"/>`;
      case 'surprised': return `<circle cx="${L}" cy="${Y}" r="3.5" fill="#fff" stroke="${c}" stroke-width="1.5"/><circle cx="${L}" cy="${Y}" r="1.3" fill="${c}"/><circle cx="${R}" cy="${Y}" r="3.5" fill="#fff" stroke="${c}" stroke-width="1.5"/><circle cx="${R}" cy="${Y}" r="1.3" fill="${c}"/>`;
      case 'angry': return forma(L) + forma(R) + `<path d="M14.5 19.6 L21.5 21.4" stroke="${c}" stroke-width="1.6" stroke-linecap="round"/><path d="M33.5 19.6 L26.5 21.4" stroke="${c}" stroke-width="1.6" stroke-linecap="round"/>`;
      case 'think': return `<g transform="translate(1 -1.4)">${forma(L)}${forma(R)}</g>`;
      default: return forma(L) + forma(R);
    }
  }

  // cílios no canto de fora de cada olho (só quando o olho aparece aberto ou fechadinho)
  function cilios(humor, estilo, c) {
    const fechado = { happy: 1, laugh: 1, sleep: -0.6, cry: -0.6 };
    if (['cool', 'love', 'success'].includes(humor) || estilo === 'traco' && !(humor in fechado)) return '';
    const raio = estilo === 'grande' ? 3.9 : estilo === 'oval' ? 2.4 : estilo === 'pixel' ? 2.5 : humor === 'surprised' ? 3.6 : 2.9;
    const dy = humor in fechado ? fechado[humor] : (estilo === 'oval' ? -2.6 : -raio * 0.62);
    const dx = humor in fechado ? 2.8 : raio * 0.8;
    const um = (x, lado) => {
      const bx = x + lado * dx, by = Y + dy;
      return [[1.9, -1.2], [1.3, -2.1], [0.4, -2.4]].map(([ax, ay], i) =>
        `<path d="M${(bx - lado * i * 0.55).toFixed(2)} ${(by - i * 0.25).toFixed(2)} l${(lado * ax).toFixed(2)} ${ay}" stroke="${c}" stroke-width=".85" stroke-linecap="round"/>`).join('');
    };
    return `<g class="lm-cilios">${um(L, -1)}${um(R, 1)}</g>`;
  }

  function boca(humor, c) {
    const s = `stroke="${c}" stroke-width="1.4" fill="none" stroke-linecap="round"`;
    switch (humor) {
      case 'talk': return `<ellipse class="lm-boca" cx="24" cy="31.2" rx="1.9" ry="1.1" fill="${c}"/>`;
      case 'laugh': case 'success': return `<path d="M20.6 30.2 Q24 35.2 27.4 30.2z" fill="${c}"/><path d="M22 32.4 Q24 33.8 26 32.4" fill="#FF7FA6"/>`;
      case 'happy': case 'love': return `<path d="M21 30.4 Q24 33.6 27 30.4" ${s}/>`;
      case 'surprised': case 'listen': return `<ellipse cx="24" cy="31.3" rx="${humor === 'listen' ? 1.1 : 1.6}" ry="${humor === 'listen' ? 1.1 : 2}" fill="${c}"/>`;
      case 'cry': return `<path d="M21.4 32.4 Q24 29.8 26.6 32.4" ${s}/>`;
      case 'angry': return `<path d="M21.6 31.6 h4.8" ${s}/>`;
      case 'sleep': return `<circle cx="24" cy="31.4" r=".9" fill="${c}"/>`;
      case 'cool': return `<path d="M22 31.2 Q24.6 32.8 26.8 30.4" ${s}/>`;
      case 'think': return `<path d="M21.6 31.6 q1.2 -1 2.4 0 t2.4 0" ${s}/>`;
      default: return `<path d="M22 30.8 Q24 32.4 26 30.8" ${s}/>`;
    }
  }

  function acessorio(a, c) {
    switch (a) {
      case 'festa': return '<path d="M18.5 12 L24 -4 L29.5 12z" fill="#FF5AA0"/><path d="M20.3 7 h7.4 M22 2.4 h4" stroke="#FFD25A" stroke-width="1.3"/><circle cx="24" cy="-4.6" r="1.9" fill="#FFD25A"/>';
      case 'coroa': return '<path d="M14.5 12 L15.5 3 L19.8 7.6 L24 1 L28.2 7.6 L32.5 3 L33.5 12z" fill="#F2C94C" stroke="#C99A1B" stroke-width=".7"/><circle cx="24" cy="7.6" r="1.3" fill="#FF4F6E"/><circle cx="18.5" cy="9.6" r=".8" fill="#5AB8FF"/><circle cx="29.5" cy="9.6" r=".8" fill="#5AB8FF"/>';
      case 'fones': return '<path d="M7.5 25 Q7.5 7 24 7 Q40.5 7 40.5 25" stroke="#2B2E3B" stroke-width="2.6" fill="none"/><rect x="3.4" y="21" width="5.6" height="10" rx="2.6" fill="#46E3C8"/><rect x="39" y="21" width="5.6" height="10" rx="2.6" fill="#46E3C8"/>';
      case 'laco': return '<path d="M33 12.5 l-5.4 -4 v8z M33 12.5 l5.4 -4 v8z" fill="#FF5AA0"/><circle cx="33" cy="12.5" r="1.7" fill="#D93A7E"/>';
      case 'gorro': return '<path d="M9.5 16 Q9.5 2.5 24 2.5 Q38.5 2.5 38.5 16z" fill="#5A7CFF"/><path d="M14 6 v9 M19 4 v11 M24 3.4 v11.6 M29 4 v11 M34 6 v9" stroke="#4A68E0" stroke-width=".9"/><rect x="8.5" y="13" width="31" height="4" rx="2" fill="#3F5BD9"/><circle cx="24" cy="1.6" r="2.6" fill="#fff"/>';
      case 'natal': return '<path d="M10.5 14 Q12 1 25 2 Q33 3 37 9.5 L38.5 14z" fill="#E53935"/><rect x="9" y="12" width="30" height="4.2" rx="2.1" fill="#fff"/><circle cx="38.5" cy="9" r="2.4" fill="#fff"/>';
      case 'bone': return '<path d="M10.5 15 Q10.5 3 24 3 Q36 3 37 15z" fill="#FF8A3D"/><path d="M24 14 L45 15 L43 17.4 L24 16.4z" fill="#D9661E"/><circle cx="24" cy="3.4" r="1.2" fill="#D9661E"/>';
      case 'oculos': return `<circle cx="${L}" cy="${Y}" r="4.9" fill="rgba(255,255,255,.12)" stroke="#2B2E3B" stroke-width="1.4"/><circle cx="${R}" cy="${Y}" r="4.9" fill="rgba(255,255,255,.12)" stroke="#2B2E3B" stroke-width="1.4"/><path d="M23.4 24 h1.2" stroke="#2B2E3B" stroke-width="1.4"/>`;
      case 'aureola': return '<ellipse class="lm-flutua" cx="24" cy="2" rx="9" ry="2.5" fill="none" stroke="#FFD25A" stroke-width="1.9"/>';
      case 'chifres': return '<path d="M13 13.5 L10.6 4 L18 10.6z" fill="#FF4F4F"/><path d="M35 13.5 L37.4 4 L30 10.6z" fill="#FF4F4F"/>';
      case 'flor': return '<g transform="translate(34 11.5)"><circle r="2.3" cx="0" cy="-2.7" fill="#FF9EC8"/><circle r="2.3" cx="2.6" cy="-.6" fill="#FF9EC8"/><circle r="2.3" cx="1.6" cy="2.4" fill="#FF9EC8"/><circle r="2.3" cx="-1.6" cy="2.4" fill="#FF9EC8"/><circle r="2.3" cx="-2.6" cy="-.6" fill="#FF9EC8"/><circle r="1.6" fill="#FFD25A"/></g>';
      case 'tiara': return '<path d="M13 13.4 Q24 6.6 35 13.4" stroke="#F2C94C" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M20.6 10.4 L22.2 6.4 L24 9 L25.8 6.4 L27.4 10.4z" fill="#F2C94C" stroke="#C99A1B" stroke-width=".5"/><circle cx="24" cy="9.3" r="1.25" fill="#FF6FA8"/><circle cx="16.4" cy="11.4" r=".75" fill="#B9E5FF"/><circle cx="31.6" cy="11.4" r=".75" fill="#B9E5FF"/>';
      case 'coroaflores': {
        const f = (x, y, cor, r = 1.9) => `<g transform="translate(${x} ${y})">${[0, 72, 144, 216, 288].map((a) => `<circle r="${r * 0.62}" cx="${(Math.cos(a * Math.PI / 180) * r * 0.7).toFixed(2)}" cy="${(Math.sin(a * Math.PI / 180) * r * 0.7).toFixed(2)}" fill="${cor}"/>`).join('')}<circle r="${r * 0.42}" fill="#FFD25A"/></g>`;
        return '<path d="M11.5 15 Q24 6.5 36.5 15" stroke="#5DBB63" stroke-width="1.3" fill="none"/><ellipse cx="15.6" cy="12.6" rx="1.6" ry=".8" transform="rotate(-30 15.6 12.6)" fill="#5DBB63"/><ellipse cx="32.4" cy="12.6" rx="1.6" ry=".8" transform="rotate(30 32.4 12.6)" fill="#5DBB63"/>'
          + f(13, 14.2, '#FF9EC8') + f(18, 10.6, '#FFFFFF') + f(24, 9.4, '#FF6FA8', 2.2) + f(30, 10.6, '#C9B5FF') + f(35, 14.2, '#FF9EC8');
      }
      case 'brincos': return '<circle cx="6.4" cy="32.2" r=".7" fill="#F2C94C"/><path d="M6.4 32.8 q-1.5 2.2 0 3.6 q1.5 -1.4 0 -3.6z" fill="#FF6FA8"/><circle cx="41.6" cy="32.2" r=".7" fill="#F2C94C"/><path d="M41.6 32.8 q-1.5 2.2 0 3.6 q1.5 -1.4 0 -3.6z" fill="#FF6FA8"/>';
      case 'presilha': return '<g transform="translate(33.5 13) rotate(18)"><path d="M0 2.6 l-3 -3 a1.8 1.8 0 0 1 3 -2.3 a1.8 1.8 0 0 1 3 2.3z" fill="#FF4F86"/><circle cx="-1.2" cy="-1.4" r=".55" fill="#fff" opacity=".7"/></g>';
      case 'lacao': return '<g transform="translate(24 8.2)"><path d="M0 0 l-8 -5 q-2 3.5 0 9z M0 0 l8 -5 q2 3.5 0 9z" fill="#FF5AA0"/><path d="M0 0 l-8 -5 q-1 2 -.6 3.6z M0 0 l8 -5 q1 2 .6 3.6z" fill="#FF8CC0"/><path d="M-1.4 1 l-2.6 5 M1.4 1 l2.6 5" stroke="#E0457B" stroke-width="1.4" stroke-linecap="round"/><circle r="2" fill="#D93A7E"/></g>';
      case 'cartola': return '<rect x="15" y="-3" width="18" height="15" rx="1.5" fill="#1D1F2A"/><rect x="15" y="7" width="18" height="2.6" fill="#B3264A"/><rect x="11" y="11" width="26" height="2.8" rx="1.4" fill="#1D1F2A"/>';
      default: return '';
    }
  }

  // escurece uma cor (#rrggbb) para mechas e contornos
  function escurecer(hex, f = 0.72) {
    const n = parseInt(String(hex).slice(1), 16);
    const c = (v) => Math.max(0, Math.min(255, Math.round(v * f))).toString(16).padStart(2, '0');
    return '#' + c(n >> 16) + c((n >> 8) & 255) + c(n & 255);
  }
  /** Cabelo em duas camadas: "tras" (atrás da cabeça) e "frente" (por cima da testa, abaixo dos olhos). */
  function cabelo(estilo, cor) {
    if (!estilo || estilo === 'nenhum' || !CABELOS[estilo]) return { tras: '', frente: '' };
    const esc = escurecer(cor), laco = '#FF5AA0';
    const brilho = '<path d="M14.5 12.2 q4.6 -2.8 9.4 -2.6" stroke="#fff" stroke-width="1.1" fill="none" stroke-linecap="round" opacity=".35"/>';
    const capa = {
      ondas: `<path d="M7.2 22 C6.6 14 13 8.6 24 8.6 C35 8.6 41.4 14 40.8 22 C39.6 18.6 37.6 16.6 35 16.4 C33 18.2 30 18.2 28.6 16 C27 18.4 21 18.4 19.4 16 C18 18.2 15 18.2 13 16.4 C10.4 16.6 8.4 18.6 7.2 22z" fill="${cor}"/>`,
      reta: `<path d="M7.2 22 C6.6 14 13 8.6 24 8.6 C35 8.6 41.4 14 40.8 22 C40 19.5 38.8 18 37 17.6 L11 17.6 C9.2 18 8 19.5 7.2 22z" fill="${cor}"/><path d="M16 17.4 v-2.2 M21 17.4 v-2.6 M27 17.4 v-2.6 M32 17.4 v-2.2" stroke="${esc}" stroke-width=".7" stroke-linecap="round"/>`,
      lado: `<path d="M7.2 22 C6.6 14 13 8.6 24 8.6 C35 8.6 41.4 14 40.8 22 C40.2 17.5 38 15 34.5 14.6 C27 14.4 17 17 10.5 21 C9 21.6 8 21.8 7.2 22z" fill="${cor}"/><path d="M33 13.4 C26 13.6 19 15.6 13.6 18.6" stroke="${esc}" stroke-width=".7" fill="none" stroke-linecap="round"/>`,
    };
    const lacinho = (x, y) => `<circle cx="${x}" cy="${y}" r="1.6" fill="${laco}"/>`;
    let tras = '', frente = '';
    switch (estilo) {
      case 'franja': frente = capa.reta; break;
      case 'lateral': frente = capa.lado; break;
      case 'longo':
        tras = `<path d="M9.5 14 C3 19 2.5 31 4.5 38 C5.6 41.5 9.6 42 12.4 40 C10 35.5 9.4 29 10.6 22z M38.5 14 C45 19 45.5 31 43.5 38 C42.4 41.5 38.4 42 35.6 40 C38 35.5 38.6 29 37.4 22z" fill="${cor}"/><path d="M6.6 24 C5.6 30 6 35 7.6 38.6 M41.4 24 C42.4 30 42 35 40.4 38.6" stroke="${esc}" stroke-width=".7" fill="none" stroke-linecap="round"/>`;
        frente = capa.ondas; break;
      case 'chanel':
        tras = `<path d="M9 14 C4 18 3.6 27 5.4 32.6 C6.6 35.4 9.8 35.6 11.6 33.6 C10.6 29 10.6 24 11.4 20z M39 14 C44 18 44.4 27 42.6 32.6 C41.4 35.4 38.2 35.6 36.4 33.6 C37.4 29 37.4 24 36.6 20z" fill="${cor}"/>`;
        frente = capa.reta; break;
      case 'rabo':
        tras = `<path d="M35 10.5 C44 8 49 13 47.6 22 C46.8 28 44 31.5 41 33 C43 27.5 43.2 21 39.6 15.6z" fill="${cor}"/><path d="M42 13 C45.6 16 45.8 23 43.4 29" stroke="${esc}" stroke-width=".7" fill="none" stroke-linecap="round"/>${lacinho(37, 11.6)}`;
        frente = capa.lado; break;
      case 'chiquinhas':
        tras = `<path d="M10.5 13 C3.6 11 -0.8 16 0.4 23 C1.2 28 3.6 31 6.2 32 C5 27.5 5.6 21.5 9.4 17.6z M37.5 13 C44.4 11 48.8 16 47.6 23 C46.8 28 44.4 31 41.8 32 C43 27.5 42.4 21.5 38.6 17.6z" fill="${cor}"/>${lacinho(9.4, 14.4)}${lacinho(38.6, 14.4)}`;
        frente = capa.ondas; break;
      case 'coque':
        tras = `<circle cx="24" cy="5.4" r="5.2" fill="${cor}"/><path d="M20.8 4.6 q3.2 -3 6.4 0 M21.6 7 q2.4 1.6 4.8 0" stroke="${esc}" stroke-width=".7" fill="none" stroke-linecap="round"/><ellipse cx="24" cy="9.6" rx="3.4" ry="1.1" fill="${laco}"/>`;
        frente = capa.ondas; break;
      case 'cacheado': {
        const bolas = (pts, r) => pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${cor}"/><path d="M${x - r * 0.45} ${y} a${r * 0.45} ${r * 0.45} 0 0 1 ${r * 0.9} 0" stroke="${esc}" stroke-width=".6" fill="none"/>`).join('');
        tras = bolas([[5.8, 21], [4.6, 27], [5.6, 33], [42.2, 21], [43.4, 27], [42.4, 33]], 3.3);
        const arco = []; for (let i = 0; i <= 8; i++) { const x = 8.4 + i * 3.9, dx = (x - 24) / 18.4; arco.push([+x.toFixed(1), +(25 - 16.4 * Math.sqrt(Math.max(0, 1 - dx * dx))).toFixed(1)]); }
        frente = bolas(arco, 3.2); break;
      }
      default: break;
    }
    return { tras, frente: frente + (estilo === 'cacheado' ? '' : brilho) };
  }

  let seq = 0;
  // o = { corpo, corpo2, olho, estiloOlho, acessorio, humor, tamanho, piscar }
  function svg(o = {}) {
    const k = { corpo: '#F5F8FF', corpo2: '#C7D3F7', olho: '#1B1E2B', estiloOlho: 'redondo', acessorio: 'nenhum', piscar: true, cilios: false, blush: false, batom: false, cabelo: 'nenhum', corCabelo: '#7A4A2E', ...o };
    const cab = cabelo(k.cabelo, k.corCabelo);
    const tamanho = k.tamanho || 40;
    const humor = HUMORES[k.humor] ? k.humor : 'idle';
    const id = 'lm' + (++seq).toString(36);
    const corTopete = humor === 'listen' ? '#FF5A6E' : humor === 'think' ? '#FFD25A' : humor === 'talk' ? '#5AB8FF' : humor === 'sleep' ? '#8E9AC8' : '#46E3C8';
    const topete = CHAPEUS.includes(k.acessorio) ? ''
      : `<path d="M24 12 C21.6 8.6 22.4 5 25.8 3.2 C26.6 6.4 26.2 9.4 24 12z" fill="${corTopete}" class="lm-topete${humor === 'listen' || humor === 'think' ? ' lm-pulsa' : ''}"/><circle cx="25.6" cy="4.2" r="3.4" fill="${corTopete}" opacity=".22"/>`;
    const ondas = humor === 'listen' ? '<path class="lm-onda" d="M45 20 q2.4 4.5 0 9" stroke="#FF5A6E" stroke-width="1.3" fill="none" stroke-linecap="round"/><path class="lm-onda lm-o2" d="M47.6 17.6 q3.6 7 0 14" stroke="#FF5A6E" stroke-width="1.1" fill="none" stroke-linecap="round" opacity=".7"/>' : '';
    const zz = humor === 'sleep' ? '<text x="38" y="9" font-size="7" font-weight="800" fill="#9BB0FF" class="lm-zz" font-family="system-ui,sans-serif">z</text>' : '';
    const lagrimas = humor === 'cry' ? '<path class="lm-lagrima" d="M15.6 27.4 q-1.1 2.6 0 3.8 q1.1 -1.2 0 -3.8z" fill="#5AB8FF"/><path class="lm-lagrima" d="M32.4 27.4 q-1.1 2.6 0 3.8 q1.1 -1.2 0 -3.8z" fill="#5AB8FF"/>' : '';
    const pensamento = humor === 'think' ? '<circle cx="40" cy="12" r="1.1" fill="#FFD25A" opacity=".8"/><circle cx="43.4" cy="8" r="1.6" fill="#FFD25A" opacity=".6"/>' : '';
    const bochechas = k.blush || ['love', 'happy', 'laugh', 'success'].includes(humor) ? '<ellipse cx="12.8" cy="29.6" rx="2.3" ry="1.3" fill="#FF8FB1" opacity=".6"/><ellipse cx="35.2" cy="29.6" rx="2.3" ry="1.3" fill="#FF8FB1" opacity=".6"/>' : '';
    const pisca = k.piscar && ['idle', 'listen', 'talk', 'think', 'angry'].includes(humor) ? ' lm-pisca' : '';
    return `<svg class="lumi lm-${humor}" width="${tamanho}" height="${Math.round(tamanho * 0.92)}" viewBox="0 -6 50 46" overflow="visible" aria-hidden="true">
      <defs><radialGradient id="${id}" cx="40%" cy="30%" r="75%"><stop offset="0" stop-color="${k.corpo}"/><stop offset="1" stop-color="${k.corpo2}"/></radialGradient></defs>
      <g class="lm-corpo">${topete}${cab.tras}
        <ellipse cx="7.6" cy="27" rx="3.2" ry="5" transform="rotate(-22 7.6 27)" fill="${k.corpo2}"/>
        <ellipse cx="40.4" cy="27" rx="3.2" ry="5" transform="rotate(22 40.4 27)" fill="${k.corpo2}"/>
        <ellipse cx="24" cy="25.5" rx="17" ry="15" fill="url(#${id})"/>
        <ellipse cx="18" cy="17.6" rx="6.2" ry="3.2" transform="rotate(-18 18 17.6)" fill="#fff" opacity=".45"/>${cab.frente}
        ${bochechas}
        <g data-olhos><g class="lm-olhos${pisca}">${olhos(humor, k.estiloOlho, k.olho)}${k.cilios ? cilios(humor, k.estiloOlho, k.olho) : ''}</g></g>
        ${boca(humor, k.batom ? '#E0457B' : k.olho)}${lagrimas}
        ${acessorio(k.acessorio, k.corpo2)}
      </g>${ondas}${zz}${pensamento}
    </svg>`;
  }

  const CSS = `
  .lumi { overflow: visible; display: block; }
  .lumi [data-olhos] { transition: transform .12s ease-out; }
  .lumi .lm-pisca { animation: lmPisca 4.6s infinite; transform-origin: center; transform-box: fill-box; }
  @keyframes lmPisca { 0%, 92%, 100% { transform: scaleY(1); } 94.5% { transform: scaleY(.1); } }
  .lumi .lm-pulsa { animation: lmPulsa 1s infinite; } @keyframes lmPulsa { 50% { opacity: .35; } }
  .lumi .lm-onda { animation: lmOnda 1s infinite; } .lumi .lm-o2 { animation-delay: .25s; } @keyframes lmOnda { 0%, 100% { opacity: .2; } 50% { opacity: 1; } }
  .lumi.lm-talk .lm-boca { animation: lmFala .26s infinite alternate; transform-origin: center; transform-box: fill-box; } @keyframes lmFala { to { transform: scaleY(2.2); } }
  .lumi.lm-idle .lm-corpo { animation: lmRespira 3.6s ease-in-out infinite; transform-origin: 50% 100%; transform-box: fill-box; } @keyframes lmRespira { 50% { transform: scale(1.015, .985); } }
  .lumi.lm-happy .lm-corpo, .lumi.lm-laugh .lm-corpo, .lumi.lm-success .lm-corpo { animation: lmPula .5s ease-in-out 3; transform-origin: 50% 100%; transform-box: fill-box; } @keyframes lmPula { 50% { transform: translateY(-2px); } }
  .lumi.lm-angry .lm-corpo { animation: lmTreme .12s 6; } @keyframes lmTreme { 50% { transform: translateX(.9px); } }
  .lumi.lm-surprised .lm-corpo { animation: lmSusto .3s ease; transform-origin: 50% 100%; transform-box: fill-box; } @keyframes lmSusto { 50% { transform: scale(1.08); } }
  .lumi.lm-love .lm-corpo { animation: lmBate .8s ease-in-out infinite; transform-origin: 50% 60%; transform-box: fill-box; } @keyframes lmBate { 50% { transform: scale(1.04); } }
  .lumi .lm-zz { animation: lmZz 2.2s infinite; } @keyframes lmZz { 0% { opacity: 0; transform: translate(0,0); } 50% { opacity: 1; } 100% { opacity: 0; transform: translate(4px,-6px); } }
  .lumi .lm-lagrima { animation: lmCai 1.4s infinite; } @keyframes lmCai { 0% { transform: translateY(0); opacity: 1; } 100% { transform: translateY(5px); opacity: 0; } }
  .lumi .lm-flutua { animation: lmFlutua 2s ease-in-out infinite; } @keyframes lmFlutua { 50% { transform: translateY(-1px); } }
  @media (prefers-reduced-motion: reduce) { .lumi * { animation: none !important; } }`;

  function instalarCss(doc) {
    if (!doc || doc.getElementById('lumi-css')) return;
    const st = doc.createElement('style'); st.id = 'lumi-css'; st.textContent = CSS; doc.head.appendChild(st);
  }

  // olhos seguem o ponteiro (bem pouquinho)
  function olhar(doc, mx, my) {
    doc.querySelectorAll('[data-olhos]').forEach((g) => {
      const svgEl = g.ownerSVGElement; if (!svgEl) return;
      const r = svgEl.getBoundingClientRect(); if (!r.width) return;
      const dx = mx - (r.left + r.width / 2), dy = my - (r.top + r.height / 2);
      const len = Math.hypot(dx, dy) || 1, k = Math.min(1, len / 400);
      g.setAttribute('transform', `translate(${(dx / len * 1.8 * k).toFixed(2)} ${(dy / len * 1.4 * k).toFixed(2)})`);
    });
  }

  const api = { svg, olhar, instalarCss, HUMORES, OLHOS, ACESSORIOS, CORPOS, CORES_OLHO, CABELOS, CORES_CABELO };
  if (typeof document !== 'undefined') instalarCss(document);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  raiz.MASCOTE = api;
})(typeof window !== 'undefined' ? window : globalThis);
