import type { Express } from 'express'
import { apiReference } from '@scalar/express-api-reference'
import { buildOpenApiDocument } from './document.js'

export function setupApiDocs(app: Express) {
  app.get('/openapi.json', (_req, res) => {
    res.json(buildOpenApiDocument())
  })

  app.use(
    '/docs',
    apiReference({
      theme: 'purple',
      spec: {
        url: '/openapi.json',
      },
    })
  )
}
