// Skriver ut alla spelinställningar som går att ändra i .env, med standardvärden.
// Kör: node server/config-docs.js
import { configDocs } from '../public/js/config.js';

console.log(configDocs());
