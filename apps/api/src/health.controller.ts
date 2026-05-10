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
      service: "mahalaxmi-electricals-api"
    };
  }
}
