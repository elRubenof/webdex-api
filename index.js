const express = require('express')
const app = express()

const PORT = process.env.PORT ?? 8000

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