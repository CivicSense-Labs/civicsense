// Vercel API route handler
import app from '../src/simple-server.js';

// Vercel expects a request handler function
export default async function handler(req, res) {
  return app(req, res);
}