const enigma = require('enigma.js');
const WebSocket = require('ws');
const qixSchema = require('enigma.js/schemas/12.20.0.json');
const request = require('request');
const seedrandom = require('seedrandom');
const scenario = require('./scenarios/objects');
const os = require('os');

const MAX_RETRIES = 3;
const GATEWAY = process.env.gateway;
const DIRECT = process.env.direct;
const DOCPATH = process.env.docpath;
const MAX_SESSIONS = process.env.max;
const INTERVAL = process.env.interval;
const SELECTION_INTERVAL = process.env.selectionInterval;
const SELECTION_RATIO = process.env.selectionRatio;
const LOGIN_URL = process.env.loginUrl;
const COOKIE = process.env.cookie;
const KEEP_ALIVE = process.env.keepAlive;
let OBJECTS = process.env.objects;
const SECURE = process.env.secure;

let WORKER_ID;
const sessions = [];
let closedSessions = 0;
let SELECTIONS = 0;
let errorCount = 0;

function generateGUID() {
  /* eslint-disable no-bitwise */
  const GUID = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

  // sendLog(GUID);
  return GUID;

  /* eslint-enable no-bitwise */
}

function sendInfo() {
  const json = {
    id: WORKER_ID,
    type: 'INFO',
    msg: [WORKER_ID, process.pid, `${sessions.length} (${closedSessions})`, SELECTIONS, errorCount, (process.memoryUsage().rss / 1024 / 1024).toFixed(2)],
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

async function getLoginCookie() {
  return new Promise((resolve, reject) => {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    const fullUrl = `https://${GATEWAY}${LOGIN_URL}`;
    request(fullUrl, { followRedirect: false },
      (error, response) => {
        if (response.statusCode === 302) {
          resolve(response.headers['set-cookie'][0].split(';')[0]);
        } else {
          sendLog(`The ´getLoginCookie´ function with url ${fullUrl} returned ${response.statusCode}`);
          reject(new Error(`The ´getLoginCookie´ function with url ${fullUrl} returned ${response.statusCode}`));
        }
      });
  });
}

function getEnigmaConfig(cookie, guid) {
  const JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbiIsInVzZXJSb2xlIjoiQWRtaW4iLCJpYXQiOjE1MTkxNTg2MzJ9.035tIIGipahbMGcXHzsPVZZUT3HilsaJ6ou0CMIegTc';
  const websocketUrlPart = SECURE ? 'wss' : 'ws';
  return {
    url: (DIRECT === 'true') ? `${websocketUrlPart}://${GATEWAY}:9076/app/engineData/ttl/60` : `${websocketUrlPart}://${GATEWAY}${DOCPATH}`,
    schema: qixSchema,
    createSocket: url => new WebSocket(url, {
      rejectUnauthorized: false,
      // headers: {
      //   Cookie: cookie,
      //   'X-Qlik-Session': generateGUID(),
      // },
      headers: {
        Authorization: `Bearer ${JWT}`,
        'X-Qlik-Session': (guid === undefined) ? generateGUID() : guid,
      },
    }),
    responseInterceptors: [{
      onRejected: function retryAbortedError(sessionReference, qixRequest, error) {
        sendLog('QIX Request: Rejected', error.message);
        if (error.code === qixSchema.enums.LocalizedErrorCode.LOCERR_GENERIC_ABORTED) {
          qixRequest.tries = (qixRequest.tries || 0) + 1; // eslint-disable-line no-param-reassign
          sendLog(`QIX Request: Retry #${qixRequest.tries}`);
          if (qixRequest.tries <= MAX_RETRIES) {
            return qixRequest.retry();
          }
        }
        return this.Promise.reject(error);
      },
    }],
  };
}

async function getFieldNames(app) {
  const sessionObject = await app.createSessionObject(
    {
      qInfo: {
        qId: '',
        qType: 'FieldList',
      },
      qFieldListDef: {
        qShowSemantic: true,
      },
    },
  );

  const sessionLayout = await sessionObject.getLayout();
  return sessionLayout.qFieldList.qItems.map(i => i.qName);
}

function getRandomNumberBetween(start, end) {
  return Math.floor(Math.random() * (end - start)) + start;
}

async function doRandomSelection(app, fieldName) {
  const sessionObject = await app.createSessionObject(
    {
      qInfo: {
        qType: 'filterbox',
      },
      qListObjectDef: {
        qDef: {
          qFieldLabels: [fieldName],
          qFieldDefs: [fieldName],
        },
        qInitialDataFetch: [{ qTop: 0, qLeft: 0, qWidth: 0, qHeight: 10 }],
      },
    });

  try {
    const sessionObjectLayout = await sessionObject.getLayout();
    const availableValues = sessionObjectLayout.qListObject.qDataPages[0].qMatrix;
    const randomValue = getRandomNumberBetween(0, availableValues.length);
    await sessionObject.selectListObjectValues('/qListObjectDef', [randomValue], true);
    await app.destroySessionObject(sessionObject.id);
  } catch (e) {
    sendLog(' selections triggered error', e.message);
  }
}

async function sleep(delay) {
  return new Promise((resolve) => {
    setTimeout(() => { resolve(); }, delay);
  });
}

async function makeRandomSelection() {
  const nrOfSelections = Math.ceil(sessions.length * SELECTION_RATIO);

  try {
    if (sessions[0]) {
      const firstApp = await sessions[0].getActiveDoc();
      const fieldNames = await getFieldNames(firstApp);

      for (let i = 0; i < nrOfSelections; i += 1) {
        const qix = sessions[getRandomNumberBetween(0, sessions.length)];

        /* eslint-disable no-await-in-loop */
        try {
          SELECTIONS += 1;
          const app = await qix.getActiveDoc();
          await doRandomSelection(app, fieldNames[getRandomNumberBetween(0, fieldNames.length)]);
        } catch (e) {
          sendLog('Error occured while selecting: ', e.message);
        }
      }
    } else {
      sendLog(' No sessions to do selections on');
    }
  } catch (err) {
    sendLog(' Error caught: ', err);
  }
  sendInfo();
}

async function connect() {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  for (let i = 1; i <= MAX_SESSIONS; i += 1) {
    await wait(INTERVAL);

    try {
      const cookie = (COOKIE === 'undefined') ? await getLoginCookie() : COOKIE;

      const GUID = generateGUID();
      // sendLog(JSON.stringify(getEnigmaConfig(cookie, GUID)));

      const qix = await enigma.create(getEnigmaConfig(cookie, GUID)).open();
      qix.on('closed', () => { closedSessions += 1; }); // eslint-disable-line no-loop-func

      if (DIRECT === 'true') await qix.openDoc(DOCPATH);

      // await qix.session.close();
      // qix = await enigma.create(getEnigmaConfig(cookie, GUID)).open();
      // await qix.openDoc(DOCPATH);

      sessions.push(qix);
      sendInfo();

      if (OBJECTS) {
        await scenario.createObjects(qix, OBJECTS);
      }
    } catch (e) {
      sendLog('Error occured while connecting: ', e);
      errorCount += 1;
    }
  }
}

// eslint-disable-next-line no-unused-vars
async function disconnect() {
  const delay = (INTERVAL * 10) / sessions.length;
  // eslint-disable-next-line no-restricted-syntax
  for (const qix of sessions) {
    /* eslint-disable no-await-in-loop */
    await qix.session.close();
    await sleep(delay);
    /* eslint-enable no-await-in-loop */
  }
}

exports.start = async (workerNr) => {
  seedrandom(`${os.hostname()}_${workerNr}`, { global: true });

  WORKER_ID = workerNr;
  OBJECTS = JSON.parse(OBJECTS);
  sendInfo(); // Initial information send

  const selectionsIntevalFn = setInterval(() => {
    makeRandomSelection(sessions);
  }, SELECTION_INTERVAL);

  await connect(sessions);

  if (KEEP_ALIVE === 'false') {
    clearInterval(selectionsIntevalFn);
    await disconnect(sessions);
    sendInfo();
    process.exit();
  }
};
