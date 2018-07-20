const enigma = require('enigma.js');
const WebSocket = require('ws');
const qixSchema = require('enigma.js/schemas/12.20.0.json');

let config;
let sendLog;

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

exports.init = async (CONFIG, SENDLOG) => {
  config = CONFIG;
  sendLog = SENDLOG;
};

exports.connect = async (sessionId) => {
  try {
    const qix = await enigma.create(getEnigmaConfig(sessionId)).open();
    qix.sessionId = sessionId;

    if (config.direct) await qix.openDoc(config.docpath);
    sendLog(`Connected session with id: ${sessionId}`);
    return Promise.resolve(qix);
  } catch (e) {
    return Promise.reject(e);
  }
};

exports.interact = async (qix) => {
  await qix.getActiveDoc();
  sendLog(`Interacting with session ${qix.sessionId}`);
};
