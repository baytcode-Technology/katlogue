import 'dotenv/config'
import http from 'http'
import app from './app.js'
import { env } from './config/env.js'
import { initSocketServer } from './websocket/index.js'

const httpServer = http.createServer(app)
initSocketServer(httpServer)

httpServer.listen(env.PORT, () => {
  console.log(`Server running on port ${env.PORT}`)
})
