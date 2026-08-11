import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import express from "express";
import { ExpressAdapter } from "@nestjs/platform-express";
import { randomUUID } from "crypto";

const server = express();
let nestApp: any;
let bootstrapError: any = null;

async function bootstrap() {
  if (bootstrapError) {
    throw bootstrapError;
  }
  if (!nestApp) {
    try {
      nestApp = await NestFactory.create(AppModule, new ExpressAdapter(server), {
        cors: true,
        logger: ["error", "warn", "log"]
      });
      nestApp.setGlobalPrefix("");

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
    } catch (err: any) {
      bootstrapError = err;
      console.error("BOOTSTRAP_FAILED:", err?.stack || err);
      throw err;
    }
  }
  return server;
}

export default async (req: any, res: any) => {
  try {
    await bootstrap();
    server(req, res);
  } catch (err: any) {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        error: "BOOTSTRAP_ERROR",
        message: err?.message || String(err),
        stack: err?.stack?.split("\n")
      })
    );
  }
};
