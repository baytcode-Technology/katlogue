import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import { setupApiDocs } from './openapi/setup-docs.js'
import { authRoutes } from './modules/auth/index.js'
import { storeRoutes } from './modules/stores/index.js'
import { productRoutes } from './modules/products/index.js'
import { categoryRoutes } from './modules/categories/index.js'
import { publicRoutes } from './modules/storefront/index.js'
import { uploadRoutes } from './modules/uploads/index.js'
import { orderRoutes } from './modules/orders/index.js'
import { customerRoutes } from './modules/customers/index.js'
import { instagramRoutes, instagramWebhookRoutes } from './modules/instagram/index.js'
import { whatsappRoutes, whatsappWebhookRoutes } from './modules/whatsapp/index.js'
import { errorMiddleware } from './shared/middleware/error.middleware.js'

const app = express()

setupApiDocs(app)

app.use(cors())
app.use(helmet())
app.use(morgan('dev'))

// WhatsApp webhook needs raw body parsing for signature verification.
// It installs its own raw parser in the router.
app.use('/api/webhooks/whatsapp', whatsappWebhookRoutes)
app.use('/api/webhooks/instagram', instagramWebhookRoutes)
// Meta-friendly alias (configure either URL in Meta Developer Console)
app.use('/webhook', whatsappWebhookRoutes)

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
app.use('/api/products', productRoutes)
app.use('/api/categories', categoryRoutes)
app.use('/api/uploads', uploadRoutes)
app.use('/api/orders', orderRoutes)
app.use('/api/customers', customerRoutes)
app.use('/api/whatsapp', whatsappRoutes)
app.use('/api/instagram', instagramRoutes)
app.use('/api/public', publicRoutes)

app.use(errorMiddleware)

export default app
