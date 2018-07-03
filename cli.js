#!/usr/bin/env node

const cluster = require('cluster');
const fs = require('fs');
const yargs = require('yargs');
const os = require('os');
const blessed = require('blessed');
const contrib = require('blessed-contrib');
const runner = require('./runner');

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
      description: 'Gateway to connect to',
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
      default: '/doc/doc/drugcases.qvf',
      type: 'string',
      requiresArg: true,
    },
    max: {
      alias: 'm',
      description: 'Max number of sessions',
      type: 'number',
      // required: true,
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
      default: '/login/local/callback?username=admin&password=password',
      type: 'string',
      requiresArg: true,
    },
    cookie: {
      description: 'Fixed cookie to be used in ws header',
      default: undefined,
      type: 'string',
      requiresArg: true,
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
      default: null,
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

const settingsString = `
{blue-fg}Threads:{/blue-fg} ${argv.threads}
{blue-fg}Gateway:{/blue-fg} ${argv.gateway}
{blue-fg}Direct Connect:{/blue-fg} ${argv.direct}
{blue-fg}Docpath:{/blue-fg} ${argv.docpath}
{blue-fg}Sessions:{/blue-fg} ${argv.max}
{blue-fg}Duration:{/blue-fg} ${argv.interval} ms
{blue-fg}Selection Interval:{/blue-fg} ${argv.selectionInterval / 1000} s 
{blue-fg}Selection Ratio:{/blue-fg} ${argv.selectionRatio * 100} %
{blue-fg}Login Url:{/blue-fg} ${argv.loginUrl}
{blue-fg}Cookie:{/blue-fg} ${argv.cookie}
{blue-fg}Keepalive:{/blue-fg} ${argv.keepAlive}
{blue-fg}Objects:{/blue-fg} ${JSON.parse(argv.objects).length}`;


const infoArray = new Array(argv.threads).fill([]);

if (cluster.isMaster) {
  // Blessed UI
  const main = blessed.screen({ smartCSR: true });
  const grid = new contrib.grid({ rows: 12, cols: 12, screen: main }); // eslint-disable-line

  const loggerOptions = {
    top: 'center',
    left: 'center',
    width: '50%',
    height: '50%',
    border: 'line',
    label: ' Error logs ',
    tags: true,
    keys: true,
    vi: true,
    mouse: true,
    scrollback: 100,
    scrollbar: {
      ch: ' ',
      track: {
        // bg: 'yellow',
      },
      style: {
        inverse: true,
      },
    },
  };

  const tableOptions = {
    keys: true,
    fg: 'white',
    selectedFg: 'white',
    selectedBg: 'blue',
    interactive: false,
    label: ' Workers ',
    width: '100%',
    //   height: '100%',
    // padding: 1,
    //   border: { type: 'line', fg: 'cyan' },
    columnSpacing: 1,
    columnWidth: [10, 8, 23, 15, 10, 17],
  };

  const boxOptions = {
    // border: 'line',
    label: ' Settings ',
    // align: 'center',
    // left: 'center',
    // top: 'center',
    tags: true,
    content: settingsString,
    // width: 22,
    // height: 10,
    // padding: 2,
  };

  const log = grid.set(0, 0, 6, 12, blessed.log, loggerOptions);
  const table = grid.set(6, 0, 6, 9, contrib.table, tableOptions);
  /* const box = */grid.set(6, 9, 6, 3, blessed.box, boxOptions);

  table.setData({ headers: ['Worker Id', 'PID', 'Connections (closed)', 'Selections', 'Errors', 'Memory Usage (MB)'], data: [] });

  main.key('C-c', () => process.exit(0));
  main.render();

  // Node cluster
  if (argv.threads === -1) {
    argv.threads = os.cpus().length;
  }

  for (let i = 0; i < argv.threads; i += 1) {
    const worker = cluster.fork(argv);

    worker.on('message', (msg) => {
      msg = JSON.parse(msg); // eslint-disable-line no-param-reassign
      if (msg.type === 'INFO') {
        infoArray[msg.id - 1] = msg.msg;
        table.setData({ headers: ['Worker Id', 'PID', 'Connections (closed)', 'Selections', 'Errors', 'Memory Usage (MB)'], data: infoArray });
        main.render();
      } else if (msg.type === 'LOG') {
        log.log(`Worker ${msg.id} reported: ${msg.msg}`);
      }
    });
  }

  cluster.on('exit', (worker, code, signal) => {
    if (code !== 0) {
      log.log(' >>> Worker %d died (%s)', worker.process.pid, signal || code);
    }
  });
  // =================================
} else {
  runner.start(cluster.worker.id);
}
