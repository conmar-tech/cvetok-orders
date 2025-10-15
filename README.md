# cvetok-orders

Serverless handler that receives request-quote submissions from the Shopify theme and creates Draft Orders through the Admin API. The project is designed to be deployed on [Vercel](https://vercel.com/) using their Hobby plan.

## Project structure

```
├── api
│   ├── health.js          # Simple ping endpoint for monitoring
│   └── quote.js           # Main Draft Order creation handler
├── .gitignore
├── package.json
└── README.md
```

### Requirements

- Node.js 18+ (Vercel serverless runtime satisfies this requirement)
- A Shopify Custom App with access to the Draft Orders Admin API.

### Environment variables

Create the following variables in Vercel (`Project Settings → Environment Variables`):

| Variable | Description |
| --- | --- |
| `SHOPIFY_STORE_DOMAIN` | Your myshopify domain, e.g. `fge1nm-i1.myshopify.com`. |
| `SHOPIFY_ADMIN_ACCESS_TOKEN` | Admin API access token from the custom app (keep private!). |
| `CORS_ALLOW_ORIGIN` *(optional)* | Origin that is allowed to call the endpoint, e.g. `https://artificial-floral.com`. Defaults to `*`. |
| `SHOPIFY_API_VERSION` *(optional)* | Shopify Admin API version to use (defaults to `2024-07`). |

### Shopify theme configuration

1. Deploy this project to Vercel. Note the URL of the quote endpoint (for example `https://cvetok-orders.vercel.app/api/quote`).
2. In the Shopify theme editor open the **Request quote form** section.
3. Paste the endpoint URL into the “Draft order endpoint URL” field and save.

### Local development

Install the Vercel CLI and run:

```bash
vercel dev
```

Set environment variables locally via `vercel env pull` or a local `.env` file (remember `.env` is ignored by git).

### Deployment

Once the repository is connected to Vercel, push to `main` (or the configured branch). Vercel will build and deploy automatically.

### Security considerations

- Do not expose the Admin API token in the repository.
- Restrict the `CORS_ALLOW_ORIGIN` variable to your storefront domain in production.
- Optionally add additional checks (e.g. HMAC validation, rate limiting) if the endpoint will be public.
