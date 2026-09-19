import { createApp } from './app.js';
import { config } from './config/index.js';

createApp().listen(config.port, () => {
  console.log(`Credit card demo API listening on http://localhost:${config.port}`);
});
