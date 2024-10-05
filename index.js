const dotenv = require('dotenv')
const express = require('express')
const axios = require('axios')

dotenv.config({ path: '.env.development.local' })

const PORT = process.env.PORT ?? 8000
const app = express()
app.disable('x-powered-by')

app.get('/test', async (req, res) => {
  const lat = parseFloat(req.query.lat)
  const lon = parseFloat(req.query.lon)

  if (isNaN(lat) || isNaN(lon)) {
    return res.status(400).json({ error: 'Invalid params.' })
  }

  const nimbusUrl = `https://nimbus.cr.usgs.gov/arcgis/rest/services/LLook_Outlines/MapServer/1/query?where=MODE=%27D%27&geometry=${lon},%20${lat}&geometryType=esriGeometryPoint&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=false&f=json`

  const cyclesUrl = 'https://landsat.usgs.gov/sites/default/files/landsat_acq/assets/json/cycles_full.json'

  try {
    
    const [nimbusResponse, cyclesResponse] = await Promise.all([
      axios.get(nimbusUrl),
      axios.get(cyclesUrl)
    ])

    const nimbusData = nimbusResponse.data
    const cyclesData = cyclesResponse.data

    if (nimbusData.features && nimbusData.features.length > 0) {
      const results = nimbusData.features.map(feature => {
        const path = feature.attributes.PATH
        const row = feature.attributes.ROW

        const landsats = []

        for (const [landsatKey, dates] of Object.entries(cyclesData)) {
          const landsatNumber = landsatKey.replace('landsat_', '')

          for (const [date, data] of Object.entries(dates)) {
            const paths = data.path.split(',').map(p => parseInt(p.trim(), 10))

            if (paths.includes(path)) {
              let landsatEntry = landsats.find(l => l.landsat === parseInt(landsatNumber, 10))

              if (!landsatEntry) {
                landsatEntry = {
                  landsat: parseInt(landsatNumber, 10),
                  dates: []
                }
                landsats.push(landsatEntry)
              }

              if (!landsatEntry.dates.includes(date)) {
                landsatEntry.dates.push(date)
              }
            }
          }
        }

        return {
          path: path,
          row: row,
          landsats: landsats
        }
      })

      res.json(results)
    } else {
      res.status(404).json({ error: 'No se encontraron datos coincidentes' })
    }
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Error al obtener datos externos' })
  }
})

app.post('/', (req, res) => {
  res.send('POST')
})

app.use((req, res) => {
  res.statusCode = 404
  res
    .setHeader('content', 'text/plain; charset=utf8')
    .send('404 Not Found')
})

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`)
})

module.exports = app