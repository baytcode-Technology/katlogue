import { env } from '../config/env.js'

function getServerUrl(): string {
  if (process.env.API_PUBLIC_URL?.trim()) {
    return process.env.API_PUBLIC_URL.trim().replace(/\/$/, '')
  }
  if (process.env.RAILWAY_PUBLIC_DOMAIN?.trim()) {
    return `https://${process.env.RAILWAY_PUBLIC_DOMAIN.trim()}`
  }
  return `http://localhost:${env.PORT}`
}

const errorResponse = {
  type: 'object' as const,
  properties: {
    success: { type: 'boolean', example: false },
    error: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        code: { type: 'string' },
      },
    },
  },
}

export function buildOpenApiDocument() {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Katlogue API',
      version: '1.0.0',
      description:
        'Merchant and storefront API for Katlogue. Authenticated routes require `Authorization: Bearer <access_token>` from `/api/auth/verify`. Public storefront routes resolve the store via subdomain host or `X-Store-Slug` header.',
    },
    servers: [{ url: getServerUrl() }],
    tags: [
      { name: 'Health', description: 'Service health' },
      { name: 'Auth', description: 'Email OTP sign-in' },
      { name: 'Stores', description: 'Merchant store management' },
      { name: 'Products', description: 'Product catalog (merchant)' },
      { name: 'Categories', description: 'Categories (merchant)' },
      { name: 'Public', description: 'Storefront (guest) — requires store context' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Access token from POST /api/auth/verify',
        },
      },
      schemas: {
        ErrorResponse: errorResponse,
        SignInBody: {
          type: 'object',
          required: ['email'],
          properties: {
            email: { type: 'string', format: 'email', example: 'merchant@example.com' },
          },
        },
        VerifyOtpBody: {
          type: 'object',
          required: ['email', 'otp'],
          properties: {
            email: { type: 'string', format: 'email' },
            otp: { type: 'string', minLength: 6, maxLength: 8, example: '123456' },
          },
        },
        CreateStoreBody: {
          type: 'object',
          required: ['name', 'slug', 'whatsapp_number', 'currency'],
          properties: {
            name: { type: 'string', maxLength: 200, example: 'My Shop' },
            slug: { type: 'string', minLength: 3, maxLength: 63, example: 'my-shop' },
            whatsapp_number: { type: 'string', example: '+919876543210' },
            currency: { type: 'string', minLength: 3, maxLength: 3, example: 'INR' },
            description: { type: 'string', nullable: true },
            logo_url: { type: 'string', format: 'uri', nullable: true },
            banner_url: { type: 'string', format: 'uri', nullable: true },
            timezone: { type: 'string', example: 'Asia/Kolkata' },
            ai_language: { type: 'string', nullable: true, example: 'en' },
            ai_system_prompt: { type: 'string', nullable: true },
            industry: { type: 'string', nullable: true, example: 'Fashion' },
          },
        },
        CreateProductBody: {
          type: 'object',
          required: ['store_id', 'name', 'base_price'],
          properties: {
            store_id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            base_price: { type: 'number', minimum: 0 },
            category_id: { type: 'string', format: 'uuid' },
            description: { type: 'string' },
            sku: { type: 'string' },
            track_inventory: { type: 'boolean' },
            stock_qty: { type: 'integer', minimum: 0 },
            images: { type: 'array', items: { type: 'string', format: 'uri' } },
            is_active: { type: 'boolean' },
            variants: { type: 'array', items: { type: 'object' } },
          },
        },
        CreateCategoryBody: {
          type: 'object',
          required: ['store_id', 'name', 'slug'],
          properties: {
            store_id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            slug: { type: 'string' },
            parent_id: { type: 'string', format: 'uuid' },
            image_url: { type: 'string', format: 'uri' },
            sort_order: { type: 'integer' },
            is_active: { type: 'boolean' },
          },
        },
        CreateOrderBody: {
          type: 'object',
          required: ['whatsapp_number', 'items', 'payment_method', 'shipping_address'],
          properties: {
            whatsapp_number: { type: 'string' },
            name: { type: 'string' },
            email: { type: 'string', format: 'email' },
            items: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                required: ['product_id', 'quantity'],
                properties: {
                  product_id: { type: 'string', format: 'uuid' },
                  quantity: { type: 'integer', minimum: 1 },
                  variant_id: { type: 'string', format: 'uuid' },
                },
              },
            },
            payment_method: { type: 'string', enum: ['razorpay', 'cod'] },
            shipping_address: {
              type: 'object',
              required: [
                'name',
                'phone_number',
                'whatsapp_number',
                'postcode',
                'city',
                'district',
                'state',
                'region',
              ],
              properties: {
                name: { type: 'string' },
                phone_number: { type: 'string' },
                whatsapp_number: { type: 'string' },
                postcode: { type: 'string' },
                city: { type: 'string' },
                district: { type: 'string' },
                state: { type: 'string' },
                region: { type: 'string' },
              },
            },
            notes: { type: 'string' },
          },
        },
      },
    },
    paths: {
      '/': {
        get: {
          tags: ['Health'],
          summary: 'Health check',
          responses: {
            '200': {
              description: 'API is running',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      message: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/auth/signin': {
        post: {
          tags: ['Auth'],
          summary: 'Send sign-in OTP',
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/SignInBody' } },
            },
          },
          responses: {
            '200': { description: 'OTP sent' },
            '400': { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
      },
      '/api/auth/verify': {
        post: {
          tags: ['Auth'],
          summary: 'Verify OTP and get tokens',
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/VerifyOtpBody' } },
            },
          },
          responses: {
            '200': { description: 'Returns access and refresh tokens' },
            '400': { description: 'Invalid OTP' },
          },
        },
      },
      '/api/stores/me': {
        get: {
          tags: ['Stores'],
          summary: 'Get current user store',
          security: [{ bearerAuth: [] }],
          responses: {
            '200': { description: 'Store or hasStore: false' },
            '401': { description: 'Unauthorized' },
          },
        },
      },
      '/api/stores': {
        post: {
          tags: ['Stores'],
          summary: 'Create store',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/CreateStoreBody' } },
            },
          },
          responses: {
            '201': { description: 'Store created' },
            '409': { description: 'Slug or WhatsApp already exists' },
          },
        },
      },
      '/api/products': {
        post: {
          tags: ['Products'],
          summary: 'Create product',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/CreateProductBody' } },
            },
          },
          responses: { '201': { description: 'Product created' } },
        },
      },
      '/api/products/{productId}': {
        patch: {
          tags: ['Products'],
          summary: 'Update product (partial)',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'productId',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object' } } },
          },
          responses: { '200': { description: 'Product updated' } },
        },
      },
      '/api/categories': {
        get: {
          tags: ['Categories'],
          summary: 'List categories',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'store_id',
              in: 'query',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          responses: { '200': { description: 'Category list' } },
        },
        post: {
          tags: ['Categories'],
          summary: 'Create category',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/CreateCategoryBody' } },
            },
          },
          responses: { '201': { description: 'Category created' } },
        },
      },
      '/api/public/store': {
        get: {
          tags: ['Public'],
          summary: 'Get public store info',
          description: 'Requires store subdomain host or `X-Store-Slug` header.',
          parameters: [
            {
              name: 'X-Store-Slug',
              in: 'header',
              schema: { type: 'string' },
              description: 'Store slug when not using subdomain',
            },
          ],
          responses: { '200': { description: 'Public store' }, '404': { description: 'Store not found' } },
        },
      },
      '/api/public/catalog': {
        get: {
          tags: ['Public'],
          summary: 'Get storefront catalog',
          parameters: [
            { name: 'X-Store-Slug', in: 'header', schema: { type: 'string' } },
            { name: 'category_id', in: 'query', schema: { type: 'string', format: 'uuid' } },
            {
              name: 'sort',
              in: 'query',
              schema: {
                type: 'string',
                enum: ['default', 'name_asc', 'name_desc', 'price_asc', 'price_desc'],
              },
            },
            { name: 'min_price', in: 'query', schema: { type: 'number' } },
            { name: 'max_price', in: 'query', schema: { type: 'number' } },
          ],
          responses: { '200': { description: 'Catalog' } },
        },
      },
      '/api/public/categories': {
        get: {
          tags: ['Public'],
          summary: 'List public categories',
          parameters: [{ name: 'X-Store-Slug', in: 'header', schema: { type: 'string' } }],
          responses: { '200': { description: 'Categories' } },
        },
      },
      '/api/public/products': {
        get: {
          tags: ['Public'],
          summary: 'List public products',
          parameters: [{ name: 'X-Store-Slug', in: 'header', schema: { type: 'string' } }],
          responses: { '200': { description: 'Products' } },
        },
      },
      '/api/public/orders': {
        post: {
          tags: ['Public'],
          summary: 'Create guest order',
          parameters: [{ name: 'X-Store-Slug', in: 'header', schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/CreateOrderBody' } },
            },
          },
          responses: { '201': { description: 'Order created' } },
        },
      },
    },
  }
}
