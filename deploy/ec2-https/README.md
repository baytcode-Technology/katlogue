# HTTPS for the API on EC2

Browsers, iOS, and production Expo builds expect **`https://`** without a custom port. Your Node app can keep listening on **`127.0.0.1:5000`**; a reverse proxy on the instance handles **443** (and **80** for certificate renewal).

**You need a domain name.** Let's Encrypt does not issue certificates for a bare IP like `43.205.195.35`. Use a subdomain of a domain you control (recommended: **`api.aishopy.io`**).

## 1. DNS

In your DNS provider (where `aishopy.io` is hosted):

| Type | Name | Value        | TTL |
|------|------|--------------|-----|
| A    | api  | 43.205.195.35 | 300 |

Wait until `dig api.aishopy.io +short` returns `43.205.195.35`.

## 2. EC2 security group

On instance **aishopy-api**, inbound rules:

| Port | Source    | Purpose              |
|------|-----------|----------------------|
| 22   | Your IP   | SSH                  |
| 80   | 0.0.0.0/0 | HTTP (redirect + ACME) |
| 443  | 0.0.0.0/0 | HTTPS API            |

You can **remove public access to port 5000** after the proxy works (keep 5000 bound to `127.0.0.1` only).

## 3. SSH into the instance

```bash
ssh -i your-key.pem ubuntu@43.205.195.35
```

(Use `ec2-user` on Amazon Linux instead of `ubuntu` if applicable.)

Confirm the API is running locally:

```bash
curl -s http://127.0.0.1:5000/api/health || curl -s http://127.0.0.1:5000/health
```

## 4. Option A — Nginx + Certbot (Ubuntu)

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx

sudo cp nginx-api.aishopy.io.conf /etc/nginx/sites-available/api.aishopy.io
# Edit server_name if you use a different hostname:
# sudo nano /etc/nginx/sites-available/api.aishopy.io

sudo ln -sf /etc/nginx/sites-available/api.aishopy.io /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

sudo certbot --nginx -d api.aishopy.io
```

Certbot configures HTTPS and HTTP→HTTPS redirect. Renewal is automatic via systemd timer.

Test:

```bash
curl -s https://api.aishopy.io/api/health
```

## 4. Option B — Caddy (simpler TLS)

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy

sudo cp Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

## 5. Backend environment on EC2

In `backend/.env` on the server (or your process manager env):

```env
PORT=5000
API_PUBLIC_URL=https://api.aishopy.io
TRUST_PROXY=1
CORS_ORIGIN=https://aishopy.io,https://www.aishopy.io,http://localhost:3000
```

Restart the API (PM2, Docker, or systemd):

```bash
pm2 restart all
# or: docker compose restart api
```

Update OAuth redirect URLs in Google / Meta / Instagram consoles to use `https://api.aishopy.io/...` where they currently point at `http://43.205.195.35:5000`.

## 6. Point clients at HTTPS (no `:5000`)

| App / service | Variable | Example |
|---------------|----------|---------|
| Expo app | `EXPO_PUBLIC_API_URL` | `https://api.aishopy.io` |
| `aiShopy-app/eas.json` | same per profile | `https://api.aishopy.io` |
| Landing (Next.js) | `AISHOOPY_API_URL` | `https://api.aishopy.io` |
| Landing | `NEXT_PUBLIC_AISHOPY_API_URL` | `https://api.aishopy.io` |

Rebuild/redeploy the app and landing site after changing env vars.

## 7. WebSockets (Socket.IO)

The Nginx config forwards `Upgrade` headers so chat/support sockets work over `wss://api.aishopy.io`. Ensure the mobile app uses the same HTTPS base URL for the socket client.

## Troubleshooting

- **502 Bad Gateway** — API not running on `127.0.0.1:5000`.
- **Certbot fails** — DNS not propagated, or port 80 blocked by security group.
- **Mixed content** — storefront on HTTPS must call `https://api...`, not `http://IP:5000`.
- **Elastic IP** — if the instance public IP changes, update the DNS A record (or attach an Elastic IP in EC2).
