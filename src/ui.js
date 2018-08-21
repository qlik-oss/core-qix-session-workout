const blessed = require('blessed');
const contrib = require('blessed-contrib');

const loggerOptions = {
  top: 'center',
  left: 'center',
  width: '50%',
  height: '50%',
  border: 'line',
  label: ' Logs ',
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
    content: `{blue-fg}Scenario:{/blue-fg} ${argv.scenario}
{blue-fg}Threads:{/blue-fg} ${argv.threads}
{blue-fg}Sessions per thread:{/blue-fg} ${argv.max}
{blue-fg}Interaction Interval:{/blue-fg} ${argv.interactionInterval / 1000} s
{blue-fg}Interaction Ratio:{/blue-fg} ${argv.interactionRatio * 100} %
{blue-fg}Session length:{/blue-fg} ${argv.sessionLength / 1000} s
{blue-fg}Seed:{/blue-fg} ${argv.seed}`,
  };
}

const ui = {
  init(argv) {
    const main = blessed.screen({ smartCSR: true });
    const grid = new contrib.grid({ rows: 12, cols: 12, screen: main }); // eslint-disable-line
    const log = grid.set(0, 0, 6, 12, blessed.log, loggerOptions);
    const table = grid.set(6, 0, 6, 9, contrib.table, tableOptions);
    const box = grid.set(6, 9, 6, 3, blessed.box, boxOptions(argv));

    table.setData({ headers: ['Worker Id', 'PID', 'Connections (closed)', 'Interactions', 'Errors', 'Memory Usage (MB)'], data: [] });

    main.key('C-c', () => process.exit(0));
    main.render();

    return ({
      log, table, box, main,
    });
  },
};

module.exports = ui;
