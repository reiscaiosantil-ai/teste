/* Ponte mínima entre a página e o Electron: poucas mensagens, nada de Node na página. */
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('lumiDesktop', {
  mouse: (dentro) => ipcRenderer.send('lumi:mouse', !!dentro),
  aberto: (aberto) => ipcRenderer.send('lumi:aberto', !!aberto),
  aoAtalho: (fn) => ipcRenderer.on('lumi:atalho', (_e, qual) => fn(qual)),
  vozInfo: () => ipcRenderer.invoke('lumi:voz-info'),
  piper: {
    vozes: () => ipcRenderer.invoke('lumi:piper-vozes'),
    falar: (texto, nome, op) => ipcRenderer.invoke('lumi:piper-falar', texto, nome, op),
    adicionar: () => ipcRenderer.invoke('lumi:piper-adicionar'),
  },
  estudio: {
    estado: () => ipcRenderer.invoke('lumi:estudio-estado'),
    salvar: (indice, texto, wav) => ipcRenderer.invoke('lumi:estudio-salvar', indice, texto, wav),
  },
  abrirPasta: (qual) => ipcRenderer.invoke('lumi:abrir-pasta', qual),
  whisper: {
    estado: () => ipcRenderer.invoke('lumi:whisper-estado'),
    preparar: (nome) => ipcRenderer.invoke('lumi:whisper-preparar', nome),
    transcrever: (audio, nome) => ipcRenderer.invoke('lumi:transcrever', audio, nome),
    aoMudar: (fn) => ipcRenderer.on('lumi:whisper', (_e, estado) => fn(estado)),
  },
  claudeCode: {
    status: (op) => ipcRenderer.invoke('lumi:cc-status', op),
    pensar: (dados) => ipcRenderer.invoke('lumi:cc-pensar', dados),
    nova: () => ipcRenderer.invoke('lumi:cc-nova'),
    terminal: (acao, op) => ipcRenderer.invoke('lumi:cc-terminal', acao, op),
    sair: (op) => ipcRenderer.invoke('lumi:cc-sair', op),
  },
  sistema: {
    memoria: () => ipcRenderer.invoke('lumi:sis-memoria'),
    fechar: (alvo, op) => ipcRenderer.invoke('lumi:sis-fechar', alvo, op),
    abrir: (alvo) => ipcRenderer.invoke('lumi:sis-abrir', alvo),
    conversa: (contato) => ipcRenderer.invoke('lumi:sis-conversa', contato),
    sairLigacao: () => ipcRenderer.invoke('lumi:sis-ligacao'),
    energia: (acao, senha, nome, segundos) => ipcRenderer.invoke('lumi:sis-energia', acao, senha, nome, segundos),
    trocarSenha: (atual, nova) => ipcRenderer.invoke('lumi:sis-senha', atual, nova),
    senhaPadrao: () => ipcRenderer.invoke('lumi:sis-senha-padrao'),
    protecao: () => ipcRenderer.invoke('lumi:sis-protecao'),
    verificar: (tipo) => ipcRenderer.invoke('lumi:sis-verificar', tipo),
    verificando: () => ipcRenderer.invoke('lumi:sis-verificando'),
    atualizar: () => ipcRenderer.invoke('lumi:sis-atualizar'),
    segurancaWindows: () => ipcRenderer.invoke('lumi:sis-seguranca-windows'),
  },
  tela: {
    arrastar: (fase) => ipcRenderer.send('lumi:arrastar', fase),
    listar: () => ipcRenderer.invoke('lumi:telas'),
    posicionar: (p) => ipcRenderer.invoke('lumi:posicionar', p),
    aoMudar: (fn) => ipcRenderer.on('lumi:posicao', (_e, p) => fn(p)),
  },
  capa: (musica, artista) => ipcRenderer.invoke('lumi:capa', musica, artista),
  spotify: {
    estado: () => ipcRenderer.invoke('lumi:spotify-estado'),
    comando: (acao) => ipcRenderer.invoke('lumi:spotify-comando', acao),
    buscar: (busca) => ipcRenderer.invoke('lumi:spotify-buscar', busca),
    aoMudar: (fn) => ipcRenderer.on('lumi:spotify', (_e, estado) => fn(estado)),
  },
});
