'use strict';

const { config } = require('./config');
const { createApp } = require('./app');

const app = createApp();

app.listen(config.port, config.host, () => {
  // eslint-disable-next-line no-console
  console.log(
    `GovConnect USA API listening on http://${config.host}:${config.port} [${config.nodeEnv}]`
  );
});
