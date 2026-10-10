import {boot} from './src/app.js';
if(globalThis.SillyTavern?.getContext) {
  globalThis.filigreeApp?.destroy();
  globalThis.filigreeApp=boot();
}
