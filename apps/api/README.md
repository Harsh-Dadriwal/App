# Mahalaxmi Electricals API

This is the NestJS-ready backend scaffold for the enterprise migration.

## Purpose

It sits between the current web/mobile apps and Supabase so that:

- frontend stops owning workflow and fintech orchestration
- Supabase remains the system of record
- the migration can happen module by module without rewriting the product

## First modules included

- `identity`
- `tenants`
- `workflows`
- `wallet`
- `notifications`
- `inventory`
- BullMQ job scaffolding

## Environment

Copy `.env.example` to `.env` and configure:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `PORT`

## Current strategy

This backend currently wraps the existing Postgres/RPC-heavy flows so the frontend can move to an API-first contract before the deeper orchestration logic is fully extracted into Nest services and BullMQ workers.

## Queue scaffolding

BullMQ queues are now scaffolded for:

- `notifications`
- `inventory-reorder`
- `workflow-events`

These processors currently provide safe placeholders so the system can start using queued side effects without forcing a big-bang rewrite.
