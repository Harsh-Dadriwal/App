import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from "@nestjs/common";
import { Worker, type Job } from "bullmq";
import { SupabaseAdminService } from "../common/supabase/supabase-admin.service";

@Injectable()
export class DelinquencyWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DelinquencyWorker.name);
  private worker: Worker | null = null;

  constructor(private readonly supabaseAdmin: SupabaseAdminService) {}

  onModuleInit() {
    const redisUrl = process.env.REDIS_URL;
    if (process.env.DISABLE_QUEUES === "true" || !redisUrl) {
      this.logger.warn("Redis Queue or Delinquency worker is disabled.");
      return;
    }

    this.logger.log("Initializing Delinquency Worker on queue: delinquency-queue");
    this.worker = new Worker(
      "delinquency-queue",
      async (job: Job) => {
        await this.processJob(job);
      },
      {
        connection: {
          url: redisUrl
        }
      }
    );

    this.worker.on("completed", (job) => {
      this.logger.log(`Job completed: ${job.id}`);
    });

    this.worker.on("failed", (job, err) => {
      this.logger.error(`Job failed: ${job?.id}. Error: ${err.message}`);
    });
  }

  async onModuleDestroy() {
    if (this.worker) {
      this.logger.log("Stopping Delinquency Worker...");
      await this.worker.close();
    }
  }

  private async processJob(job: Job) {
    this.logger.log(`Processing background job: ${job.name} (ID: ${job.id})`);
    const supabase = this.supabaseAdmin.getClient();

    switch (job.name) {
      case "check-grace-period":
        await this.checkOverdueRepayments(supabase);
        break;
      case "apply-late-penalty":
        await this.applyLatePenalties(supabase);
        break;
      default:
        this.logger.warn(`Unknown job name received: ${job.name}`);
    }
  }

  private async checkOverdueRepayments(supabase: any) {
    this.logger.log("Checking overdue credit schedules...");
    // 1. Fetch repayment schedules where status = 'UNPAID' and due_date < current_date - 3 days
    const graceDateLimit = new Date();
    graceDateLimit.setDate(graceDateLimit.getDate() - 3);

    const { data: overdueSchedules, error } = await supabase
      .from("repayment_schedules")
      .select("*")
      .eq("status", "UNPAID")
      .lt("due_date", graceDateLimit.toISOString().split("T")[0]);

    if (error) {
      this.logger.error(`Failed to fetch overdue schedules: ${error.message}`);
      return;
    }

    if (!overdueSchedules || overdueSchedules.length === 0) {
      this.logger.log("No overdue schedules found.");
      return;
    }

    for (const schedule of overdueSchedules) {
      this.logger.warn(`Schedule ${schedule.id} is overdue. Blocking contractor: ${schedule.contractor_id}`);

      // 2. Set contractor risk band to BLOCKED
      const { error: profileError } = await supabase
        .from("contractor_risk_profiles")
        .update({
          risk_band: "BLOCKED",
          updated_at: new Date().toISOString()
        })
        .eq("user_id", schedule.contractor_id);

      if (profileError) {
        this.logger.error(`Failed to update risk profile for user ${schedule.contractor_id}: ${profileError.message}`);
      }

      // Update schedule status to late
      await supabase
        .from("repayment_schedules")
        .update({
          status: "late",
          updated_at: new Date().toISOString()
        })
        .eq("id", schedule.id);
    }
  }

  private async applyLatePenalties(supabase: any) {
    this.logger.log("Applying late penalties to overdue schedules...");
    // Fetch repayment schedules where status = 'late' and penalty_due = 0
    const { data: lateSchedules, error } = await supabase
      .from("repayment_schedules")
      .select("*")
      .eq("status", "late")
      .eq("penalty_due", 0.00);

    if (error) {
      this.logger.error(`Failed to fetch late schedules: ${error.message}`);
      return;
    }

    if (!lateSchedules || lateSchedules.length === 0) {
      return;
    }

    for (const schedule of lateSchedules) {
      // Apply 2% flat penalty on principal due
      const penaltyAmount = Number((Number(schedule.principal_due) * 0.02).toFixed(2));
      const totalDue = Number(schedule.total_due) + penaltyAmount;

      this.logger.log(`Applying Rs. ${penaltyAmount} penalty on schedule ${schedule.id}`);

      // 1. Update schedule in database
      const { error: updateError } = await supabase
        .from("repayment_schedules")
        .update({
          penalty_due: penaltyAmount,
          total_due: totalDue,
          updated_at: new Date().toISOString()
        })
        .eq("id", schedule.id);

      if (updateError) {
        this.logger.error(`Failed to apply penalty to schedule ${schedule.id}: ${updateError.message}`);
        continue;
      }

      // 2. Ledger bookkeeping: Debit Contractor AR Account, Credit Penalty Revenue Account
      const { data: arAccount } = await supabase
        .from("ledger_accounts")
        .select("id")
        .eq("account_number", "1200-CONTRACTOR-AR")
        .eq("user_id", schedule.contractor_id)
        .maybeSingle();

      const { data: penaltyRevAccount } = await supabase
        .from("ledger_accounts")
        .select("id")
        .eq("account_number", "4060-REV-PENALTY")
        .maybeSingle();

      if (arAccount && penaltyRevAccount) {
        const { data: tx } = await supabase
          .from("ledger_transactions")
          .insert({
            tenant_id: schedule.tenant_id,
            reference_type: "PENALTY",
            reference_id: schedule.id,
            description: `2% Late penalty charged on overdue repayment schedule ${schedule.id}`,
            status: "POSTED"
          })
          .select()
          .single();

        if (tx) {
          // Debit Contractor AR
          await supabase.from("ledger_entries").insert({
            tenant_id: schedule.tenant_id,
            transaction_id: tx.id,
            account_id: arAccount.id,
            direction: "DEBIT",
            amount: penaltyAmount
          });

          // Credit Penalty Revenue
          await supabase.from("ledger_entries").insert({
            tenant_id: schedule.tenant_id,
            transaction_id: tx.id,
            account_id: penaltyRevAccount.id,
            direction: "CREDIT",
            amount: penaltyAmount
          });
        }
      }
    }
  }
}
