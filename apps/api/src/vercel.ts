import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import express from "express";
import { ExpressAdapter } from "@nestjs/platform-express";
import { randomUUID } from "crypto";

const server = express();
let nestApp: any;

async function bootstrap() {
  if (!nestApp) {
    nestApp = await NestFactory.create(AppModule, new ExpressAdapter(server), { cors: true });
    nestApp.setGlobalPrefix("");
    
    // Request logger middleware (mirrors main.ts)
    nestApp.use((req: any, res: any, next: () => void) => {
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

    await nestApp.init();
  }
  return server;
}

export default async (req: any, res: any) => {
  await bootstrap();
  server(req, res);
};
