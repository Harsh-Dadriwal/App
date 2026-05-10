# Order Workflow Backbone

## Purpose

This document defines the new DB-first workflow backbone for orders.

It exists to make order behavior:

- explicit
- traceable
- tenant-safe
- automation-ready

## System Layer

The order domain now has a dedicated system layer built around:

- `system_events`
- `workflow_logs`
- `state_transition_catalog`

These tables sit above the domain tables but do not replace them.

### Source of truth split

- domain tables remain the source of truth for current entity state
- `system_events` becomes the source of truth for what happened
- `workflow_logs` becomes the source of truth for workflow execution history

## Supported Entities

The first implementation covers:

- `order_item`
- `site_order`
- `substitute_suggestion`

## Main RPCs

These are the intended workflow entrypoints:

- `transition_order_item(...)`
- `transition_site_order(...)`
- `start_substitute_workflow(...)`
- `resolve_substitute_workflow(...)`
- `mark_order_supply_progress(...)`
- `create_order_item_workflow_event(...)`

Legacy RPCs still exist, but now act as wrappers:

- `approve_order_item_by_customer(...)`
- `review_order_item_by_architect(...)`
- `suggest_substitute_item(...)`
- `respond_to_substitute(...)`
- `mark_order_item_supplied(...)`

## Order Item Workflow

### Core transitions

- `pending_architect_approval -> pending_customer_approval`
  - transition key: `architect_approve`
  - actor: `architect`

- `pending_architect_approval -> rejected_by_architect`
  - transition key: `architect_reject`
  - actor: `architect`

- `pending_customer_approval -> approved_pending_shop_confirmation`
  - transition key: `customer_approve`
  - actor: `customer`

- `pending_customer_approval -> rejected_by_customer`
  - transition key: `customer_reject`
  - actor: `customer`

- `pending_customer_approval -> substitute_suggested`
  - transition key: `suggest_substitute`
  - actor: `admin`

- `substitute_suggested -> approved_pending_shop_confirmation`
  - transition key: `accept_substitute`
  - actor: `customer`

- `substitute_suggested -> substitute_rejected`
  - transition key: `reject_substitute`
  - actor: `customer`

- `approved_pending_shop_confirmation -> approved_pending_supply`
  - transition key: `shop_confirm`
  - actor: `admin`

- `approved_pending_supply -> partially_supplied`
  - transition key: `record_partial_supply`
  - actor: `admin`

- `approved_pending_supply -> supplied`
  - transition key: `record_full_supply`
  - actor: `admin`

- `partially_supplied -> supplied`
  - transition key: `record_full_supply`
  - actor: `admin`

### Side effects

Order-item transitions may also update:

- architect review metadata
- customer review metadata
- admin notes
- shop confirmation metadata
- supply quantities
- supply timestamps

Every successful transition writes:

- `order_items.status`
- `order_item_status_history`
- `system_events`
- `workflow_logs`

## Site Order Workflow

Site-order transitions are now managed in two ways:

1. manual transitions
2. system rollups from line-item state

### Manual transitions

- `confirmed -> processing`
  - transition key: `admin_start_processing`
  - actor: `admin`

- `confirmed|processing|partially_supplied -> supplied`
  - transition key: `admin_mark_supplied`
  - actor: `admin`

### System rollups

The function `sync_site_order_workflow(...)` recalculates header state from item states.

Possible rollup states:

- `draft`
- `awaiting_approval`
- `partially_approved`
- `confirmed`
- `processing`
- `partially_supplied`
- `supplied`
- `cancelled`

## Event Model

Typical event types include:

- `order_item_transition`
- `site_order_transition`
- `substitute_workflow_started`
- `substitute_workflow_resolved`

Each event stores:

- tenant
- entity type
- entity id
- actor
- correlation id
- module source
- JSON payload

## Read Models

The first workflow read models are:

- `vw_recent_order_workflow_events`
- `vw_order_workflow_timeline`
- `vw_stuck_order_workflows`
- `vw_order_workflow_actor_history`

These are for:

- admin monitoring
- debugging
- timeline display inside order-related screens

## Guardrails

Going forward:

- workflow decisions should live in RPCs and transition catalog rows
- views should only assemble read state
- UI should render state and trigger actions, not decide workflow
- financial side effects must be attached to system events, not hidden UI logic
