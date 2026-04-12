# Fintech Backend Design

## Strategic Goal

Turn the current electrical procurement platform into a fintech operating system for home-improvement demand:

- prepaid savings plans
- wallet-based rewards and referrals
- controlled credits and disbursements
- tenant-scoped financial products for white-label SaaS shops

## Design Principle

Use a **ledger-first** architecture.

Never treat wallet balances as the source of truth.

The source of truth must be:

- immutable wallet ledger entries
- savings-plan ledger entries
- referral reward ledger entries

Balances should be derived or cached from ledger movement.

## Core Modules

### 1. Wallets

Each user gets a tenant-scoped wallet account.

Use cases:

- referral rewards
- promotional credits
- cashback
- internal wallet top-ups
- future financing disbursements

### 2. Savings Plans

This is the 10-12 month fixed-payment scheme.

Core shape:

- tenant defines plan templates
- customer subscribes
- installment schedule is generated
- each deposit is recorded as a transaction
- maturity is triggered only after rules are satisfied

### 3. Referrals

Referral system should support:

- referral codes per user
- referred user tracking
- event-based rewards
- fraud controls
- reward payout to wallet

### 4. Finance Applications

Keep `finance_applications` for underwriting workflow.

Later, tie them to:

- savings history
- contractor/site reliability
- wallet behavior
- order completion patterns

## Recommended Data Model

### Wallet layer

- `wallet_accounts`
- `wallet_ledger_entries`
- `wallet_balance_snapshots`

### Savings layer

- `savings_plan_templates`
- `savings_plan_subscriptions`
- `savings_installments`
- `savings_receipts`

### Referral layer

- `referral_programs`
- `referral_codes`
- `referral_events`
- `referral_rewards`

## Ledger Conventions

Every financial movement should store:

- `tenant_id`
- `wallet_account_id`
- `direction`
- `amount`
- `currency_code`
- `entry_type`
- `reference_type`
- `reference_id`
- `status`

Do not overwrite historical rows.

Use reversal entries instead of edits.

## Savings Plan Lifecycle

### Template

Shop defines a plan:

- monthly contribution
- duration in months
- maturity benefit
- eligibility rules

### Subscription

Customer joins a template:

- start date
- number of installments
- maturity date
- plan state

### Installments

Generate one row per due installment:

- due date
- expected amount
- paid amount
- paid at
- status

### Completion

Once all paid:

- mark subscription matured
- optionally credit wallet bonus
- optionally unlock financing eligibility

## Referral Logic

### Referral program

Tenant can define:

- new user signup reward
- first savings payment reward
- first completed order reward

### Reward issuance

Reward only after qualifying event succeeds.

Examples:

- referred user completes first installment
- referred user’s account is verified
- referred user places first paid order

### Fraud controls

At minimum:

- no self-referral
- no duplicate phone/email/device referrals
- cooldown on rewardable actions
- manual review flags for suspicious clusters

## Tenant Model

All fintech tables must include `tenant_id`.

Reason:

- every shop should own its own programs
- financial products may differ by shop
- wallet incentives must not leak across tenants

## Risk / Compliance Notes

For launch:

- keep the “savings scheme” operationally as a closed-loop store-credit product
- do not market it as a regulated deposit product without legal review
- do not promise interest unless structured and licensed correctly

Safer language:

- renovation savings plan
- store value plan
- scheduled purchase plan

## Recommended Phased Build

### Phase A

- wallet accounts
- wallet ledger
- referral codes
- referral rewards into wallet

### Phase B

- savings plan templates
- customer subscriptions
- installment schedule
- collection recording

### Phase C

- financing eligibility scoring
- underwriting triggers
- disbursement tracking

## Immediate Build Recommendation

Start with:

1. wallet ledger
2. referral engine
3. savings plan templates and installment tracking

These are included in:

- [fintech_foundation.sql](/Users/harshdadriwal/Downloads/App/db/fintech_foundation.sql)
