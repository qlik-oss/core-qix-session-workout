function sessionObjectDef(dimension, measure) {
  const sessionObject = {
    qInfo: {
      qType: 'picasso-barchart',
    },
    qHyperCubeDef: {
      qDimensions: [{
        qDef: {
          qFieldDefs: [dimension],
          qLabel: dimension,
          qSortCriterias: [{
            qSortByAscii: 1,
          }],
        },
      }],
      qInterColumnSortOrder: [1, 0],
      qInitialDataFetch: [{
        qTop: 0,
        qHeight: 20,
        qLeft: 0,
        qWidth: 17,
      }],
      qSuppressZero: false,
      qSuppressMissing: true,
    },
  };

  if (measure) {
    sessionObject.qHyperCubeDef.qMeasures = [{
      qDef: {
        qDef: `"${measure}"`,
        qLabel: 'Anything',
      },
      qSortBy: {
        qSortByNumeric: -1,
      },
    }];
  }

  return sessionObject;
}

exports.createObjects = async (session, OBJECTS) => {
  const app = await session.getActiveDoc();

  await Promise.all(OBJECTS.map(async (object) => {
    const qInfo = await app.createSessionObject(sessionObjectDef(object[0], object[1]))
      .then(x => x.getLayout())
      .then(layout => ({ qInfo: layout.qInfo }));
    console.log(qInfo);
  }));
};
