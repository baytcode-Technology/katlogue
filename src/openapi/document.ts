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
      version: '1.2.0',
      description:
        'Merchant and storefront API for Katlogue. Authenticated routes require `Authorization: Bearer <access_token>` from `/api/auth/verify` or Google sign-in. Public storefront routes resolve the store via subdomain host (e.g. ghu.yourdomain.com) or the `X-Store-Slug` header when calling the API host directly (e.g. Railway). Interactive docs: `/docs` · OpenAPI JSON: `/openapi.json`.',
    },
    servers: [{ url: getServerUrl() }],
    tags: [
      { name: 'Health', description: 'Service health' },
      { name: 'Auth', description: 'Email OTP sign-in' },
      { name: 'Stores', description: 'Merchant store management' },
      { name: 'Products', description: 'Product catalog (merchant)' },
      { name: 'Categories', description: 'Categories (merchant)' },
      { name: 'Uploads', description: 'File uploads (merchant)' },
      { name: 'Orders', description: 'Order management (merchant)' },
      { name: 'Customers', description: 'Customer records (merchant)' },
      { name: 'WhatsApp', description: 'WhatsApp Cloud API integration (merchant)' },
      { name: 'Public', description: 'Storefront (guest) — no auth; requires store context' },
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
        GoogleSignInBody: {
          type: 'object',
          required: ['idToken'],
          properties: {
            idToken: { type: 'string', description: 'Google ID token from native or web sign-in' },
          },
        },
        GoogleCodeExchangeBody: {
          type: 'object',
          required: ['code', 'redirectUri', 'codeVerifier'],
          properties: {
            code: { type: 'string' },
            redirectUri: { type: 'string', format: 'uri' },
            codeVerifier: { type: 'string', description: 'PKCE code verifier' },
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
        UpdateStoreBody: {
          type: 'object',
          description: 'Partial update — include only fields to change',
          properties: {
            name: { type: 'string', maxLength: 200 },
            slug: { type: 'string', minLength: 3, maxLength: 63 },
            whatsapp_number: { type: 'string' },
            currency: { type: 'string', minLength: 3, maxLength: 3 },
            description: { type: 'string', nullable: true },
            logo_url: { type: 'string', format: 'uri', nullable: true },
            banner_url: { type: 'string', format: 'uri', nullable: true },
            timezone: { type: 'string' },
            industry: { type: 'string', nullable: true },
            ai_language: { type: 'string', nullable: true },
            ai_system_prompt: { type: 'string', nullable: true },
            is_active: { type: 'boolean' },
          },
        },
        CreateProductBody: {
          type: 'object',
          required: ['store_id', 'name', 'base_price', 'images', 'thumbnail_url'],
          properties: {
            store_id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            base_price: { type: 'number', minimum: 0 },
            category_id: { type: 'string', format: 'uuid' },
            description: { type: 'string' },
            sku: { type: 'string' },
            track_inventory: { type: 'boolean' },
            stock_qty: { type: 'integer', minimum: 0 },
            images: {
              type: 'array',
              minItems: 1,
              items: { type: 'string', format: 'uri' },
              description: 'At least one image URL (from POST /api/uploads/product-images)',
            },
            thumbnail_url: {
              type: 'string',
              format: 'uri',
              description: 'Required; must be one of the image URLs',
            },
            is_active: { type: 'boolean' },
            variants: { type: 'array', items: { type: 'object' } },
          },
        },
        CreateCategoryBody: {
          type: 'object',
          required: ['store_id', 'name'],
          properties: {
            store_id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            parent_id: { type: 'string', format: 'uuid' },
            image_url: { type: 'string', format: 'uri', nullable: true },
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
            status: {
              type: 'string',
              enum: ['active', 'draft', 'unlisted'],
              example: 'active',
            },
            is_active: { type: 'boolean' },
            mark_as_sold: { type: 'boolean', example: false },
            mark_as_non_inventory: { type: 'boolean', example: false },
            sort_order: { type: 'integer' },
            metadata: { type: 'object', additionalProperties: true },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        ProductVariant: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            product_id: { type: 'string', format: 'uuid' },
            name: { type: 'string', example: 'Large / Red' },
            options: { type: 'object', additionalProperties: true },
            price_delta: { type: 'number', example: 50 },
            compare_at_price: { type: 'number', nullable: true },
            stock_qty: { type: 'integer', example: 10 },
            mark_as_sold: { type: 'boolean', example: false },
            mark_as_non_inventory: { type: 'boolean', example: false },
            sku: { type: 'string', nullable: true },
            image_url: { type: 'string', format: 'uri', nullable: true },
            is_active: { type: 'boolean', example: true },
            sort_order: { type: 'integer' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        Order: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            store_id: { type: 'string', format: 'uuid' },
            customer_id: { type: 'string', format: 'uuid', nullable: true },
            conversation_id: { type: 'string', format: 'uuid', nullable: true },
            order_number: {
              type: 'string',
              example: 'JUN26-1',
              description: 'Per-store monthly sequence, e.g. JUN26-1',
            },
            order_status: {
              type: 'string',
              enum: ['pending', 'confirmed', 'completed', 'cancelled'],
            },
            payment_status: {
              type: 'string',
              enum: ['pending', 'confirming', 'paid', 'refunded'],
            },
            fulfillment_status: {
              type: 'string',
              enum: ['unfulfilled', 'ready', 'fulfilled'],
            },
            source: { type: 'string', example: 'offline' },
            subtotal: { type: 'number' },
            discount_amount: { type: 'number' },
            shipping_fee: { type: 'number' },
            tax_amount: { type: 'number' },
            total: { type: 'number' },
            shipping_address: { type: 'object', additionalProperties: true },
            notes: { type: 'string', nullable: true },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        UpdateOrderBody: {
          type: 'object',
          required: ['store_id'],
          properties: {
            store_id: { type: 'string', format: 'uuid' },
            order_status: {
              type: 'string',
              enum: ['pending', 'confirmed', 'completed', 'cancelled'],
            },
            payment_status: {
              type: 'string',
              enum: ['pending', 'confirming', 'paid', 'refunded'],
            },
            fulfillment_status: {
              type: 'string',
              enum: ['unfulfilled', 'ready', 'fulfilled'],
            },
          },
          description: 'At least one status field is required.',
        },
        Customer: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            store_id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            email: { type: 'string', format: 'email', nullable: true },
            phone: { type: 'string', nullable: true },
            whatsapp_number: { type: 'string', nullable: true },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        CreateCustomerBody: {
          type: 'object',
          required: ['store_id', 'name'],
          properties: {
            store_id: { type: 'string', format: 'uuid' },
            name: { type: 'string', maxLength: 200 },
            email: { type: 'string', format: 'email' },
            phone: { type: 'string' },
          },
        },
        WhatsAppSendMessageBody: {
          type: 'object',
          required: ['message'],
          properties: {
            store_id: { type: 'string', format: 'uuid' },
            conversation_id: { type: 'string', format: 'uuid' },
            to: { type: 'string', example: '919876543210' },
            message: { type: 'string', maxLength: 4096 },
          },
        },
        WhatsAppSyncBody: {
          type: 'object',
          properties: {
            store_id: { type: 'string', format: 'uuid' },
          },
        },
        CatalogVariant: {
          allOf: [
            { $ref: '#/components/schemas/ProductVariant' },
            {
              type: 'object',
              required: ['sold_out'],
              properties: {
                sold_out: {
                  type: 'boolean',
                  description:
                    'True when the variant cannot be purchased (marked sold, or tracked inventory with stock_qty < 1).',
                  example: false,
                },
              },
            },
          ],
        },
        CatalogProduct: {
          allOf: [
            { $ref: '#/components/schemas/Product' },
            {
              type: 'object',
              required: ['variants', 'sold_out'],
              properties: {
                sold_out: {
                  type: 'boolean',
                  description:
                    'True when the product cannot be purchased. For variant products, true only when every active variant is sold out.',
                  example: false,
                },
                variants: {
                  type: 'array',
                  description:
                    'All active variants for this product, including sold-out variants. Empty array when the product has no variants.',
                  items: { $ref: '#/components/schemas/CatalogVariant' },
                },
              },
            },
          ],
        },
        CatalogData: {
          type: 'object',
          required: ['categories', 'products'],
          description:
            'Always returns all active categories. Products are filtered when category_id or product_id is provided. Each active product is included even when sold out; use sold_out on the product and variants to disable purchase in the storefront UI.',
          properties: {
            categories: {
              type: 'array',
              items: { $ref: '#/components/schemas/Category' },
            },
            products: {
              type: 'array',
              items: { $ref: '#/components/schemas/CatalogProduct' },
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
        NotificationPreferences: {
          type: 'object',
          properties: {
            chats: { type: 'boolean', example: true },
            online_orders: { type: 'boolean', example: true },
            pos_orders: { type: 'boolean', example: true },
            sound_id: {
              type: 'string',
              enum: ['default', 'chime', 'bell', 'ping', 'alert', 'soft', 'bright', 'pulse'],
              example: 'default',
            },
          },
        },
        UpdateNotificationPreferencesBody: {
          type: 'object',
          properties: {
            chats: { type: 'boolean' },
            online_orders: { type: 'boolean' },
            pos_orders: { type: 'boolean' },
            sound_id: {
              type: 'string',
              enum: ['default', 'chime', 'bell', 'ping', 'alert', 'soft', 'bright', 'pulse'],
            },
          },
        },
        UpsertPushTokenBody: {
          type: 'object',
          required: ['expo_push_token', 'platform'],
          properties: {
            expo_push_token: { type: 'string' },
            platform: { type: 'string', enum: ['ios', 'android', 'web'] },
            sound_channel_id: { type: 'string' },
          },
        },
        CreateOrderBody: {
          type: 'object',
          required: ['items'],
          description:
            'Guest checkout (POST /api/public/orders): `items` required. Merchant POS (POST /api/orders): `store_id` + `items` required; set `offline: true` for walk-in orders.',
          properties: {
            store_id: {
              type: 'string',
              format: 'uuid',
              description: 'Required for merchant POST /api/orders',
            },
            customer_id: {
              type: 'string',
              format: 'uuid',
              description: 'Optional linked customer (merchant orders)',
            },
            whatsapp_number: { type: 'string', nullable: true },
            name: { type: 'string', nullable: true },
            email: { type: 'string', format: 'email', nullable: true },
            items: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                required: ['product_id', 'quantity'],
                properties: {
                  product_id: { type: 'string', format: 'uuid' },
                  quantity: { type: 'integer', minimum: 1 },
                  variant_id: {
                    type: 'string',
                    format: 'uuid',
                    description: 'Required when the product has variants',
                  },
                },
              },
            },
            payment_method: {
              type: 'string',
              enum: ['razorpay', 'cod'],
              default: 'cod',
            },
            offline: {
              type: 'boolean',
              default: false,
              description:
                'Merchant POS mode: allow oversell and negative inventory. Online orders should omit or set false.',
            },
            shipping_address: {
              type: 'object',
              description: 'All address fields optional',
              properties: {
                name: { type: 'string' },
                phone_number: { type: 'string' },
                whatsapp_number: { type: 'string' },
                address: { type: 'string', description: 'Street / house line' },
                postcode: { type: 'string' },
                city: { type: 'string' },
                district: { type: 'string' },
                state: { type: 'string' },
                region: { type: 'string' },
              },
            },
            notes: { type: 'string', nullable: true },
            conversation_id: { type: 'string', format: 'uuid', nullable: true },
          },
        },
        StorefrontCreateOrderBody: {
          type: 'object',
          required: ['items', 'payment_method', 'shipping_address'],
          properties: {
            whatsapp_number: {
              type: 'string',
              description: 'Optional if shipping_address.phone_number is set',
            },
            name: { type: 'string', nullable: true },
            email: { type: 'string', format: 'email', nullable: true },
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
            payment_method: { type: 'string', enum: ['razorpay', 'cod', 'upi'] },
            shipping_address: {
              type: 'object',
              required: [
                'name',
                'phone_number',
                'address',
                'city',
                'district',
                'state',
                'postcode',
              ],
              properties: {
                name: { type: 'string' },
                phone_number: { type: 'string' },
                address: { type: 'string' },
                city: { type: 'string' },
                district: { type: 'string' },
                state: { type: 'string' },
                postcode: { type: 'string' },
              },
            },
            notes: { type: 'string', nullable: true },
          },
        },
        PublicCustomerByPhone: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string', nullable: true },
            phone_number: { type: 'string' },
            shipping_addresses: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  name: { type: 'string' },
                  phone_number: { type: 'string' },
                  address: { type: 'string' },
                  city: { type: 'string' },
                  district: { type: 'string' },
                  state: { type: 'string' },
                  postcode: { type: 'string' },
                  created_at: { type: 'string', format: 'date-time' },
                },
              },
            },
            orders: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  order_number: { type: 'string' },
                  total: { type: 'number' },
                  created_at: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
        },
        WhatsAppSendTemplateBody: {
          type: 'object',
          required: ['to', 'templateName'],
          properties: {
            to: {
              type: 'string',
              description: 'Recipient number in digits-only form (no +).',
              example: '919876543210',
            },
            templateName: { type: 'string', example: 'hello_world' },
            languageCode: { type: 'string', example: 'en_US' },
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
      '/api/auth/google': {
        post: {
          tags: ['Auth'],
          summary: 'Sign in with Google ID token',
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/GoogleSignInBody' } },
            },
          },
          responses: {
            '200': { description: 'Returns access and refresh tokens' },
            '400': { description: 'Google sign-in failed' },
          },
        },
      },
      '/api/auth/google/code': {
        post: {
          tags: ['Auth'],
          summary: 'Sign in with Google OAuth authorization code (PKCE)',
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/GoogleCodeExchangeBody' } },
            },
          },
          responses: {
            '200': { description: 'Returns access and refresh tokens' },
            '400': { description: 'Code exchange failed' },
          },
        },
      },
      '/api/auth/refresh': {
        post: {
          tags: ['Auth'],
          summary: 'Refresh access token',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['refreshToken'],
                  properties: {
                    refreshToken: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Returns new access and refresh tokens' },
            '401': { description: 'Invalid or expired refresh token' },
          },
        },
      },
      '/api/whatsapp/send-template': {
        post: {
          tags: ['WhatsApp'],
          summary: 'Send a WhatsApp template message',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/WhatsAppSendTemplateBody' },
              },
            },
          },
          responses: {
            '200': { description: 'Message sent' },
            '400': {
              description: 'Validation or Meta API error',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
              },
            },
            '401': {
              description: 'Unauthorized',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
              },
            },
            '503': {
              description: 'WhatsApp not configured',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
              },
            },
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
        patch: {
          tags: ['Stores'],
          summary: 'Update current user store (partial)',
          description:
            'Send only fields to change. Email is not stored on the store. WhatsApp/Instagram connection tokens are not updated via this route.',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/UpdateStoreBody' } },
            },
          },
          responses: {
            '200': { description: 'Store updated' },
            '404': { description: 'No store' },
          },
        },
      },
      '/api/stores/me/notification-preferences': {
        get: {
          tags: ['Stores'],
          summary: 'Get store notification preferences',
          security: [{ bearerAuth: [] }],
          responses: { '200': { description: 'Notification preferences' } },
        },
        patch: {
          tags: ['Stores'],
          summary: 'Update store notification preferences',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UpdateNotificationPreferencesBody' },
              },
            },
          },
          responses: { '200': { description: 'Preferences saved' } },
        },
      },
      '/api/stores/me/push-token': {
        put: {
          tags: ['Stores'],
          summary: 'Register Expo push token for this store device',
          description:
            'Called by the merchant app after notification permission is granted. Used for push alerts when the app is closed.',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/UpsertPushTokenBody' } },
            },
          },
          responses: { '200': { description: 'Token registered' } },
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
      '/api/uploads/product-images': {
        post: {
          tags: ['Uploads'],
          summary: 'Upload product images',
          description:
            'Multipart upload. Returns public URLs to pass as `images` and `thumbnail_url` on POST /api/products. Requires store ownership.',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  required: ['store_id', 'images'],
                  properties: {
                    store_id: { type: 'string', format: 'uuid' },
                    images: {
                      type: 'array',
                      items: { type: 'string', format: 'binary' },
                      description: 'One or more image files (JPEG, PNG, WebP, GIF; max 5MB each)',
                    },
                  },
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Uploaded image URLs',
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
                          urls: {
                            type: 'array',
                            items: { type: 'string', format: 'uri' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            '400': {
              description: 'Validation or upload error',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
            '401': {
              description: 'Unauthorized',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
          },
        },
      },
      '/api/products/{productId}': {
        get: {
          tags: ['Products'],
          summary: 'Get product with variants',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'productId',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          responses: {
            '200': {
              description: 'Product detail including variants array',
            },
            '404': { description: 'Product not found' },
          },
        },
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
      '/api/products/{productId}/variants': {
        post: {
          tags: ['Products'],
          summary: 'Create product variant',
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
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ProductVariant' } },
            },
          },
          responses: { '201': { description: 'Variant created' } },
        },
      },
      '/api/products/{productId}/variants/{variantId}': {
        patch: {
          tags: ['Products'],
          summary: 'Update product variant',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'productId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
            { name: 'variantId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object' } } },
          },
          responses: { '200': { description: 'Variant updated' } },
        },
        delete: {
          tags: ['Products'],
          summary: 'Delete product variant',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'productId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
            { name: 'variantId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          responses: { '200': { description: 'Variant deleted' } },
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
      '/api/categories/{categoryId}': {
        patch: {
          tags: ['Categories'],
          summary: 'Update category',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'categoryId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object' } } },
          },
          responses: { '200': { description: 'Category updated' } },
        },
        delete: {
          tags: ['Categories'],
          summary: 'Delete category',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'categoryId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          responses: { '200': { description: 'Category deleted' } },
        },
      },
      '/api/categories/{categoryId}/products': {
        put: {
          tags: ['Categories'],
          summary: 'Sync products assigned to category',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'categoryId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['product_ids'],
                  properties: {
                    product_ids: {
                      type: 'array',
                      items: { type: 'string', format: 'uuid' },
                    },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Category products synced' } },
        },
      },
      '/api/orders': {
        get: {
          tags: ['Orders'],
          summary: 'List orders for store',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'store_id', in: 'query', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          responses: {
            '200': {
              description: 'Order list',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        type: 'object',
                        properties: {
                          orders: {
                            type: 'array',
                            items: { $ref: '#/components/schemas/Order' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        post: {
          tags: ['Orders'],
          summary: 'Create merchant / walk-in order',
          description:
            'POS mode: set `offline: true` to allow oversell. Requires `store_id` in body.',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/CreateOrderBody' } },
            },
          },
          responses: { '201': { description: 'Order created' } },
        },
      },
      '/api/orders/{orderId}': {
        get: {
          tags: ['Orders'],
          summary: 'Get order detail',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'orderId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
            { name: 'store_id', in: 'query', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          responses: {
            '200': {
              description: 'Order with items and customer',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: { $ref: '#/components/schemas/Order' },
                    },
                  },
                },
              },
            },
          },
        },
        patch: {
          tags: ['Orders'],
          summary: 'Update order statuses',
          description: 'Update `order_status`, `payment_status`, and/or `fulfillment_status`.',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'orderId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/UpdateOrderBody' } },
            },
          },
          responses: { '200': { description: 'Order updated' } },
        },
      },
      '/api/customers': {
        get: {
          tags: ['Customers'],
          summary: 'List customers for store',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'store_id', in: 'query', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          responses: {
            '200': {
              description: 'Customer list',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        type: 'object',
                        properties: {
                          customers: {
                            type: 'array',
                            items: { $ref: '#/components/schemas/Customer' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        post: {
          tags: ['Customers'],
          summary: 'Create customer',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/CreateCustomerBody' } },
            },
          },
          responses: { '201': { description: 'Customer created' } },
        },
      },
      '/api/whatsapp/connect': {
        get: {
          tags: ['WhatsApp'],
          summary: 'Start WhatsApp / Meta OAuth connection',
          security: [{ bearerAuth: [] }],
          responses: { '200': { description: 'OAuth redirect URL or connection flow data' } },
        },
      },
      '/api/whatsapp/connection-status': {
        get: {
          tags: ['WhatsApp'],
          summary: 'WhatsApp connection status for store',
          security: [{ bearerAuth: [] }],
          responses: { '200': { description: 'Connected / not connected' } },
        },
      },
      '/api/whatsapp/sync': {
        post: {
          tags: ['WhatsApp'],
          summary: 'Trigger WhatsApp chat sync',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/WhatsAppSyncBody' } },
            },
          },
          responses: { '200': { description: 'Sync started or completed' } },
        },
      },
      '/api/whatsapp/send': {
        post: {
          tags: ['WhatsApp'],
          summary: 'Send WhatsApp text message',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/WhatsAppSendMessageBody' } },
            },
          },
          responses: { '200': { description: 'Message sent' } },
        },
      },
      '/api/whatsapp/chats': {
        get: {
          tags: ['WhatsApp'],
          summary: 'List WhatsApp conversations',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'store_id', in: 'query', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          responses: { '200': { description: 'Conversation list' } },
        },
      },
      '/api/whatsapp/chats/{conversationId}/messages': {
        get: {
          tags: ['WhatsApp'],
          summary: 'List messages in a conversation',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'conversationId',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
            { name: 'store_id', in: 'query', required: true, schema: { type: 'string', format: 'uuid' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 30 } },
            { name: 'cursor', in: 'query', schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Paginated messages' } },
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
            '- **products**: all active products, including sold-out items. Each product has **sold_out** (boolean) and a **variants** array (all active variants, each with **sold_out**). Sold out when `mark_as_sold` is true or tracked inventory has `stock_qty` &lt; 1 (zero or negative). Non-inventory items are never sold out.',
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
              description:
                'Store slug — use when calling the API host directly (e.g. Railway) instead of a store subdomain',
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
                              mark_as_sold: false,
                              mark_as_non_inventory: false,
                              created_at: '2026-05-19T10:00:00.000Z',
                              updated_at: '2026-05-19T10:00:00.000Z',
                              sold_out: false,
                              variants: [
                                {
                                  id: '44444444-4444-4444-4444-444444444444',
                                  product_id: '33333333-3333-3333-3333-333333333333',
                                  name: 'Black',
                                  options: { Color: 'Black' },
                                  price_delta: 0,
                                  compare_at_price: null,
                                  stock_qty: 12,
                                  mark_as_sold: false,
                                  mark_as_non_inventory: false,
                                  sku: 'SKU-001-BLK',
                                  image_url: 'https://cdn.example.com/headphones-black.jpg',
                                  is_active: true,
                                  sort_order: 0,
                                  sold_out: false,
                                },
                              ],
                            },
                            {
                              id: '55555555-5555-5555-5555-555555555555',
                              store_id: '22222222-2222-2222-2222-222222222222',
                              category_id: '11111111-1111-1111-1111-111111111111',
                              name: 'Vintage Camera',
                              description: 'Limited edition — no longer available',
                              sku: 'SKU-002',
                              base_price: 899,
                              compare_at_price: null,
                              track_inventory: true,
                              stock_qty: -2,
                              images: [],
                              thumbnail_url: null,
                              is_active: true,
                              sort_order: 1,
                              metadata: {},
                              mark_as_sold: false,
                              mark_as_non_inventory: false,
                              created_at: '2026-05-19T10:00:00.000Z',
                              updated_at: '2026-05-19T10:00:00.000Z',
                              sold_out: true,
                              variants: [],
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
                              mark_as_sold: false,
                              mark_as_non_inventory: false,
                              created_at: '2026-05-19T10:00:00.000Z',
                              updated_at: '2026-05-19T10:00:00.000Z',
                              sold_out: false,
                              variants: [],
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
      '/api/public/customers/by-phone': {
        get: {
          tags: ['Public'],
          summary: 'Lookup returning customer by phone',
          description:
            'Returns saved shipping addresses and past order summaries for checkout prefill.',
          parameters: [
            { name: 'X-Store-Slug', in: 'header', schema: { type: 'string' } },
            {
              name: 'phone',
              in: 'query',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Customer profile',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        type: 'object',
                        properties: {
                          customer: { $ref: '#/components/schemas/PublicCustomerByPhone' },
                        },
                      },
                    },
                  },
                },
              },
            },
            '404': { description: 'Customer not found' },
          },
        },
      },
      '/api/public/orders': {
        post: {
          tags: ['Public'],
          summary: 'Create guest order',
          description:
            'Online checkout requires full shipping_address and payment_method. Creates or updates a customer by phone, deduplicates saved addresses, and links the order.',
          parameters: [{ name: 'X-Store-Slug', in: 'header', schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StorefrontCreateOrderBody' },
              },
            },
          },
          responses: { '201': { description: 'Order created' } },
        },
      },
      '/api/public/orders/{orderId}/status': {
        get: {
          tags: ['Public'],
          summary: 'Poll guest order payment status',
          description:
            'Requires the `checkout_token` returned from POST /api/public/orders. Used after Razorpay checkout.',
          parameters: [
            { name: 'X-Store-Slug', in: 'header', schema: { type: 'string' } },
            { name: 'orderId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
            {
              name: 'token',
              in: 'query',
              required: true,
              schema: { type: 'string' },
              description: 'checkout_token from create-order response',
            },
          ],
          responses: {
            '200': { description: 'Order status' },
            '404': { description: 'Order not found or invalid token' },
          },
        },
      },
    },
  }
}
