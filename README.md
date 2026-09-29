# TailorApp

A full-stack tailor management app with:

- Backend: Node.js + Express API
- Web app: React + Vite
- Mobile app: React Native

## Project layout

- `backend/` - API server
- `web/` - dashboard and storefront web app
- `mobile/` - React Native client

## Getting started

1. Install dependencies for each app:
   ```bash
   cd backend && npm install
   cd ../web && npm install
   cd ../mobile && npm install
   ```
2. Start each service:
   ```bash
   cd backend && npm run dev
   cd web && npm run dev
   cd mobile && npm start
   ```

## Default backend endpoints

- `GET /api/health`
- `GET /api/products`
- `GET /api/orders`
- `POST /api/orders`
- `POST /api/auth/login`

## Notes

This is a starter monorepo designed for a tailor business workflow such as customer bookings, measurements, order tracking, and garment management.
