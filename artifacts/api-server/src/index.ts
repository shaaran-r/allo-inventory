import app from "./app";
import { logger } from "./lib/logger";
import { startExpiryWorker } from "./routes/reservations";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Start background worker that releases expired reservations every 60s
  startExpiryWorker();
  logger.info("Reservation expiry worker started");
});
