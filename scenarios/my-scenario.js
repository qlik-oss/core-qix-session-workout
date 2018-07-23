const enigma = require('enigma.js');
const WebSocket = require('ws');
const qixSchema = require('enigma.js/schemas/12.20.0.json');

let config;
let getRandomNumberBetween;
let sendLog;
let fieldNames;

function getEnigmaConfig(sessionId) {
  const websocketUrlPart = (config.secure) ? 'wss' : 'ws';

  const headers = config.headers || {};
  headers['X-Qlik-Session'] = sessionId;

  return {
    url: (config.direct) ? `${websocketUrlPart}://${config.gateway}:9076/app/engineData` : `${websocketUrlPart}://${config.gateway}${config.docpath}`,
    schema: qixSchema,
    createSocket: url => new WebSocket(url, {
      rejectUnauthorized: false,
      headers,
    }),
    responseInterceptors: [{
      onRejected: function retryAbortedError(sessionReference, qixRequest, error) {
        if (error.code === qixSchema.enums.LocalizedErrorCode.LOCERR_GENERIC_ABORTED) {
          qixRequest.tries = (qixRequest.tries || 0) + 1; // eslint-disable-line no-param-reassign
          if (qixRequest.tries <= config.maxRetries) {
            return qixRequest.retry();
          }
        }
        return this.Promise.reject(error);
      },
    }],
  };
}

// Private method for retrieving all fields in the document
async function getFieldNames(qix) {
  const app = await qix.getActiveDoc();
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

// Private method for making a random selection in a field. Triggered by interact.
async function doRandomSelection(app, fieldName, sessionId) {
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
        qInitialDataFetch: [{
          qTop: 0, qLeft: 0, qWidth: 0, qHeight: 10,
        }],
      },
    },
  );

  try {
    const sessionObjectLayout = await sessionObject.getLayout();
    const availableValues = sessionObjectLayout.qListObject.qDataPages[0].qMatrix;
    const randomValue = getRandomNumberBetween(0, availableValues.length);
    sendLog(`Selecting value ${randomValue} in field ${fieldName} in session ${sessionId}`);
    await sessionObject.selectListObjectValues('/qListObjectDef', [randomValue], true);
    await app.destroySessionObject(sessionObject.id);
  } catch (e) {
    sendLog(`Failed to perform selection in session ${sessionId} with message ${e}`);
  }
}

// Method for initializing a scenario i.e. setting variables needed before a connect.
exports.init = async (CONFIG, GETRANDOMNUMBERBETWEEN, SENDLOG) => {
  config = CONFIG;
  getRandomNumberBetween = GETRANDOMNUMBERBETWEEN;
  sendLog = SENDLOG;
};

// Method for connecting a session to a Qlik Associative Engine instance.
// Should return a qix object if successful.
exports.connect = async (sessionId) => {
  try {
    const qix = await enigma.create(getEnigmaConfig(sessionId)).open();
    qix.sessionId = sessionId;

    if (config.direct) await qix.openDoc(config.docpath);

    fieldNames = await getFieldNames(qix);
    sendLog(`Connected session with id: ${sessionId}`);
    return Promise.resolve(qix);
  } catch (e) {
    return Promise.reject(e);
  }
};

// Method for interacting with a session. What should be performed is defined by the scenario.
exports.interact = async (qix) => {
  const app = await qix.getActiveDoc();
  sendLog(`Interacting with session ${qix.sessionId}`);
  await doRandomSelection(app, fieldNames[getRandomNumberBetween(0, fieldNames.length)], qix.sessionId);
};
