import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import { setupApiDocs } from './openapi/setup-docs.js'
import { authRoutes } from './modules/auth/index.js'
import { storeRoutes } from './modules/stores/index.js'
import { productRoutes } from './modules/products/index.js'
import { categoryRoutes } from './modules/categories/index.js'
import { industryRoutes } from './modules/industries/index.js'
import { publicRoutes } from './modules/storefront/index.js'
import { uploadRoutes } from './modules/uploads/index.js'
import { orderRoutes } from './modules/orders/index.js'
import { paymentConfigRoutes } from './modules/payments/index.js'
import razorpayWebhookRoutes from './modules/payments/routes/razorpay-webhook.routes.js'
import { customerRoutes } from './modules/customers/index.js'
import { instagramRoutes } from './modules/instagram/index.js'
import metaWebhookRoutes from './modules/meta/routes/meta-webhook.routes.js'
import { whatsappRoutes } from './modules/whatsapp/index.js'
import { errorMiddleware } from './shared/middleware/error.middleware.js'

const app = express()

setupApiDocs(app)

app.use(cors())
app.use(helmet())
app.use(morgan('dev'))

// Meta webhooks need raw body for signature verification (router installs raw parser).
// All paths share one dispatcher so Instagram DMs work whether Meta hits /webhook or /api/webhooks/instagram.
app.use('/api/webhooks/whatsapp', metaWebhookRoutes)
app.use('/api/webhooks/instagram', metaWebhookRoutes)
app.use('/webhook', metaWebhookRoutes)

app.use('/api/webhooks/razorpay', razorpayWebhookRoutes)

app.use(express.json())

app.get('/', (_req, res) => {
  res.json({
    success: true,
    message: 'Katlog API Running',
    /** Present on Railway — compare with GitHub commit to confirm deploy */
    deploy:
      process.env.RAILWAY_GIT_COMMIT_SHA || process.env.RAILWAY_GIT_BRANCH
        ? {
            commit: process.env.RAILWAY_GIT_COMMIT_SHA ?? null,
            branch: process.env.RAILWAY_GIT_BRANCH ?? null,
          }
        : undefined,
  })
})

app.use('/api/auth', authRoutes)
app.use('/api/stores', storeRoutes)
app.use('/api/stores', paymentConfigRoutes)
app.use('/api/products', productRoutes)
app.use('/api/categories', categoryRoutes)
app.use('/api/industries', industryRoutes)
app.use('/api/uploads', uploadRoutes)
app.use('/api/orders', orderRoutes)
app.use('/api/customers', customerRoutes)
app.use('/api/whatsapp', whatsappRoutes)
app.use('/api/instagram', instagramRoutes)
app.use('/api/public', publicRoutes)

app.use(errorMiddleware)

export default app
