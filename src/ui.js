const blessed = require('blessed');
const contrib = require('blessed-contrib');

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
  columnSpacing: 1,
  columnWidth: [10, 8, 23, 15, 10, 17],
};

function boxOptions(argv) {
  return {
    label: ' Settings ',
    tags: true,
    keys: true,
    vi: true,
    alwaysScroll: true,
    scrollable: true,
    content: `{blue-fg}Threads:{/blue-fg} ${argv.threads}
{blue-fg}Gateway:{/blue-fg} ${argv.gateway}
{blue-fg}Headers:{/blue-fg} ${argv.headers}
{blue-fg}Direct Connect:{/blue-fg} ${argv.direct}
{blue-fg}Docpath:{/blue-fg} ${argv.docpath}
{blue-fg}Sessions:{/blue-fg} ${argv.max}
{blue-fg}Duration:{/blue-fg} ${argv.interval} ms
{blue-fg}Selection Interval:{/blue-fg} ${argv.selectionInterval / 1000} s
{blue-fg}Selection Ratio:{/blue-fg} ${argv.selectionRatio * 100} %
{blue-fg}Login Url:{/blue-fg} ${argv.loginUrl}
{blue-fg}Keepalive:{/blue-fg} ${argv.keepAlive}
{blue-fg}Objects:{/blue-fg} ${JSON.parse(argv.objects).length}`,
  };
}

const ui = {
  init(argv) {
    const main = blessed.screen({ smartCSR: true });
    const grid = new contrib.grid({ rows: 12, cols: 12, screen: main }); // eslint-disable-line
    const log = grid.set(0, 0, 6, 12, blessed.log, loggerOptions);
    const table = grid.set(6, 0, 6, 9, contrib.table, tableOptions);
    const box = grid.set(6, 9, 6, 3, blessed.box, boxOptions(argv));

    table.setData({ headers: ['Worker Id', 'PID', 'Connections (closed)', 'Selections', 'Errors', 'Memory Usage (MB)'], data: [] });

    main.key('C-c', () => process.exit(0));
    main.render();

    return ({
      log, table, box, main,
    });
  },
};

module.exports = ui;
