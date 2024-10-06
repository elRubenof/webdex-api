const dotenv = require('dotenv');
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const xlsx = require('xlsx');
const path = require('path');

dotenv.config({ path: '.env.development.local' });

const PORT = process.env.PORT ?? 8000;
const app = express();
app.use(cors());
app.disable('x-powered-by');

const coordsFilePath = path.join(__dirname, 'assets', 'coords.xlsx');

function loadCoordinates() {
  const workbook = xlsx.readFile(coordsFilePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = xlsx.utils.sheet_to_json(sheet);

  const coordinatesMap = new Map();
  data.forEach(row => {
    const key = `${row.PATH}-${row.ROW}`;
    coordinatesMap.set(key, {
      ctr_lat: row['CTR LAT'],
      ctr_lon: row['CTR LON'],
      ul_lat: row['UL LAT'],
      ul_lon: row['UL LON'],
      ur_lat: row['UR LAT'],
      ur_lon: row['UR LON'],
      ll_lat: row['LL LAT'],
      ll_lon: row['LL LON'],
      lr_lat: row['LR LAT'],
      lr_lon: row['LR LON'],
    });
  });

  return coordinatesMap;
}

const coordinatesMap = loadCoordinates();

app.get('/path', async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);

  if (isNaN(lat) || isNaN(lon)) {
    return res.status(400).json({ error: 'Invalid params.' });
  }

  const nimbusUrl = `https://nimbus.cr.usgs.gov/arcgis/rest/services/LLook_Outlines/MapServer/1/query?where=MODE=%27D%27&geometry=${lon},%20${lat}&geometryType=esriGeometryPoint&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=false&f=json`;

  const cyclesUrl = 'https://landsat.usgs.gov/sites/default/files/landsat_acq/assets/json/cycles_full.json';

  try {
    const [nimbusResponse, cyclesResponse] = await Promise.all([
      axios.get(nimbusUrl),
      axios.get(cyclesUrl),
    ]);

    const nimbusData = nimbusResponse.data;
    const cyclesData = cyclesResponse.data;

    if (nimbusData.features && nimbusData.features.length > 0) {
      const chunks = nimbusData.features.map(feature => {
        const path = feature.attributes.PATH;
        const row = feature.attributes.ROW;

        const key = `${path}-${row}`;
        const additionalCoords = coordinatesMap.get(key) || {};

        return {
          path: path,
          row: row,
          ctr_lat: additionalCoords.ctr_lat || null,
          ctr_lon: additionalCoords.ctr_lon || null,
          ul_lat: additionalCoords.ul_lat || null,
          ul_lon: additionalCoords.ul_lon || null,
          ur_lat: additionalCoords.ur_lat || null,
          ur_lon: additionalCoords.ur_lon || null,
          ll_lat: additionalCoords.ll_lat || null,
          ll_lon: additionalCoords.ll_lon || null,
          lr_lat: additionalCoords.lr_lat || null,
          lr_lon: additionalCoords.lr_lon || null,
        };
      });

      const landsatDates = {
        'Landsat 8': [],
        'Landsat 9': [],
      };

      for (const [landsatKey, dates] of Object.entries(cyclesData)) {
        const landsatNumber = landsatKey.replace('landsat_', '');

        for (const [date, data] of Object.entries(dates)) {
          const paths = data.path.split(',').map(p => parseInt(p.trim(), 10));

          const isPathIncluded = nimbusData.features.some(feature => paths.includes(feature.attributes.PATH));
          if (isPathIncluded) {
            if (landsatNumber === '8') landsatDates['Landsat 8'].push(date);
            if (landsatNumber === '9') landsatDates['Landsat 9'].push(date);
          }
        }
      }

      const result = {
        latitude: lat,
        longitude: lon,
        chunks: chunks,
        dates: landsatDates,
      };

      res.json(result);
    } else {
      res.status(404).json({ error: 'No se encontraron datos coincidentes' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener datos externos' });
  }
});

app.get('/today', async (req, res) => {
  const cyclesUrl = 'https://landsat.usgs.gov/sites/default/files/landsat_acq/assets/json/cycles_full.json';

  try {
    const today = new Date();
    const formattedDate = `${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}`;

    const cyclesResponse = await axios.get(cyclesUrl);
    const cyclesData = cyclesResponse.data;

    const results = {};

    for (const [landsatKey, dates] of Object.entries(cyclesData)) {
      const landsatNumber = landsatKey.replace('landsat_', '');

      if (dates.hasOwnProperty(formattedDate)) {
        const data = dates[formattedDate];
        const paths = data.path.split(',').map(p => parseInt(p.trim(), 10));

        const key = `Landsat ${landsatNumber}`;
        results[key] = paths;
      }
    }

    if (Object.keys(results).length > 0) {
      res.json(results);
    } else {
      res.status(404).json({ error: 'No se encontraron paths para la fecha de hoy' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener datos externos' });
  }
});

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  app.get('/search', async (req, res) => {
    try {

    const serviceUrl = 'https://m2m.cr.usgs.gov/api/api/json/stable/';

    const path = parseFloat(req.query.path);
    const row = parseFloat(req.query.row);

    const sceneSearchUrl = `${serviceUrl}scene-search`;
    const sceneSearchPayload = {
      datasetName: 'landsat_ot_c2_l2',
      sceneFilter: {
            filterType: 'and',
            childFilters: [
                {
                    filterType: 'value',
                    filterId: '5e83d15051254e26',
                    value: ' ' + path,
                    operand: '='
                },
                {
                    filterType: 'value',
                    filterId: '5e83d15038163a68',
                    value: ' ' + row,
                    operand: '='
                }
            ]
        }
    };

    const sceneSearchResponse = await axios.post(sceneSearchUrl, sceneSearchPayload, {
      headers: {
        'Content-Type': 'application/json',
        'X-Auth-Token': 'eyJjaWQiOjI3Mjk3MTkyLCJzIjoiMTcyODIwMTQ1OSIsInIiOjM0OSwicCI6WyJ1c2VyIl19'
      }
    });

    res.json(sceneSearchResponse.data);
  } catch (error) {
    console.error('Error al realizar la búsqueda de escenas:', error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'Error al realizar la búsqueda de escenas' });
  }
});

app.post('/', (req, res) => {
  res.send('POST');
});

app.use((req, res) => {
  res.statusCode = 404;
  res
    .setHeader('content', 'text/plain; charset=utf8')
    .send('404 Not Found');
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

module.exports = app;