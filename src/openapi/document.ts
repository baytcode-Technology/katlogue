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
      version: '1.1.0',
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
        Category: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            store_id: { type: 'string', format: 'uuid' },
            parent_id: { type: 'string', format: 'uuid', nullable: true },
            name: { type: 'string', example: 'Electronics' },
            slug: { type: 'string', example: 'electronics' },
            image_url: { type: 'string', format: 'uri', nullable: true },
            sort_order: { type: 'integer', example: 0 },
            is_active: { type: 'boolean', example: true },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        Product: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            store_id: { type: 'string', format: 'uuid' },
            category_id: { type: 'string', format: 'uuid', nullable: true },
            name: { type: 'string', example: 'Premium Headphones' },
            description: { type: 'string', nullable: true },
            sku: { type: 'string', nullable: true },
            base_price: { type: 'number', example: 299 },
            compare_at_price: { type: 'number', nullable: true },
            track_inventory: { type: 'boolean' },
            stock_qty: { type: 'integer', example: 45 },
            images: { type: 'array', items: { type: 'string', format: 'uri' } },
            thumbnail_url: { type: 'string', format: 'uri', nullable: true },
            is_active: { type: 'boolean' },
            sort_order: { type: 'integer' },
            metadata: { type: 'object', additionalProperties: true },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        CatalogData: {
          type: 'object',
          required: ['categories', 'products'],
          description:
            'Always returns all active categories. Products are filtered when category_id or product_id is provided.',
          properties: {
            categories: {
              type: 'array',
              items: { $ref: '#/components/schemas/Category' },
            },
            products: {
              type: 'array',
              items: { $ref: '#/components/schemas/Product' },
            },
          },
        },
        CatalogSuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Catalog fetched successfully' },
            data: { $ref: '#/components/schemas/CatalogData' },
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
        get: {
          tags: ['Products'],
          summary: 'List products (merchant)',
          description: 'Requires Bearer token. Returns all products for the given store.',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'store_id',
              in: 'query',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          responses: {
            '200': {
              description: 'Product list',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      message: { type: 'string' },
                      data: {
                        type: 'object',
                        properties: {
                          store_id: { type: 'string', format: 'uuid' },
                          products: {
                            type: 'array',
                            items: { $ref: '#/components/schemas/Product' },
                          },
                          count: { type: 'integer' },
                        },
                      },
                    },
                  },
                },
              },
            },
            '401': {
              description: 'Unauthorized',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
          },
        },
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
          description: [
            'Returns a single catalog shape:',
            '',
            '- **categories**: always all active categories for the store (empty array if none).',
            '- **products**: all active products by default.',
            '',
            '**Filters (products only):**',
            '- `category_id` — only products in that category.',
            '- `product_id` — only that one product (array length 1).',
            '',
            'Requires store via subdomain or `X-Store-Slug` header.',
          ].join('\n'),
          parameters: [
            {
              name: 'X-Store-Slug',
              in: 'header',
              schema: { type: 'string', example: 'my-shop' },
              description: 'Required when not calling from a store subdomain',
            },
            {
              name: 'category_id',
              in: 'query',
              schema: { type: 'string', format: 'uuid' },
              description: 'Filter products to this category only',
            },
            {
              name: 'product_id',
              in: 'query',
              schema: { type: 'string', format: 'uuid' },
              description: 'Return only this product in the products array',
            },
            {
              name: 'sort',
              in: 'query',
              schema: {
                type: 'string',
                enum: ['default', 'name_asc', 'name_desc', 'price_asc', 'price_desc'],
                default: 'default',
              },
            },
            { name: 'min_price', in: 'query', schema: { type: 'number', minimum: 0 } },
            { name: 'max_price', in: 'query', schema: { type: 'number', minimum: 0 } },
          ],
          responses: {
            '200': {
              description: 'Catalog fetched successfully',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/CatalogSuccessResponse' },
                  examples: {
                    fullCatalog: {
                      summary: 'All categories and products',
                      value: {
                        success: true,
                        message: 'Catalog fetched successfully',
                        data: {
                          categories: [
                            {
                              id: '11111111-1111-1111-1111-111111111111',
                              store_id: '22222222-2222-2222-2222-222222222222',
                              parent_id: null,
                              name: 'Electronics',
                              slug: 'electronics',
                              image_url: null,
                              sort_order: 0,
                              is_active: true,
                              created_at: '2026-05-19T10:00:00.000Z',
                            },
                          ],
                          products: [
                            {
                              id: '33333333-3333-3333-3333-333333333333',
                              store_id: '22222222-2222-2222-2222-222222222222',
                              category_id: '11111111-1111-1111-1111-111111111111',
                              name: 'Premium Headphones',
                              description: 'Wireless noise cancelling',
                              sku: 'SKU-001',
                              base_price: 299,
                              compare_at_price: 399,
                              track_inventory: true,
                              stock_qty: 45,
                              images: [],
                              thumbnail_url: null,
                              is_active: true,
                              sort_order: 0,
                              metadata: {},
                              created_at: '2026-05-19T10:00:00.000Z',
                              updated_at: '2026-05-19T10:00:00.000Z',
                            },
                          ],
                        },
                      },
                    },
                    singleProduct: {
                      summary: 'With product_id — one product, all categories',
                      value: {
                        success: true,
                        message: 'Catalog fetched successfully',
                        data: {
                          categories: [
                            {
                              id: '11111111-1111-1111-1111-111111111111',
                              store_id: '22222222-2222-2222-2222-222222222222',
                              parent_id: null,
                              name: 'Electronics',
                              slug: 'electronics',
                              image_url: null,
                              sort_order: 0,
                              is_active: true,
                              created_at: '2026-05-19T10:00:00.000Z',
                            },
                          ],
                          products: [
                            {
                              id: '33333333-3333-3333-3333-333333333333',
                              store_id: '22222222-2222-2222-2222-222222222222',
                              category_id: '11111111-1111-1111-1111-111111111111',
                              name: 'Premium Headphones',
                              description: null,
                              sku: null,
                              base_price: 299,
                              compare_at_price: null,
                              track_inventory: false,
                              stock_qty: 0,
                              images: [],
                              thumbnail_url: null,
                              is_active: true,
                              sort_order: 0,
                              metadata: {},
                              created_at: '2026-05-19T10:00:00.000Z',
                              updated_at: '2026-05-19T10:00:00.000Z',
                            },
                          ],
                        },
                      },
                    },
                    categoryFilter: {
                      summary: 'With category_id — filtered products',
                      value: {
                        success: true,
                        message: 'Catalog fetched successfully',
                        data: {
                          categories: [
                            {
                              id: '11111111-1111-1111-1111-111111111111',
                              store_id: '22222222-2222-2222-2222-222222222222',
                              parent_id: null,
                              name: 'Electronics',
                              slug: 'electronics',
                              image_url: null,
                              sort_order: 0,
                              is_active: true,
                              created_at: '2026-05-19T10:00:00.000Z',
                            },
                          ],
                          products: [],
                        },
                      },
                    },
                  },
                },
              },
            },
            '404': {
              description: 'Store, category, or product not found',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
          },
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
