// The only thing the app page gets from the desktop shell: Google sign-in
// through the computer's own browser (see main.js). index.html checks for
// window.hifzDesktop to know it's running here.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hifzDesktop', {
  googleSignIn: () => ipcRenderer.invoke('google-sign-in'),
});
