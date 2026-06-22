import 'dotenv/config'
import http from 'http'
import app from './app.js'
import { env, isPaymentEncryptionConfigured } from './config/env.js'
import { initSocketServer } from './websocket/index.js'

const httpServer = http.createServer(app)
initSocketServer(httpServer)

if (!isPaymentEncryptionConfigured()) {
  console.warn(
    '[env] PAYMENT_ENCRYPTION_KEY is not set — saving Razorpay keys in the merchant app will fail until this is configured on the server.'
  )
}

httpServer.listen(env.PORT, () => {
  console.log(`Server running on port ${env.PORT}`)
})
