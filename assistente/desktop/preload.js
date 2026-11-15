/* Ponte mínima entre a página e o Electron: só três mensagens, nada de Node na página. */
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('lumiDesktop', {
  mouse: (dentro) => ipcRenderer.send('lumi:mouse', !!dentro),
  aberto: (aberto) => ipcRenderer.send('lumi:aberto', !!aberto),
  aoAtalho: (fn) => ipcRenderer.on('lumi:atalho', (_e, qual) => fn(qual)),
});
