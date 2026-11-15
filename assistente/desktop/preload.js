/* Ponte mínima entre a página e o Electron: poucas mensagens, nada de Node na página. */
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('lumiDesktop', {
  mouse: (dentro) => ipcRenderer.send('lumi:mouse', !!dentro),
  aberto: (aberto) => ipcRenderer.send('lumi:aberto', !!aberto),
  aoAtalho: (fn) => ipcRenderer.on('lumi:atalho', (_e, qual) => fn(qual)),
  claudeCode: {
    status: () => ipcRenderer.invoke('lumi:cc-status'),
    pensar: (dados) => ipcRenderer.invoke('lumi:cc-pensar', dados),
    nova: () => ipcRenderer.invoke('lumi:cc-nova'),
  },
  spotify: {
    estado: () => ipcRenderer.invoke('lumi:spotify-estado'),
    comando: (acao) => ipcRenderer.invoke('lumi:spotify-comando', acao),
    buscar: (busca) => ipcRenderer.invoke('lumi:spotify-buscar', busca),
    aoMudar: (fn) => ipcRenderer.on('lumi:spotify', (_e, estado) => fn(estado)),
  },
});
