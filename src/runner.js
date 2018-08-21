const seedrandom = require('seedrandom');

const MAX_SESSIONS = process.env.max;
const INTERVAL = process.env.interval;
const INTERACTION_INTERVAL = process.env.interactionInterval;
const INTERACTION_RATIO = process.env.interactionRatio;
const SESSION_LENGTH = process.env.sessionLength;
const SEED = process.env.seed;

let WORKER_ID;
const sessions = [];
let closedSessions = 0;
let errorCount = 0;
let nbrInteractions = 0;
let scenario;

exports.generateGUID = function generateGUID() {
  /* eslint-disable no-bitwise */
  const GUID = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

  return GUID;
  /* eslint-enable no-bitwise */
};

function sendInfo() {
  const json = {
    id: WORKER_ID,
    type: 'INFO',
    msg: [WORKER_ID, process.pid, `${sessions.length} (${closedSessions})`, nbrInteractions, errorCount, (process.memoryUsage().rss / 1024 / 1024).toFixed(2)],
  };
  process.send(JSON.stringify(json));
}

function sendLog(msg) {
  const json = {
    id: WORKER_ID,
    type: 'LOG',
    msg,
  };
  process.send(JSON.stringify(json));
}

function sendExit() {
  const exitCode = errorCount === 0 ? 0 : 1;
  sendLog(`Worker with id ${WORKER_ID} exiting with code ${exitCode}. Number of errors: ${errorCount}`);
  sendInfo();
  process.exit(exitCode);
}

function getRandomNumberBetween(start, end) {
  return Math.floor(Math.random() * (end - start)) + start;
}

async function doInteract() {
  // Number of interactions that should be made based on ratio
  const nbrOfInteractions = Math.ceil(sessions.length * INTERACTION_RATIO);

  if (sessions.length > 0) {
    for (let i = 0; i < nbrOfInteractions; i += 1) {
      // Pick a random qix session on this worker and interact
      const qix = sessions[getRandomNumberBetween(0, sessions.length)];
      try {
        await scenario.interact(qix);
        nbrInteractions += 1;
      } catch (e) {
        sendLog(`Interaction with session ${qix.sessionId} failed with message: ${e}`);
        errorCount += 1;
      }
    }
    sendInfo();
  } else {
    sendLog('No sessions to interact with');
  }
}

async function sleep(delay) {
  return new Promise((resolve) => {
    setTimeout(() => { resolve(); }, delay);
  });
}

function getTriangularWaitTime(meanInterval, index, max) {
  // For mean interval 200 ms, max 20 sessions the rate and corresponding interval would be:
  // Rate: 1 2 3 4 5 6 7 8 9 10 9 8 7 6 5 4 3 2 1
  // Interval: 1000 500 333 250 166 ... 100 .... 166 255 333 500 1000

  const peakRate = 1000 / meanInterval; // Calculate the peak rate

  const peakIndex = Math.floor(max / 2); // Peak index is in the middle
  let rangePercentage; // Distance from the peak in percentage of all the way to the edges

  if (index < peakIndex) { // Before peak
    rangePercentage = index / peakIndex;
  } else { // After peak
    rangePercentage = (max - index) / (max - peakIndex);
  }

  const speedPercentage = (rangePercentage + 0.1) / 1.1;
  const rate = speedPercentage * peakRate; // The rate at the current index
  const interval = 1000 / rate; // Invert to get interval
  return interval;
}

async function connect() {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  for (let i = 1; i <= MAX_SESSIONS; i += 1) {
    if (process.env.triangular === 'true') {
      await wait(getTriangularWaitTime(INTERVAL, i, MAX_SESSIONS));
    } else {
      await wait(INTERVAL);
    }

    // Generate a session id to make each session unique
    const sessionId = exports.generateGUID();

    try {
      const qix = await scenario.connect(sessionId);

      sessions.push(qix);
      sendInfo();
    } catch (e) {
      sendLog(`Error occured while connecting session ${sessionId} with message: ${JSON.stringify(e)}`);
      errorCount += 1;
      closedSessions += 1;
    }
  }
}

async function disconnect() {
  const delay = (INTERVAL * 10) / sessions.length;
  // eslint-disable-next-line no-restricted-syntax
  for (const qix of sessions) {
    await qix.session.close();
    closedSessions += 1;
    sendLog(`Disconnected session ${qix.sessionId}`);
    await sleep(delay);
  }

  sendLog('Scenario has ended and all sessions are disconnected.');
  sendExit();
}

exports.start = async (workerNr, config) => {
  seedrandom(`${SEED}_${workerNr}`, { global: true });

  WORKER_ID = workerNr;

  sendInfo(); // Initial information send

  // init scenario
  scenario = require(process.env.scenario); // eslint-disable-line
  await scenario.init(config, getRandomNumberBetween, sendLog);

  const interactionIntervalFn = setInterval(() => {
    doInteract();
  }, INTERACTION_INTERVAL);

  setInterval(() => {
    sendInfo();
  }, 1000);

  setTimeout(() => {
    sendLog(`Maximum session length of ${SESSION_LENGTH} ms reached, closing all sessions`);
    clearInterval(interactionIntervalFn);
    disconnect(sessions);
  }, SESSION_LENGTH);


  await connect(sessions);
};
