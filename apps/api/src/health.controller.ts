import { Controller, Get } from "@nestjs/common";

@Controller()
export class HealthController {
  @Get()
  getRoot() {
    return {
      status: "ok",
      service: "mahalaxmi-electricals-api",
      type: "backend-api",
      message:
        "Backend is running. Open the web app on http://localhost:3000 and use /health for API health.",
      routes: {
        health: "/health",
        webApp: "http://localhost:3000"
      }
    };
  }

  @Get("/health")
  getHealth() {
    return {
      status: "ok",
      service: "mahalaxmi-electricals-api",
      timestamp: new Date().toISOString(),
      nodeEnv: process.env.NODE_ENV || "development",
      queuesEnabled: process.env.DISABLE_QUEUES !== "true" && Boolean(process.env.REDIS_URL),
      storageMode:
        process.env.R2_BUCKET && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY
          ? "r2"
          : "s3"
    };
  }
}
