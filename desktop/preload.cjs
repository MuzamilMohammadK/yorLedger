// Runs in an isolated, sandboxed context; exposes only a read-only flag to the page.
const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('yorledgerDesktop', { isDesktop: true });
