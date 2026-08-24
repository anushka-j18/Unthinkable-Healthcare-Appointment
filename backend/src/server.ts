import app from './app';

const PORT = process.env.PORT || 5001;

/**
 * Boots up the HTTP server on the configured PORT when not running serverless on Vercel.
 */
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`===========================================================`);
    console.log(`🏥 Healthcare Appointment Manager Backend API`);
    console.log(`🚀 Server running on: http://localhost:${PORT}`);
    console.log(`🟢 Health check endpoint: http://localhost:${PORT}/api/health`);
    console.log(`===========================================================`);
  });
}

export default app;
