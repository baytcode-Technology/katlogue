# Storefront public API

Customer-facing HTTP API for building a store website or checkout flow. All routes live under `/api/public/*`.

Interactive OpenAPI docs: `GET /docs` (when the backend is running).

## Store resolution

Every public request must identify which store to use:

| Method | Example |
|--------|---------|
| **Subdomain** | `https://my-shop.yourdomain.com/api/public/catalog` |
| **Header** | `X-Store-Slug: my-shop` on the API host (e.g. local dev or Railway) |

If the store cannot be resolved, responses return `404 STORE_NOT_FOUND`.

---

## `GET /api/public/store`

Returns public store metadata and enabled payment methods (no secrets).

**Response `data`:**

```json
{
  "store": {
    "id": "uuid",
    "slug": "my-shop",
    "name": "My Shop",
    "description": "Welcome to our store",
    "logo_url": "https://cdn.example.com/logo.png",
    "whatsapp_number": "+919876543210",
    "currency": "INR",
    "timezone": "Asia/Kolkata",
    "is_active": true,
    "industry": "Fashion",
    "country": "IN",
    "notification_preferences": {
      "chats": true,
      "online_orders": true,
      "pos_orders": true,
      "sound_id": "default"
    },
    "payment_methods": {
      "cod": { "enabled": true },
      "razorpay": { "enabled": true, "key_id": "rzp_test_..." },
      "upi": {
        "enabled": false,
        "vpa": null,
        "display_name": null,
        "qr_image_url": null
      }
    }
  },
  "subdomainUrl": "https://my-shop.example.com"
}
```

Only the fields above are returned. Internal fields (owner, tokens, AI config, timestamps, etc.) are not included.

Use `payment_methods` to show checkout options. Only methods with `enabled: true` are accepted on order creation.

---

## `GET /api/public/catalog`

Primary endpoint for product listing pages. Returns categories and products in one payload.

### Query parameters

| Param | Description |
|-------|-------------|
| `category_id` | Filter products to that category **and all nested subcategories** |
| `product_id` | Return a single product (`products` length 1) |
| `sort` | `default` \| `name_asc` \| `name_desc` \| `price_asc` \| `price_desc` |
| `min_price` | Minimum `base_price` |
| `max_price` | Maximum `base_price` |

### Response shape

```json
{
  "success": true,
  "message": "Catalog fetched successfully",
  "data": {
    "categories": [
      {
        "id": "uuid",
        "store_id": "uuid",
        "parent_id": null,
        "name": "Electronics",
        "image_url": null,
        "sort_order": 0,
        "is_active": true,
        "description": null,
        "created_at": "2026-01-01T00:00:00.000Z",
        "subcategories": [
          {
            "id": "uuid",
            "parent_id": "parent-uuid",
            "name": "Phones",
            "subcategories": []
          }
        ]
      }
    ],
    "products": [ /* all active products, including sold out */ ]
  }
}
```

**Categories** are returned as a **nested tree**: only root categories (`parent_id` null, or orphans whose parent is inactive) appear at the top level. Each node includes **`subcategories`** (array, recursive), sorted by `sort_order` then name. Products are unchanged and still reference a single `category_id`.

### Sold-out availability

Each product includes:

- **`sold_out`** (boolean) — customer cannot purchase this product as a whole.
- **`variants`** — all **active** variants, each with **`sold_out`**.

A product or variant is **sold out** when:

1. `mark_as_sold` is `true` (product-level flag applies to all variants), or
2. Inventory is tracked (`track_inventory: true`) and `stock_qty < 1` (zero or negative).

**Not sold out:** `mark_as_non_inventory: true` (product or variant) skips stock checks.

**Variant products:** `product.sold_out` is `true` only when **every** active variant is sold out. Individual variants can be sold out while others remain purchasable.

**Website integration:** Show sold-out items in the catalog with a badge and disable “Add to cart”. Checkout still validates stock and returns `400 INSUFFICIENT_STOCK` if a sold-out line is submitted.

### Example product (simple, sold out)

```json
{
  "id": "uuid",
  "name": "Vintage Camera",
  "base_price": 899,
  "track_inventory": true,
  "stock_qty": -2,
  "mark_as_sold": false,
  "mark_as_non_inventory": false,
  "sold_out": true,
  "variants": []
}
```

### Example product (variants)

```json
{
  "id": "uuid",
  "name": "T-Shirt",
  "base_price": 29,
  "sold_out": false,
  "variants": [
    { "id": "uuid", "name": "M / Blue", "stock_qty": 5, "sold_out": false },
    { "id": "uuid", "name": "L / Blue", "stock_qty": 0, "sold_out": true }
  ]
}
```

---

## `GET /api/public/categories`

Lists active categories only. Prefer `/catalog` when you need products too.

---

## `GET /api/public/products`

Lists raw active products (merchant product rows). Does **not** attach `sold_out` or variant availability — use `/catalog` for storefront UI.

---

## `GET /api/public/customers/by-phone?phone=...`

Lookup a returning customer for checkout prefill. Requires `X-Store-Slug`.

**Response 200:**

```json
{
  "success": true,
  "data": {
    "customer": {
      "id": "uuid",
      "name": "Customer name",
      "phone_number": "919876543210",
      "shipping_addresses": [
        {
          "id": "uuid",
          "name": "Customer name",
          "phone_number": "919876543210",
          "address": "12 Main Street",
          "city": "Kochi",
          "district": "Ernakulam",
          "state": "Kerala",
          "postcode": "682001",
          "created_at": "2026-06-13T10:00:00.000Z"
        }
      ],
      "orders": [
        {
          "id": 1,
          "order_number": "JUN26-1",
          "total": 599,
          "created_at": "2026-06-13T10:00:00.000Z"
        }
      ]
    }
  }
}
```

**404** if the phone is not registered for this store.

---

## `POST /api/public/uploads/payment-proof`

Guest upload for UPI payment proof screenshots (public storage URL).

### Request

- `multipart/form-data`
- Field: `image` (JPEG/PNG/WebP/GIF, max 5MB)

Store is resolved from the subdomain / `X-Store-Slug` header.

### Response `data`

```json
{
  "url": "https://<supabase-public-host>/storage/v1/object/public/<bucket>/<storeId>/payment-proofs/<uuid>.png"
}
```

---

## `POST /api/public/orders`

Guest checkout (online). Creates or updates a customer by phone, saves unique shipping addresses, and links the order.

### Request body

```json
{
  "items": [
    {
      "product_id": "uuid",
      "quantity": 1,
      "variant_id": ""
    }
  ],
  "payment_method": "cod",
  "shipping_address": {
    "name": "",
    "phone_number": "",
    "address": "",
    "city": "",
    "district": "",
    "state": "",
    "postcode": ""
  },
  "notes": ""
}
```

| Field | Notes |
|-------|-------|
| `payment_method` | **Required** — `cod` \| `razorpay` \| `upi`; must be enabled on the store |
| `items` | **Required** — at least one line |
| `payment_proof_url` | Optional; **required when** `payment_method` is `upi` |
| `shipping_address` | **Required** — all of `name`, `phone_number`, `address`, `city`, `district`, `state`, `postcode` (customer phone and name come from here) |
| `items[].variant_id` | Optional; omit or send `""` when the product has no variant |
| `notes` | Optional |

Customer handling:

- Phone and name come from `shipping_address.phone_number` and `shipping_address.name`.
- If the customer exists, the address is saved only when it differs from saved addresses.
- Order `id` is appended to `customers.order_ids`; `total_orders` and `total_spent` are updated.

Merchant POS (`POST /api/orders` with `offline: true`) is unchanged — customer and address remain optional.

### Payment flows

| Method | Order status | Payment status | Next step |
|--------|--------------|----------------|-----------|
| **cod** | `confirmed` | `pending` | Pay on delivery |
| **upi** | `pending` | `confirming` | Waiting for store confirmation (proof submitted) |
| **razorpay** | `pending` | `pending` | Open Razorpay with `data.razorpay`; verify payment, then poll status as fallback |

### Response highlights

```json
{
  "success": true,
  "data": {
    "order": { "id": 1, "order_number": "JUN26-1", "total": 599, "payment_status": "pending", "order_status": "pending" },
    "checkout_token": "hex-string",
    "razorpay": { "key_id": "rzp_...", "order_id": "order_...", "amount": 59900, "currency": "INR" },
    "upi": { "vpa": "shop@upi", "amount": 599, "currency": "INR", "reference": "1", "qr_image_url": null }
  }
}
```

Save `checkout_token` for Razorpay verify and status polling.

---

## `POST /api/public/orders/:orderId/verify-payment`

Confirm Razorpay payment immediately after checkout (preferred over polling alone).

**Body:**

```json
{
  "checkout_token": "hex-string",
  "razorpay_order_id": "order_...",
  "razorpay_payment_id": "pay_...",
  "razorpay_signature": "..."
}
```

**Response `data`:**

```json
{
  "order_id": 1,
  "order_number": "JUN26-1",
  "order_status": "confirmed",
  "payment_status": "paid"
}
```

Idempotent: safe to call again if the order is already paid.

---

## `GET /api/public/orders/:orderId/status?token=...`

Poll payment after Razorpay checkout (fallback if verify-payment fails or webhook is delayed).

**Query:** `token` = `checkout_token` from create-order.

```json
{
  "success": true,
  "data": {
    "order_id": 1,
    "order_number": "JUN26-1",
    "order_status": "confirmed",
    "payment_status": "paid",
    "total": 599
  }
}
```

Poll every 2–3 seconds until `payment_status` is `paid` or the user dismisses checkout.

---

## Razorpay webhook (server-side)

Configure in the Razorpay dashboard:

- **URL:** `https://your-api-host/api/webhooks/razorpay`
- **Event:** `payment.captured`

The backend verifies the signature, updates payment and order status, and is idempotent.

Merchant Razorpay keys are configured per store in the merchant app (Settings → Payment methods → Razorpay).

### Merchant Razorpay setup test (before enable)

Merchants must pass a **₹1 INR setup test** before Razorpay appears on the storefront:

1. Save Key ID, Key Secret, and Webhook secret in the merchant app.
2. `POST /api/stores/me/payment-config/razorpay/test-checkout` — returns Razorpay checkout payload (`key_id`, `razorpay_order_id`, `amount: 100`, `checkout_token`, etc.).
3. Complete payment in the app (test mode = fake money with test card; live mode = real ₹1).
4. `POST /api/stores/me/payment-config/razorpay/verify-test` with `order_id`, `checkout_token`, and Razorpay payment fields.
5. Enable Razorpay via `PATCH /api/stores/me/payment-config` only after `test_passed` is true for the current mode.

Changing keys, webhook secret, or test/live mode invalidates the test and requires re-testing.

---

## Error codes (common)

| Code | HTTP | Meaning |
|------|------|---------|
| `STORE_NOT_FOUND` | 404 | Invalid slug / subdomain |
| `PRODUCT_NOT_FOUND` | 404 | `product_id` filter invalid |
| `INSUFFICIENT_STOCK` | 400 | Sold-out or not enough quantity |
| `VARIANT_REQUIRED` | 400 | Product has variants but none selected |
| `PAYMENT_METHOD_DISABLED` | 400 | Method not enabled for store |
| `INVALID_PAYMENT_SIGNATURE` | 400 | Razorpay signature verification failed |
| `RAZORPAY_WEBHOOK_SECRET_REQUIRED` | 400 | Merchant enabled Razorpay without webhook secret |
| `RAZORPAY_TEST_REQUIRED` | 400 | Merchant enabled Razorpay without passing the ₹1 setup test |

---

## Quick integration checklist

1. Resolve store via subdomain or `X-Store-Slug`.
2. `GET /api/public/store` — branding, currency, payment methods.
3. `GET /api/public/catalog` — categories + products; respect `sold_out`.
4. `POST /api/public/orders` — checkout with enabled `payment_method`.
5. Razorpay: open checkout → `POST .../verify-payment` → poll `GET .../status?token=checkout_token` if needed.
6. UPI: upload proof → `POST /api/public/orders` with `payment_method: "upi"` + `payment_proof_url`.

Demo reference implementation: `storefront-web/` in this repo.
