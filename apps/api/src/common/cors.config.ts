export function getCorsOptions() {
  const allowedOriginsEnv = process.env.CORS_ALLOWED_ORIGINS;
  const isProduction = process.env.NODE_ENV === "production";

  const defaultOrigins = [
    "https://app-rho-one-49.vercel.app",
    "http://localhost:3000",
    "http://localhost:8081",
    "http://127.0.0.1:3000"
  ];

  const allowedOrigins = allowedOriginsEnv
    ? allowedOriginsEnv.split(",").map((o) => o.trim()).filter(Boolean)
    : defaultOrigins;

  return {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) {
        return callback(null, true);
      }
      if (allowedOrigins.includes(origin) || (!isProduction && origin.startsWith("http://localhost:"))) {
        return callback(null, true);
      }
      return callback(new Error(`CORS policy rejection: Origin ${origin} not allowed`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-request-id", "x-tenant-id"]
  };
}
