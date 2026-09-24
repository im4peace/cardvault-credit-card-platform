# CardVault frontend

The React and Vite frontend for the [CardVault credit card demo](../README.md). It includes customer and credit officer portals. The backend API and demo database are required for the complete journey.

## Run from this directory

```powershell
npm ci
npm run dev
```

Open `http://localhost:5173`. The frontend expects the API at `http://localhost:4000` by default. Set `VITE_API_URL` when the backend runs at another address. For database setup, demo accounts, and the complete walkthrough, use the [root README](../README.md).

## Checks

```powershell
npm test
npm run lint
npm run typecheck
npm run build
```

This is a simulated banking demo and is not connected to real card issuance or payment systems.
