#!/usr/bin/env node

const cluster = require('cluster');
const fs = require('fs');
const yargs = require('yargs');
const os = require('os');
const path = require('path');
const runner = require('./src/runner');
const ui = require('./src/ui');

let nbrWorkers = 0;
let exitCode = 0;

const argv = yargs // eslint-disable-line
  .usage('Tool for running performance tests aginst QLIK Qix Engine\n\nUsage: $0 [options]')
  .help('help').alias('help', 'h')
  .version(false)
  .wrap(Math.min(140, yargs.terminalWidth()))
  .options({
    threads: {
      alias: 't',
      description: 'Number of threads to run in parallell\n Setting to `-1` will use the number of cores',
      default: 1,
      type: 'number',
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
    interactionInterval: {
      description: 'How often interactions should be done',
      default: 10000,
      type: 'number',
      requiresArg: true,
    },
    interactionRatio: {
      description: 'The amount of sessions the should do selections (in %)',
      default: 0.1,
      type: 'number',
      requiresArg: true,
    },
    exit: {
      description: 'Exit main process after all worker threads has finished',
      default: false,
      type: 'boolean',
    },
    config: {
      description: 'Path to config file',
      type: 'string',
      alias: 'c',
    },
    scenario: {
      description: 'Path to scenario file',
      type: 'string',
      requiresArg: true,
      demandOption: true,
      alias: 's',
    },
    sessionLength: {
      description: 'The length of each session (in ms)',
      default: 1000000000,
      type: 'number',
      requiresArg: false,
    },
    triangular: {
      description: 'If set to true the traffic speed will slowly increase to the\nmaximum rate (the specified interval) and thereafter slowly decrease',
      default: false,
      type: 'boolean',
      requiresArg: false,
    },
    seed: {
      description: 'The seed that should be used for generating randomness',
      type: 'string',
      requiresArg: false,
    },
    host: {
      description: 'URL to host',
      type: 'string',
      requiresArg: false,
      default: 'localhost',
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
    let foundConfig = require(configPath); // eslint-disable-line
    if (typeof foundConfig === 'function') {
      config = Object.assign({}, foundConfig());
    } else {
      config = Object.assign({}, foundConfig);
    }
    return config;
  })
  .argv;

argv.seed = argv.seed ? argv.seed : runner.generateGUID();
argv.scenario = path.resolve(argv.scenario);

if (!fs.existsSync(argv.scenario)) {
  console.error(`Config ${argv.scenario} not found`);
  process.exit(1);
}

const infoArray = new Array(argv.threads).fill([]);

if (cluster.isMaster) {
  if (argv.threads === -1) {
    argv.threads = os.cpus().length;
  }

  const UI = ui.init(argv);

  for (let i = 0; i < argv.threads; i += 1) {
    const worker = cluster.fork(argv);
    nbrWorkers += 1;

    worker.on('message', (msg) => {
      msg = JSON.parse(msg); // eslint-disable-line no-param-reassign
      if (msg.type === 'INFO') {
        infoArray[msg.id - 1] = msg.msg;
        UI.table.setData({ headers: ['Worker Id', 'PID', 'Connections (closed)', 'Interactions', 'Errors', 'Memory Usage (MB)'], data: infoArray });
        UI.main.render();
      } else if (msg.type === 'LOG') {
        UI.log.log(`{blue-fg}Worker ${msg.id} reported:{/blue-fg} ${msg.msg}`);
      }
    });
  }

  cluster.on('exit', (worker, code, signal) => {
    if (code !== 0) {
      exitCode = signal || code;
      UI.log.log(' >>> Worker %d died (%s)', worker.process.pid, exitCode);
    }
    nbrWorkers -= 1;
    if (nbrWorkers === 0) {
      UI.log.log('{red-fg}All worker threads has exited, exit the application with `Ctrl+c`{/red-fg}');
      if (argv.exit) process.exit(exitCode);
    }
  });
} else {
  runner.start(cluster.worker.id, argv);
}
