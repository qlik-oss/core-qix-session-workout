#!/usr/bin/env node

const cluster = require('cluster');
const fs = require('fs');
const yargs = require('yargs');
const os = require('os');
const runner = require('./runner');
const ui = require('./src/ui');

const argv = yargs // eslint-disable-line
  .usage('Tool for running performance tests aginst QLIK Qix Engine\n\nUsage: $0 [options]')
  .help('help').alias('help', 'h')
  .version(false)
  .wrap(Math.min(140, yargs.terminalWidth()))
  .options({
    threads: {
      alias: 't',
      description: 'Number of threads to run in parallell/n Setting to `-1` will use the number of cores',
      default: 1,
      type: 'number',
      requiresArg: true,
    },
    gateway: {
      alias: 'g',
      description: 'Gateway/Server to connect to',
      default: 'localhost',
      type: 'string',
      requiresArg: true,
    },
    direct: {
      alias: 'd',
      description: 'Opens the app directly on the engine',
      default: false,
      type: 'boolean',
    },
    docpath: {
      description: 'Path to document',
      type: 'string',
      requiresArg: true,
    },
    max: {
      alias: 'm',
      description: 'Max number of sessions',
      type: 'number',
      requiresArg: true,
    },
    interval: {
      alias: 'i',
      description: 'How often new sessions should be created',
      default: 60,
      type: 'number',
      requiresArg: true,
    },
    selectionInterval: {
      alias: 's',
      description: 'How often selections should be done',
      default: 10000,
      type: 'number',
      requiresArg: true,
    },
    selectionRatio: {
      alias: 'r',
      description: 'The amount of sessions the should do selections (in %)',
      default: 0.1,
      type: 'number',
      requiresArg: true,
    },
    loginUrl: {
      alias: 'l',
      description: 'If a cookie should be fetched and used in ws header',
      type: 'string',
    },
    keepAlive: {
      alias: 'k',
      description: 'Don´t close sessions after ramp up',
      default: false,
      type: 'boolean',
    },
    objects: {
      description: 'Defined objects to create after session create',
      default: [],
      type: 'array',
    },
    secure: {
      description: 'Wheather to use wss or ws',
      default: true,
      type: 'boolean',
    },
    config: {
      description: 'Path to config file',
      type: 'string',
      alias: 'c',
    },
    sessionLength: {
      alias: 'sl',
      description: 'The length of each session (in ms)',
      default: 1000000000,
      type: 'number',
      requiresArg: false,
    },
    triangular: {
      alias: 'tr',
      description: 'If set to true the traffic speed will slowly increase to the '
        + 'maximum rate (the specified interval) and thereafter slowly decrease',
      default: false,
      type: 'boolean',
      requiresArg: false,
    },
    headers: {
      description: 'Headers that should be used when connecting',
      type: 'string',
    },
  })
  .config('config', (configPath) => {
    if (configPath === null) {
      return {};
    }
    if (!fs.existsSync(configPath)) {
      throw new Error(`Config ${configPath} not found`);
    }
    let config = {};
    const foundConfig = require(configPath); // eslint-disable-line
    if (typeof foundConfig === 'function') {
      config = Object.assign({}, foundConfig());
    } else {
      config = Object.assign({}, foundConfig);
    }
    return config;
  })
  .argv;

argv.objects = JSON.stringify(argv.objects);

if (argv.headers) {
  argv.headers = JSON.stringify(argv.headers);
}

const infoArray = new Array(argv.threads).fill([]);

if (cluster.isMaster) {
  if (argv.threads === -1) {
    argv.threads = os.cpus().length;
  }

  const UI = ui.init(argv);

  for (let i = 0; i < argv.threads; i += 1) {
    const worker = cluster.fork(argv);

    worker.on('message', (msg) => {
      msg = JSON.parse(msg); // eslint-disable-line no-param-reassign
      if (msg.type === 'INFO') {
        infoArray[msg.id - 1] = msg.msg;
        UI.table.setData({ headers: ['Worker Id', 'PID', 'Connections (closed)', 'Selections', 'Errors', 'Memory Usage (MB)'], data: infoArray });
        UI.main.render();
      } else if (msg.type === 'LOG') {
        UI.log.log(`Worker ${msg.id} reported: ${msg.msg}`);
      }
    });
  }

  cluster.on('exit', (worker, code, signal) => {
    if (code !== 0) {
      UI.log.log(' >>> Worker %d died (%s)', worker.process.pid, signal || code);
    }
  });
} else {
  runner.start(cluster.worker.id);
}
