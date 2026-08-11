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
        "Backend is running. Use /health for API health and configure the web app to call this deployment URL in production.",
      routes: {
        health: "/health"
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
