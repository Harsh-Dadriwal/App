import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { randomUUID } from "crypto";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  app.setGlobalPrefix("");
  app.use((req: any, res: any, next: () => void) => {
    const startedAt = Date.now();
    const requestId = String(req.headers["x-request-id"] || randomUUID());

    req.requestId = requestId;
    res.setHeader("x-request-id", requestId);

    res.on("finish", () => {
      const durationMs = Date.now() - startedAt;
      console.log(
        JSON.stringify({
          level: "info",
          message: "request.completed",
          requestId,
          method: req.method,
          path: req.originalUrl || req.url,
          statusCode: res.statusCode,
          durationMs
        })
      );
    });

    next();
  });
  const port = Number(process.env.PORT || 4000);
  await app.listen(port, "0.0.0.0");
  console.log(
    JSON.stringify({
      level: "info",
      message: "api.started",
      port,
      nodeEnv: process.env.NODE_ENV || "development",
      queuesEnabled: process.env.DISABLE_QUEUES !== "true" && Boolean(process.env.REDIS_URL)
    })
  );
}

void bootstrap();
