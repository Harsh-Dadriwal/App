import type { Request } from "express";
import type { RequestActor } from "./auth.types";

export type AuthenticatedRequest = Request & {
  actor?: RequestActor;
};
