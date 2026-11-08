// Vercel function: every request is routed here (vercel.json) and handled by the Express app,
// which `npm run build` bundles into dist/vercel.mjs.
export { default } from "../dist/vercel.mjs";
