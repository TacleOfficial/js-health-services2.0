# Velle Research

A fictional premium research-commerce prototype built with Next.js, React,
Tailwind CSS, Radix UI primitives, and local browser persistence.

## Local development

Use Node.js 22.15 or newer:

```powershell
nvm use 22.15.0
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Validation

```powershell
npm run lint
npm test
```

## Vercel

Import the Git repository into Vercel and select the Next.js framework preset.
Vercel will use `npm run build` and publish the standard `.next` output.

- Pushes to the production branch create production deployments.
- Other branches and pull requests create Preview deployments.
- Configure secrets independently for Development, Preview, and Production.

This prototype uses no backend, authentication, production payment system, or
external data service.
