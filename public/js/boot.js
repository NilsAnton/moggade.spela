// Laddas först av main.js: servern skriver in spelvärdena från .env i sidan (window.LOCKDOWN_CONFIG).
// De läggs in här innan någon annan modul hinner använda vapen, gubbar eller förmågor.
import { applyConfig } from './config.js';

applyConfig(globalThis.LOCKDOWN_CONFIG ?? {});
