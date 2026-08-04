# CTO Platform Audit And 5-Year Roadmap

Last updated: July 26, 2026

## Scope

This document is a CTO-level review of the current platform based on the existing repository and architecture artifacts, including:

- `README.md`
- `docs/system-design.md`
- `docs/fintech-backend-design.md`
- `docs/multi-tenant-architecture.md`
- `docs/order-workflow-backbone.md`
- `docs/web-enterprise-boundary.md`
- `apps/api/src/app.module.ts`
- `apps/api/src/common/events/domain-events.service.ts`
- `apps/api/src/common/queue/queue.service.ts`
- `apps/api/src/common/tenancy/tenant-access.service.ts`
- `apps/api/src/modules/workflows/workflows.service.ts`
- `apps/api/src/modules/requirements/requirements.service.ts`
- `render.yaml`
- `packages/core/src/types/domain.ts`

This is not a greenfield redesign.

The goal is to evolve the current system into the operating system for construction procurement, execution, financing, and ecosystem coordination.

## Executive Summary

The platform is already ahead of typical vertical software at this stage.

Strengths:

- strong domain breadth across procurement, workflows, requirements, fintech, and tenancy
- practical migration path from Supabase/RPC-heavy logic to a NestJS enterprise boundary
- working multi-surface architecture across web, mobile, backend, database, and shared package layers
- serious attention to workflow traceability and tenant-aware design
- early AI-adjacent requirement ingestion and OCR capabilities already in place

Weaknesses:

- eventing is still queue-backed job dispatch, not yet a first-class event platform
- backend remains a modular monolith with incomplete service boundaries
- developer platform, CI/CD, observability, disaster recovery, and analytics maturity lag behind product ambition
- search, BI, recommendation, graph intelligence, and ecosystem APIs are largely absent
- AI is present in features, but not yet a platform capability with memory, agent governance, or reusable intelligence services

Bottom line:

The current platform is a strong vertical core, not yet an industry operating system.

The next leap is not "more screens." It is building:

- a durable event backbone
- a unified data platform
- ecosystem-grade APIs
- agentic intelligence safely connected to workflows
- network-effect products across suppliers, manufacturers, financiers, logistics, and compliance

## Current Architecture Reading

### What exists today

The repo shows a pragmatic hybrid architecture:

- Next.js web client for role-based workspaces
- Expo mobile app
- Supabase Auth + Postgres + RLS as system of record
- SQL views and RPCs for transactional and workflow-heavy behavior
- NestJS backend added as a migration-safe enterprise layer
- BullMQ-style queues through Redis
- object storage through S3 and R2-compatible paths
- shared types and gateway contracts in `packages/core`

### What is strategically correct

These decisions were right:

- keeping Postgres and RLS central during early scale
- introducing `lib/backend/**` as a web-to-backend boundary before a big rewrite
- using a modular monolith instead of premature microservices
- building workflow logs and system events before scaling automation
- treating tenant scoping as a foundational concern

### What will break at larger scale

These decisions will become constraints if left unchanged:

- direct frontend-to-Supabase reads as a long-term pattern for core operations
- queue-as-event-bus through `DomainEventsService -> QueueService`
- absence of a canonical event contract registry
- reliance on ad hoc module-local orchestration rather than sagas / process managers
- lack of a dedicated search, analytics, and intelligence layer
- deployment shape centered on a single API runtime and one Redis instance

## Ratings

Scores are from 1 to 10 and reflect the current repo, not aspiration.

| Category | Score | Why |
| --- | --- | --- |
| Architecture | 7 | Strong modular direction and migration boundary, but still transitional and partially split across UI, SQL RPCs, and NestJS. |
| Scalability | 6 | Good monolith-first shape, but current deployment, eventing, and data access patterns will tighten under higher load. |
| Security | 7 | RLS, tenant access checks, and auth layering are good; secrets, audit, policy centralization, and security automation are not yet mature enough. |
| Developer Experience | 6 | Monorepo, shared package, and docs help; CI, local orchestration, contract testing, and platform tooling are still thin. |
| Domain Modelling | 8 | The domain is unusually rich already, especially workflows, tenancy, and requirements. |
| Database | 8 | Postgres-first design is a strength; the SQL layer is advanced and deliberate. |
| Queues | 5 | Queue abstraction exists, but it is still simple producer logic without robust worker topology, retries, DLQs, or operational controls. |
| Caching | 4 | Very limited evidence of systematic caching, invalidation, or read model strategy. |
| AI Readiness | 6 | Requirement/OCR foundation is real, but no shared AI platform, agent runtime, memory layer, or evaluation stack yet. |
| API Design | 6 | Gateway direction is good, but API coverage and canonical contracts are still incomplete. |
| Observability | 3 | Minimal evidence of tracing, metrics, SLOs, dashboards, structured audit observability, or incident tooling. |
| Search | 2 | No dedicated search platform, indexing strategy, vector retrieval layer, or cross-entity discovery model yet. |
| Storage | 7 | S3/R2 handling is sensible and already productized for uploads. |
| Performance | 6 | Fine for current stage, but hot paths, read-models, query profiling, and cache tiers need more investment. |
| Tenant Isolation | 8 | Multi-tenant reasoning is one of the strongest parts of the system. |
| Disaster Recovery | 3 | No explicit backup, restore, DR, or regional failover strategy is represented in the repo. |
| Event Architecture | 5 | Good intent and naming, but not yet a true event-driven platform. |
| Workflow Design | 8 | One of the best-designed parts of the codebase; explicit transitions and logs are the right foundation. |
| Microservice Boundaries | 5 | Current modules are sensible, but service extraction criteria and bounded contexts need formalization. |
| Cost Optimisation | 5 | Reasonable current stack choices, but no visible cost governance, tiering, or AI/storage/query economics strategy. |
| Deployment Strategy | 4 | Render + Redis is serviceable, but not enough for the long-term operating system ambition. |
| Testing | 6 | Tests are present and improving, but coverage is uneven and the platform lacks deeper integration, contract, chaos, and performance testing. |
| CI/CD | 2 | No `.github` workflows or equivalent CI pipeline are present in the repo. |
| Documentation | 8 | The architectural writing is already strong and unusually useful. |

## What Is Actually Missing

The current platform is broad, but it is still missing several layers required to become category-defining.

### Missing operating-system modules

- CRM and lead lifecycle platform
- manufacturer portal and channel program tools
- vendor master and supplier performance control tower
- tendering, bidding, negotiation, and quote comparison engine
- contract lifecycle management
- warranty, AMC, returns, and claims platform
- project scheduling and milestone dependency engine
- logistics orchestration and proof-of-delivery workflows
- compliance engine for permits, safety, invoices, and statutory records
- finance cockpit for treasury, receivables, liabilities, risk, underwriting, and partner capital
- business intelligence and self-serve analytics layer
- global search and entity graph
- recommendation and substitution intelligence engine
- trust, reputation, dispute, and scorecard system
- ecosystem identity for partners, service providers, and enterprise buyers
- learning, certification, and partner enablement platform
- public developer APIs and webhook ecosystem
- marketplace settlement and reconciliation engine

### Missing intelligence modules

- semantic product catalog normalization
- supplier and manufacturer embeddings
- project similarity retrieval
- requirement-to-BOM reasoning
- quote benchmarking and negotiation guidance
- procurement anomaly detection
- contractor performance forecasting
- credit risk and payment behavior modeling
- fraud detection for procurement, referral, and financing actions
- document intelligence for contracts, invoices, warranties, approvals, drawings, and BOQs
- voice workflows for field execution and support

### Missing ecosystem plays

- partner marketplace
- financing marketplace
- insurance marketplace
- installation/service marketplace
- compliance partner marketplace
- manufacturer-sponsored visibility and incentive products

## Additional High-Leverage Ideas Beyond The Prompt

- construction ontology and knowledge graph for materials, trades, workflows, and compliance
- site digital passport for every project
- product provenance and authenticity tracking
- labor capacity exchange for contractor staffing
- procurement co-pilot for small shops
- AI-assisted bill of quantities generator from drawings, chat, image, and voice
- open procurement APIs for builders and ERPs
- design-to-procurement graph connecting architect decisions to commercial outcomes
- financing pre-approval engine embedded at requirement creation time
- site health score combining delivery, payment, quality, and rework signals
- manufacturer demand sensing network
- spare parts and maintenance intelligence for post-install lifecycle revenue

## Architecture Verdict

### What should stay

- Postgres as operational source of truth
- Supabase Auth as current identity substrate
- modular monolith approach for the next stage
- shared package architecture
- workflow tables and transition catalog concept
- tenant-aware domain design
- backend gateway pattern in web and mobile clients

### What must change

- direct database access from clients for sensitive and evolving domains
- event publishing through generic queue calls without outbox guarantees
- lack of domain-owned read models and search indexes
- absence of dedicated observability, policy, analytics, and integration layers
- feature-by-feature AI instead of platform AI capabilities

## Target Architecture For The Next 5 Years

### Layer 1: Experience layer

- web app for enterprise, supplier, manufacturer, finance, and admin users
- mobile app for field users, contractors, electricians, delivery, and approvals
- conversational interfaces for procurement, support, and analytics
- partner portals with tenant-aware branding

### Layer 2: API and orchestration layer

- API gateway for public, partner, and internal APIs
- modular domain services with explicit ownership
- workflow/saga engine for long-running orchestration
- policy engine for permissions, approvals, and compliance

### Layer 3: Operational core

- procurement domain
- catalog domain
- project/site domain
- fulfillment/logistics domain
- payments and wallet domain
- financing and underwriting domain
- partner management domain
- service and maintenance domain
- document intelligence domain

### Layer 4: Event and data platform

- transactional outbox
- event bus
- stream processing
- lakehouse / warehouse
- feature store
- vector store
- graph store
- domain-owned read models

### Layer 5: Intelligence platform

- agent runtime
- memory services
- retrieval stack
- evaluation stack
- human-in-the-loop controls
- recommendation engine
- forecasting engine

## Recommended Bounded Contexts

The current backend modules are a good start, but the future platform should formalize these bounded contexts:

- Identity and Access
- Tenant and Partner Management
- Catalog and Product Intelligence
- Procurement and Sourcing
- Requirement Intelligence
- Workflow and Approvals
- Orders and Fulfillment
- Inventory and Warehouse
- Payments, Wallet, and Ledger
- Financing and Risk
- Notifications and Communications
- Service, Warranty, and Maintenance
- Documents and Compliance
- Search and Knowledge Graph
- Analytics and Intelligence
- Platform Integrations and Developer Ecosystem

## Event-Driven Platform Design

### Current state

Today, `DomainEventsService` publishes to a queue through `QueueService`. This is useful, but it is not yet an event backbone.

Missing pieces:

- durable event store contract
- outbox pattern
- consumer registry
- schema versioning
- replayable streams
- dead letter queues
- consumer observability
- compensation workflows

### Target event model

Every important business action should emit a typed domain event.

Core event families:

- `tenant.created`
- `tenant.member.added`
- `user.verified`
- `requirement.batch.uploaded`
- `requirement.batch.extracted`
- `requirement.batch.review_required`
- `requirement.procurement.generated`
- `procurement.rfq.created`
- `quote.submitted`
- `quote.accepted`
- `site.order.created`
- `site.order.approved`
- `site.order.fulfillment_started`
- `inventory.level.changed`
- `inventory.reorder.triggered`
- `payment.captured`
- `wallet.entry.posted`
- `ledger.settlement.completed`
- `finance.application.submitted`
- `finance.application.approved`
- `shipment.dispatched`
- `delivery.confirmed`
- `invoice.issued`
- `warranty.registered`
- `maintenance.task.created`
- `document.verified`
- `compliance.alert.raised`

### Event infrastructure

- Postgres outbox table per service boundary
- publisher daemon to event bus
- event bus: start with Kafka-compatible or managed pub/sub once traffic justifies it
- BullMQ retained for job execution, not as the strategic event backbone
- schema registry for event contracts
- idempotency keys at producer and consumer boundaries

### Consumer types

- read model projectors
- notifications
- analytics ingestion
- AI memory ingestion
- search indexing
- fraud checks
- supplier scoring
- workflow saga managers
- CRM enrichment

### Retry strategy

- exponential backoff with bounded retries
- poison message threshold
- DLQ per consumer group
- replay tooling from outbox / stream offsets

### Compensation logic

Use sagas for long-running flows such as:

- procurement generation to RFQ to quote to financing approval to order confirmation
- wallet debit to payment confirmation to inventory reservation to dispatch
- warranty registration to installation completion to AMC enrollment

Compensation examples:

- release inventory reservation
- reverse ledger entry
- cancel financing hold
- void shipment request
- reopen quote cycle

## Data Platform Design

### Current state

The operational database is strong, but there is no visible world-class analytics platform yet.

### Target architecture

- operational Postgres remains source of truth for transactions
- CDC or event ingestion populates warehouse/lakehouse
- curated marts for procurement, finance, supplier, tenant, and project analytics
- feature store for predictive and recommendation workloads
- vector index for semantic retrieval
- graph model for entity relationships across products, sites, partners, and workflows

### Core data products

- Customer 360
- Supplier 360
- Manufacturer 360
- Project 360
- Site intelligence timeline
- Payment and risk intelligence
- Procurement intelligence
- Pricing intelligence
- Demand forecasting
- Service lifecycle intelligence

### Required stores

- warehouse/lakehouse
- vector store
- graph store
- object/document store
- model evaluation store

## AI-First Platform Design

AI should become a platform capability, not a scattered feature set.

### Shared AI platform services

- prompt and policy registry
- model routing layer
- retrieval service
- embeddings pipeline
- agent memory service
- tool execution layer
- safety and approval layer
- evaluation harness
- audit log for AI actions

### Agent design principles

- agents subscribe to events, not polls
- every autonomous action has authority limits
- high-risk domains require human checkpoints
- memory is role-scoped, tenant-scoped, and time-bounded
- each agent is measured on business KPIs, not only task completion

## Specialized Agents

### Architect AI

- Responsibilities: material recommendations, design intent preservation, lighting and product suitability, approval assistance
- Memory: approved styles, project constraints, room types, historical substitutions
- Tools: catalog search, visualizer, requirement retrieval, quote comparison
- Autonomy level: recommend, draft approvals, flag conflicts
- Decision limits: cannot place orders or commit budget
- Fallback logic: escalate to architect or customer
- Event subscriptions: `requirement.batch.review_required`, `substitute.suggested`, `site.design.changed`
- KPIs: approval turnaround, substitution acceptance, design adherence

### Electrician AI

- Responsibilities: field-friendly requirement capture, execution guidance, issue reporting, material gap detection
- Memory: site history, preferred brands, recurring install patterns
- Tools: mobile input, OCR, voice capture, inventory lookup
- Autonomy level: draft requirement batches and issue reports
- Decision limits: cannot approve finance or major procurement changes
- Fallback logic: escalate to site admin
- Event subscriptions: `inventory.shortage.detected`, `task.assigned`, `delivery.delayed`
- KPIs: requirement accuracy, rework reduction, turnaround time

### Procurement AI

- Responsibilities: RFQ generation, quote normalization, sourcing suggestions, supplier routing
- Memory: supplier performance, historical pricing, lead times, negotiation outcomes
- Tools: catalog graph, quote parser, supplier search, demand forecast
- Autonomy level: can draft sourcing plans and negotiation suggestions
- Decision limits: budget thresholds and vendor changes require approval
- Fallback logic: escalate to procurement lead
- Event subscriptions: `requirement.procurement.generated`, `inventory.reorder.triggered`, `quote.submitted`
- KPIs: savings achieved, cycle time, fill rate

### Supplier AI

- Responsibilities: demand alerts, stock recommendations, quote drafting, catalog hygiene
- Memory: order history, response times, rejection reasons
- Tools: supplier portal, inventory feed, quote assistant
- Autonomy level: draft quotes and replenishment suggestions
- Decision limits: cannot accept unfavorable financing or settlement terms autonomously
- Fallback logic: supplier operator review
- Event subscriptions: `rfq.created`, `inventory.demand_forecast.updated`
- KPIs: response SLA, quote win rate, stock availability

### Sales AI

- Responsibilities: lead qualification, product recommendations, conversion nudges
- Memory: customer preferences, project context, engagement history
- Tools: CRM, visualizer, recommendation engine
- Autonomy level: outreach drafts and guided recommendations
- Decision limits: no pricing override beyond configured policy
- Fallback logic: handoff to sales owner
- Event subscriptions: `lead.created`, `proposal.viewed`, `cart.abandoned`
- KPIs: conversion, deal velocity, upsell rate

### Support AI

- Responsibilities: issue triage, ticket routing, troubleshooting, order status answers
- Memory: customer history, issue taxonomy, prior resolutions
- Tools: ticketing, order lookup, knowledge base
- Autonomy level: fully autonomous for low-risk support
- Decision limits: financial concessions and compliance statements restricted
- Fallback logic: transfer to human support
- Event subscriptions: `support.ticket.created`, `delivery.failed`, `payment.failed`
- KPIs: first response time, resolution rate, CSAT

### Inventory AI

- Responsibilities: replenishment forecasting, dead stock detection, substitution risk alerts
- Memory: stock movement, seasonality, supplier lead time
- Tools: inventory tables, demand forecast, procurement signals
- Autonomy level: reorder suggestions and anomaly flags
- Decision limits: auto-reorder only under thresholds and policy
- Fallback logic: buyer confirmation
- Event subscriptions: `inventory.level.changed`, `site.order.created`
- KPIs: stockouts, holding cost, forecast accuracy

### Finance AI

- Responsibilities: wallet monitoring, collections prioritization, financing recommendations
- Memory: payment behavior, savings progress, exposure, settlement history
- Tools: ledger, payments, risk features
- Autonomy level: draft decisions and outreach prioritization
- Decision limits: underwriting and disbursal approvals gated
- Fallback logic: finance team review
- Event subscriptions: `payment.captured`, `wallet.entry.posted`, `finance.application.submitted`
- KPIs: collection efficiency, default risk reduction, capital utilization

### Legal AI

- Responsibilities: contract review drafts, term deviation alerts, dispute packet preparation
- Memory: contract templates, clause library, prior negotiations
- Tools: document AI, clause search, policy engine
- Autonomy level: draft and flag
- Decision limits: cannot finalize legal advice autonomously
- Fallback logic: counsel review
- Event subscriptions: `contract.uploaded`, `dispute.opened`
- KPIs: review turnaround, deviation detection rate

### Compliance AI

- Responsibilities: invoice checks, permit reminders, regulatory alerts
- Memory: jurisdiction rules, tenant compliance profile, document history
- Tools: compliance engine, document parsing, government integrations
- Autonomy level: alerting and checklist generation
- Decision limits: no autonomous filings in early phases
- Fallback logic: compliance officer review
- Event subscriptions: `invoice.issued`, `site.started`, `document.expired`
- KPIs: violation prevention, audit readiness

### Project AI

- Responsibilities: project timeline risk, coordination alerts, dependency tracking
- Memory: milestone history, delay reasons, procurement bottlenecks
- Tools: project plan, workflow events, delivery tracking
- Autonomy level: planning suggestions and risk surfacing
- Decision limits: cannot re-baseline commitments without approval
- Fallback logic: PM review
- Event subscriptions: `delivery.delayed`, `task.overdue`, `approval.blocked`
- KPIs: milestone hit rate, delay reduction

### Operations AI

- Responsibilities: queue health, process bottlenecks, SLA monitoring
- Memory: incident history, ops runbooks, workflow latency
- Tools: telemetry, runbooks, job dashboards
- Autonomy level: alerting and guided remediation
- Decision limits: production changes guarded
- Fallback logic: SRE/on-call
- Event subscriptions: `job.failed`, `api.slo.breached`
- KPIs: uptime, MTTR, throughput

### CEO Dashboard AI

- Responsibilities: board-level summaries, anomaly detection, strategic insights
- Memory: business KPIs, growth plans, cohort history
- Tools: warehouse, BI layer, forecasting engine
- Autonomy level: insights and scenario modeling
- Decision limits: no operational execution
- Fallback logic: executive analyst review
- Event subscriptions: `month.closed`, `target.missed`, `cohort.shift.detected`
- KPIs: insight usefulness, forecast quality

### Warehouse AI

- Responsibilities: putaway, pick-pack optimization, receiving anomaly checks
- Memory: slotting history, dispatch patterns, damage rates
- Tools: inventory system, mobile scanning, shipment data
- Autonomy level: guided suggestions and alerts
- Decision limits: no inventory write-off without approval
- Fallback logic: warehouse supervisor
- Event subscriptions: `shipment.received`, `order.allocated`
- KPIs: pick accuracy, turnaround time

### Marketing AI

- Responsibilities: lifecycle campaigns, audience segmentation, referral optimization
- Memory: engagement and acquisition cohorts
- Tools: CRM, analytics, referral engine
- Autonomy level: draft campaign execution
- Decision limits: spend caps and brand-sensitive messaging require approval
- Fallback logic: marketing lead
- Event subscriptions: `lead.created`, `customer.activated`, `referral.converted`
- KPIs: CAC, activation, referral growth

### CRM AI

- Responsibilities: lead scoring, next-best action, churn warning
- Memory: interactions, stage history, fit signals
- Tools: CRM, analytics, communication history
- Autonomy level: suggestions and task creation
- Decision limits: no irreversible account changes
- Fallback logic: account owner review
- Event subscriptions: `lead.updated`, `account.inactive`
- KPIs: pipeline velocity, churn prevention

### Analytics AI

- Responsibilities: insight generation, dashboard narratives, anomaly explanation
- Memory: KPI history, experiment results, seasonal patterns
- Tools: warehouse, semantic layer, notebook service
- Autonomy level: analysis and summarization
- Decision limits: no source-of-truth rewrites
- Fallback logic: analyst review
- Event subscriptions: `warehouse.refresh.completed`, `forecast.generated`
- KPIs: insight adoption, anomaly detection quality

### Pricing AI

- Responsibilities: margin optimization, dynamic pricing recommendations, discount governance
- Memory: competitor signals, order mix, elasticity
- Tools: pricing mart, quote engine, supplier trends
- Autonomy level: recommendations and bounded experiments
- Decision limits: hard floor enforcement and approval above thresholds
- Fallback logic: pricing manager review
- Event subscriptions: `quote.requested`, `inventory.aged`, `supplier.cost.changed`
- KPIs: margin, win rate, price realization

### Negotiation AI

- Responsibilities: negotiation playbooks, fallback offers, supplier/customer talking points
- Memory: prior negotiation outcomes, counterpart behavior
- Tools: quote data, pricing intelligence, contract templates
- Autonomy level: draft strategy and suggested counteroffers
- Decision limits: binding commercial terms restricted
- Fallback logic: human negotiator approval
- Event subscriptions: `quote.submitted`, `counteroffer.requested`
- KPIs: savings, close rate, cycle time

## Search, Graph, And Discovery Strategy

This platform needs three complementary discovery systems:

### 1. Transactional search

- fast filtering over products, sites, orders, documents, and tickets

### 2. Semantic retrieval

- embeddings over products, requirements, quotes, drawings, documents, and conversations

### 3. Knowledge graph

- explicit relationships across:
  - projects
  - rooms
  - trades
  - products
  - brands
  - suppliers
  - manufacturers
  - warranties
  - approvals
  - failures
  - compliance documents

This graph becomes a major moat.

## Security And Trust Priorities

### Immediate security upgrades

- central secrets management with rotation
- audit log standardization across all sensitive actions
- policy-as-code for admin and tenant permissions
- signed webhook verification framework
- stronger file scanning and document sanitization
- AI action audit trails
- security test suite and dependency scanning in CI

### Tenant isolation upgrades

- formal tenant context propagation across every request, event, job, and AI action
- tenant-scoped cache keys
- tenant-scoped vector namespaces
- tenant-scoped data export and deletion controls

## Observability And Reliability Blueprint

The platform needs:

- structured logs
- distributed tracing
- metrics and SLOs
- queue lag dashboards
- workflow latency dashboards
- cost dashboards
- on-call runbooks
- synthetic checks
- backup and restore drills

Core SLOs:

- API availability
- workflow completion latency
- quote turnaround
- requirement-to-procurement cycle time
- payment success rate
- OCR extraction latency
- queue processing lag

## Deployment Strategy

### Current state

`render.yaml` shows a single web service for the API and one Redis instance. This is good enough for the current phase, but not for category leadership.

### Recommended progression

#### Phase 1

- keep modular monolith
- add CI/CD
- add staging environment
- split worker processes from API process
- introduce managed observability

#### Phase 2

- move to containerized deployment with separately scaled API and workers
- private networking
- managed Postgres practices, backups, and PITR validation
- dedicated job workers per queue class

#### Phase 3

- evaluate regional architecture and data residency requirements
- move high-throughput eventing and analytics ingestion off the primary request path
- introduce dedicated search and analytics clusters

## Testing And Delivery Gaps

### Missing or weak areas

- CI pipeline
- contract tests for gateway and backend
- end-to-end scenario tests
- workflow replay tests
- performance/load tests
- chaos testing for queues and events
- migration verification tests
- AI evaluation tests
- security regression tests

### Recommended testing pyramid

- unit tests for domain logic
- integration tests against Postgres/RPC boundaries
- contract tests for clients vs backend
- e2e tests for core workflows
- replay tests from event logs
- load tests for procurement, search, OCR, and payments

## Monetization Strategy

### Core revenue streams

- tenant SaaS subscriptions
- role-based enterprise seats
- transaction fees on procurement marketplace
- supplier premium listings
- payments and escrow fees
- financing origination and servicing revenue
- warranty and AMC commissions
- insurance referral revenue
- premium AI credits
- analytics subscriptions for suppliers and manufacturers
- API usage billing
- white-label licensing
- implementation and onboarding services
- training and certification fees

### Higher-margin intelligence products

- demand intelligence for manufacturers
- pricing intelligence for suppliers
- benchmark analytics for enterprise buyers
- project risk intelligence for financiers
- procurement co-pilot subscriptions
- compliance and document AI add-ons

### Additional monetization ideas

- lead marketplace
- verified partner badges
- procurement guarantee products
- priority fulfillment programs
- dynamic financing offers at checkout
- energy retrofit recommendations
- carbon and ESG reporting subscriptions

## Defensibility And Moats

### Data moat

- normalized product and supplier graph
- requirement-to-order-to-outcome history
- pricing, lead time, and substitution intelligence
- cross-project performance signals

### Workflow moat

- deeply embedded approvals, logistics, financing, and service loops

### Ecosystem moat

- suppliers, contractors, architects, financiers, and manufacturers operating in one network

### AI moat

- proprietary retrieval over domain graph
- feedback loops from actual commercial outcomes
- domain-specialized agent memory and evaluation

### Platform moat

- public APIs, webhooks, partner apps, and white-label distribution

## Roadmap

## Now (0-6 months)

### Objectives

- harden the current platform
- complete the migration boundary
- establish platform reliability
- prepare for event-driven and AI platform foundations

### Major deliverables

- backend-first contracts for workflows, requirements, wallet, payments, notifications, and tenancy
- outbox pattern v1
- queue worker separation
- observability baseline
- CI/CD pipeline
- document AI foundation
- search v1 for products, requirements, orders, and documents

### Technical milestones

- remove sensitive direct client access for mutable domains
- standardize domain event schemas
- introduce staging + preview environments
- implement integration and contract test suites
- tenant-aware audit logs

### Business milestones

- tighter procurement cycle times
- improved requirement review speed
- supplier response SLA tracking
- tenant onboarding readiness

### Hiring plan

- senior backend/platform engineer
- data engineer
- DevOps/SRE contractor or founding platform engineer
- product designer with enterprise workflow strength

### Risks

- over-investing in breadth before reliability
- workflow complexity outrunning observability
- AI experiments without governance

## Next (6-18 months)

### Objectives

- move from software product to ecosystem platform
- launch supplier intelligence and partner workflows
- create reusable data and AI platform layers

### Major deliverables

- RFQ / bidding / negotiation engine
- supplier scorecards
- CRM and lead orchestration
- warehouse and analytics foundation
- vector search and knowledge graph v1
- agent runtime v1
- public APIs and webhooks v1

### Technical milestones

- dedicated search service
- warehouse ingestion from events/CDC
- feature store basics
- agent policy and approval framework
- workflow saga orchestration for long-running flows

### Business milestones

- supplier network growth
- enterprise buyer onboarding
- monetized AI and analytics pilots
- financing partner integrations

### Hiring plan

- head of data / analytics
- ML engineer or applied AI engineer
- product manager for supplier ecosystem
- solutions architect / integrations lead

### Risks

- fragmented priorities across too many vertical expansions
- graph and data platform complexity without clear productization
- partner integrations adding operational drag

## Scale (18-36 months)

### Objectives

- become the core transaction and intelligence layer for construction procurement
- deepen embedded finance, logistics, and service loops

### Major deliverables

- financing marketplace
- insurance and warranty products
- logistics orchestration
- project intelligence dashboards
- manufacturer intelligence platform
- autonomous procurement suggestions under policy

### Technical milestones

- multi-service extraction where justified by throughput or team topology
- advanced forecasting and pricing intelligence
- graph-driven recommendations
- event replay and resilience tooling

### Business milestones

- strong multi-tenant SaaS motion
- marketplace liquidity in target regions
- recurring data/intelligence revenue

### Hiring plan

- domain leads for finance, logistics, and marketplace
- additional data scientists
- partner success and implementation team

### Risks

- platform governance complexity
- credit and compliance exposure
- marketplace trust failures if quality controls lag

## Platform (3-5 years)

### Objectives

- become the digital infrastructure layer for the industry
- build a network that is difficult to displace

### Major deliverables

- full ecosystem identity and trust network
- open developer platform
- cross-border or multi-region architecture where needed
- deep compliance integrations
- mature agentic operating layer
- project digital twin and lifecycle intelligence

### Technical milestones

- policy-driven autonomous workflows
- mature graph and lakehouse platform
- model governance, evaluations, and AI profitability tooling
- fine-grained ecosystem APIs and app marketplace

### Business milestones

- platform revenue mix beyond SaaS
- ecosystem lock-in through data, workflow, and network effects
- strategic partnerships with manufacturers, financiers, insurers, and enterprise builders

### Hiring plan

- VP Engineering / platform leadership layer
- data platform team
- trust and safety / risk team
- ecosystem partnerships org

### Risks

- regulation
- data governance failures
- AI overreach harming trust
- expanding into too many adjacencies without compounding advantage

## Non-Negotiable Strategic Priorities

If I were acting CTO, the non-negotiables for the next stage would be:

1. Turn the migration boundary into the real application boundary.
2. Build a true event platform with outbox, schemas, consumers, and replay.
3. Stand up observability, CI/CD, and reliability before major expansion.
4. Create the data, search, vector, and graph foundation early.
5. Productize AI as a governed platform, not isolated features.
6. Expand through ecosystem loops that strengthen network effects, not random feature breadth.

## Final Assessment

This company does not need a reset.

It needs a disciplined elevation from:

- multi-tenant vertical software

to:

- event-driven industry infrastructure

The current codebase already contains the right seeds:

- workflow backbone
- tenant model
- requirement intelligence
- backend gateway strategy
- fintech direction

The next five years should focus on turning those seeds into compounding platform assets:

- event history
- ecosystem graph
- intelligence layer
- partner network
- developer platform

That is how this becomes hard to replace.
