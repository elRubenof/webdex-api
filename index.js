const dotenv = require('dotenv')
const express = require('express')

dotenv.config({ path: '.env.development.local' })

const PORT = process.env.PORT ?? 8000
const app = express()
app.disable('x-powered-by')

app.get('/', (req, res) => {
  res.send('GET')
})

app.post('/', (req, res) => {
  res.send('POST')
})

app.use((req, res) => {
  res.statusCode = 404
  res.setHeader('content', 'text/plain; chatset=utf8').send('404 Not Found')
})

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`)
})

module.exports = app