// Vercel serverless function entry point
// This wraps our working simple-server.js for Vercel deployment

import app from '../src/simple-server.js';

// Export the Express app for Vercel
export default app;