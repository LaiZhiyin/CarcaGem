# Server Deployment

CarcaGem runs as one Node.js service behind the site's OpenResty reverse proxy. The browser build is served from the configured site root; the backend handles multiplayer rooms, Socket.IO, and analytics on a loopback-only port.

## Runtime requirements

- Node.js 20.19+ or 22.12+
- npm
- A writable persistent directory for SQLite analytics data
- OpenResty or Nginx configured to proxy `/api/`, `/socket.io/`, and `/admin-dashboard.html` to the Node.js service

## Build and start

```sh
npm ci
npm run build
NODE_ENV=production HOST=127.0.0.1 PORT=3001 ANALYTICS_DATA_PATH=/path/to/persistent/data node dist-server/server.js
```

Keep the Node.js process under a service manager such as systemd or PM2. Do not place backend source, dependencies, environment files, or SQLite data under the public document root.

The admin dashboard uses passwordless sessions when neither `ANALYTICS_ADMIN_PASSWORD` nor `ANALYTICS_ADMIN_TOKEN` is configured. On a public deployment, set `ANALYTICS_ADMIN_PASSWORD` if the analytics dashboard should require a password.

## Reverse proxy routes

- `/api/` → Node.js service
- `/socket.io/` → Node.js service with WebSocket upgrade support
- `/admin-dashboard.html` → Node.js service
- Other static files → public site root

Terminate HTTPS at OpenResty/Nginx and redirect HTTP requests to HTTPS after a valid certificate is installed.
