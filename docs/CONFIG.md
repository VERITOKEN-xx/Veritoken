# Configuration

The frontend reads Vite environment variables from `frontend/.env`. Start from
`frontend/.env.example` after deploying contracts:

```bash
cd frontend
cp .env.example .env
```

Run `npm run check:env` from `frontend/` to verify that every
`import.meta.env.*` variable used by the code is documented in
`frontend/.env.example`.

## Frontend Variables

| Variable | Required | Default | Format | Purpose | Example |
|---|---:|---|---|---|---|
| `VITE_STELLAR_NETWORK` | No | `testnet` | `testnet` or `mainnet` | Selects the Stellar network and RPC endpoint used by the frontend. | `testnet` |
| `VITE_KYC_REGISTRY_ID` | Yes | Empty string | Stellar contract ID | KYC registry contract queried for holder approval status. | `CCKYC...` |
| `VITE_COMPLIANCE_ENGINE_ID` | Yes | Empty string | Stellar contract ID | Compliance engine contract used for transfer rules and pause state. | `CCCE...` |
| `VITE_INVOICE_TOKEN_ID` | Yes | Empty string | Stellar contract ID | Invoice token contract surfaced on the invoice page. | `CCINV...` |
| `VITE_PROPERTY_TOKEN_ID` | Yes | Empty string | Stellar contract ID | Property token contract surfaced on the property page. | `CCPROP...` |
| `VITE_CARBON_TOKEN_ID` | Yes | Empty string | Stellar contract ID | Carbon credit token contract surfaced on the carbon page. | `CCCARB...` |

The contract IDs may be left empty while developing layout-only frontend
changes, but transaction flows need deployed contract IDs for the selected
network.
