import { hash } from "bcryptjs";
import { PrismaClient, type Prisma } from "@prisma/client";

const prisma = new PrismaClient();

/** Development-only credentials. Never use these in production. */
export const DEV_ADMIN_EMAIL = "admin@scheduler.local";
export const DEV_ADMIN_PASSWORD = "Admin123!Dev";

async function main(): Promise<void> {
  await prisma.schemaMeta.upsert({
    where: { id: "phase-1" },
    create: {
      id: "phase-1",
      phase: "1",
      description: "Monorepo scaffolding, health checks, MySQL + Redis connectivity",
    },
    update: {},
  });
  await prisma.schemaMeta.upsert({
    where: { id: "phase-2" },
    create: {
      id: "phase-2",
      phase: "2",
      description: "Full domain schema, indexes, and development seed",
    },
    update: {
      phase: "2",
      description: "Full domain schema, indexes, and development seed",
    },
  });

  const passwordHash = await hash(DEV_ADMIN_PASSWORD, 12);

  const admin = await prisma.user.upsert({
    where: { email: DEV_ADMIN_EMAIL },
    update: { passwordHash, name: "Platform Admin", status: "ACTIVE" },
    create: {
      id: "user_admin",
      email: DEV_ADMIN_EMAIL,
      passwordHash,
      name: "Platform Admin",
      status: "ACTIVE",
      lastLoginAt: new Date(),
    },
  });

  const org = await prisma.organization.upsert({
    where: { slug: "acme" },
    update: { name: "Acme Corp" },
    create: { id: "org_acme", name: "Acme Corp", slug: "acme" },
  });

  await prisma.organizationMember.upsert({
    where: { organizationId_userId: { organizationId: org.id, userId: admin.id } },
    update: { role: "OWNER" },
    create: { organizationId: org.id, userId: admin.id, role: "OWNER" },
  });

  const fixedPolicy = await prisma.retryPolicy.upsert({
    where: { organizationId_name: { organizationId: org.id, name: "fixed-3x" } },
    update: {},
    create: {
      id: "rp_fixed",
      organizationId: org.id,
      name: "fixed-3x",
      strategy: "FIXED",
      maxAttempts: 3,
      initialDelayMs: 5_000,
      maxDelayMs: 5_000,
      multiplier: 1,
    },
  });

  const linearPolicy = await prisma.retryPolicy.upsert({
    where: { organizationId_name: { organizationId: org.id, name: "linear-5x" } },
    update: {},
    create: {
      id: "rp_linear",
      organizationId: org.id,
      name: "linear-5x",
      strategy: "LINEAR",
      maxAttempts: 5,
      initialDelayMs: 2_000,
      maxDelayMs: 30_000,
      multiplier: 1,
    },
  });

  const exponentialPolicy = await prisma.retryPolicy.upsert({
    where: { organizationId_name: { organizationId: org.id, name: "exponential-4x" } },
    update: {},
    create: {
      id: "rp_exponential",
      organizationId: org.id,
      name: "exponential-4x",
      strategy: "EXPONENTIAL",
      maxAttempts: 4,
      initialDelayMs: 1_000,
      maxDelayMs: 60_000,
      multiplier: 2,
    },
  });

  const notifications = await prisma.project.upsert({
    where: { organizationId_slug: { organizationId: org.id, slug: "notifications" } },
    update: {},
    create: {
      id: "proj_notifications",
      organizationId: org.id,
      name: "Notifications",
      slug: "notifications",
      description: "Transactional email and in-app notifications",
      status: "ACTIVE",
    },
  });

  const analytics = await prisma.project.upsert({
    where: { organizationId_slug: { organizationId: org.id, slug: "analytics" } },
    update: {},
    create: {
      id: "proj_analytics",
      organizationId: org.id,
      name: "Analytics",
      slug: "analytics",
      description: "Reports, exports, and cleanup jobs",
      status: "ACTIVE",
    },
  });

  const emailQueue = await upsertQueue({
    id: "queue_email",
    projectId: notifications.id,
    name: "email",
    description: "Outbound email delivery",
    status: "ACTIVE",
    maxConcurrency: 8,
    defaultPriority: 5,
    retryPolicyId: exponentialPolicy.id,
  });

  const pushQueue = await upsertQueue({
    id: "queue_push",
    projectId: notifications.id,
    name: "push",
    description: "Push and in-app notifications",
    status: "PAUSED",
    maxConcurrency: 4,
    defaultPriority: 3,
    retryPolicyId: linearPolicy.id,
    pausedAt: new Date(),
  });

  const reportsQueue = await upsertQueue({
    id: "queue_reports",
    projectId: analytics.id,
    name: "reports",
    description: "Scheduled and on-demand reports",
    status: "ACTIVE",
    maxConcurrency: 2,
    defaultPriority: 2,
    retryPolicyId: linearPolicy.id,
  });

  const maintenanceQueue = await upsertQueue({
    id: "queue_maintenance",
    projectId: analytics.id,
    name: "maintenance",
    description: "Cleanup and data export",
    status: "ACTIVE",
    maxConcurrency: 1,
    defaultPriority: 0,
    retryPolicyId: fixedPolicy.id,
  });

  const workerA = await prisma.worker.upsert({
    where: { workerId: "worker-dev-a" },
    update: { status: "ONLINE", lastHeartbeatAt: new Date(), currentJobCount: 1 },
    create: {
      id: "worker_a",
      workerId: "worker-dev-a",
      hostname: "dev-worker-a",
      processId: 41001,
      version: "0.1.0",
      status: "ONLINE",
      concurrency: 10,
      currentJobCount: 1,
      lastHeartbeatAt: new Date(),
    },
  });

  const workerB = await prisma.worker.upsert({
    where: { workerId: "worker-dev-b" },
    update: { status: "ONLINE", lastHeartbeatAt: new Date() },
    create: {
      id: "worker_b",
      workerId: "worker-dev-b",
      hostname: "dev-worker-b",
      processId: 41002,
      version: "0.1.0",
      status: "ONLINE",
      concurrency: 10,
      currentJobCount: 0,
      lastHeartbeatAt: new Date(),
    },
  });

  await prisma.worker.upsert({
    where: { workerId: "worker-dev-c" },
    update: { status: "OFFLINE" },
    create: {
      id: "worker_c",
      workerId: "worker-dev-c",
      hostname: "dev-worker-c",
      processId: 41003,
      version: "0.1.0",
      status: "OFFLINE",
      concurrency: 5,
      currentJobCount: 0,
      startedAt: new Date(Date.now() - 86_400_000),
      stoppedAt: new Date(Date.now() - 3_600_000),
      lastHeartbeatAt: new Date(Date.now() - 3_600_000),
    },
  });

  await prisma.workerHeartbeat.deleteMany({
    where: { workerId: { in: [workerA.id, workerB.id] } },
  });

  await prisma.workerHeartbeat.createMany({
    data: [
      {
        workerId: workerA.id,
        currentJobCount: 1,
        memoryUsage: 180_000_000n,
        cpuUsage: 12.5,
        metadata: { phase: 2 },
      },
      {
        workerId: workerB.id,
        currentJobCount: 0,
        memoryUsage: 140_000_000n,
        cpuUsage: 4.1,
        metadata: { phase: 2 },
      },
    ],
  });

  const batch = await prisma.jobBatch.upsert({
    where: { id: "batch_welcome" },
    update: {},
    create: { id: "batch_welcome", queueId: emailQueue.id, createdByUserId: admin.id },
  });

  const completedJob = await upsertJob({
    id: "job_welcome_email",
    projectId: notifications.id,
    queueId: emailQueue.id,
    batchId: batch.id,
    createdByUserId: admin.id,
    name: "Welcome email — Ada Lovelace",
    type: "IMMEDIATE",
    taskType: "send_email",
    payload: { to: "ada@example.com", subject: "Welcome", body: "Hello Ada" },
    status: "COMPLETED",
    priority: 5,
    attempts: 1,
    maxAttempts: 4,
    retryPolicyId: exponentialPolicy.id,
    idempotencyKey: "welcome-ada-v1",
    startedAt: new Date(Date.now() - 8_000),
    completedAt: new Date(Date.now() - 5_000),
  });

  const runningJob = await upsertJob({
    id: "job_weekly_report",
    projectId: analytics.id,
    queueId: reportsQueue.id,
    createdByUserId: admin.id,
    name: "Weekly usage report",
    type: "SCHEDULED",
    taskType: "generate_report",
    payload: { report: "weekly_usage", format: "csv" },
    status: "RUNNING",
    priority: 2,
    attempts: 1,
    maxAttempts: 5,
    retryPolicyId: linearPolicy.id,
    scheduledAt: new Date(Date.now() - 60_000),
    startedAt: new Date(Date.now() - 4_000),
    lockedAt: new Date(Date.now() - 4_000),
    lockedBy: workerA.workerId,
    timeoutMs: 30_000,
  });

  const queuedJob = await upsertJob({
    id: "job_queued_notification",
    projectId: notifications.id,
    queueId: pushQueue.id,
    createdByUserId: admin.id,
    name: "Billing reminder",
    type: "DELAYED",
    taskType: "send_notification",
    payload: { userId: "user_42", channel: "in_app", template: "billing_reminder" },
    status: "QUEUED",
    priority: 3,
    attempts: 0,
    maxAttempts: 5,
    retryPolicyId: linearPolicy.id,
    scheduledAt: new Date(Date.now() + 600_000),
  });

  const retryingJob = await upsertJob({
    id: "job_retrying_export",
    projectId: analytics.id,
    queueId: maintenanceQueue.id,
    createdByUserId: admin.id,
    name: "Customer data export",
    type: "IMMEDIATE",
    taskType: "data_export",
    payload: { customerId: "cust_9", format: "json" },
    status: "RETRYING",
    priority: 1,
    attempts: 2,
    maxAttempts: 3,
    retryPolicyId: fixedPolicy.id,
    nextRetryAt: new Date(Date.now() + 5_000),
    failedAt: new Date(Date.now() - 2_000),
  });

  const cronJob = await upsertJob({
    id: "job_nightly_cleanup",
    projectId: analytics.id,
    queueId: maintenanceQueue.id,
    createdByUserId: admin.id,
    name: "Nightly temp-file cleanup",
    type: "RECURRING",
    taskType: "cleanup",
    payload: { path: "/tmp/djs", olderThanHours: 24 },
    status: "SCHEDULED",
    priority: 0,
    attempts: 0,
    maxAttempts: 3,
    retryPolicyId: fixedPolicy.id,
    scheduledAt: nextNineUtc(),
  });

  const failedJob = await upsertJob({
    id: "job_test_failure",
    projectId: notifications.id,
    queueId: emailQueue.id,
    createdByUserId: admin.id,
    name: "Synthetic failure",
    type: "IMMEDIATE",
    taskType: "test_failure",
    payload: { reason: "seeded permanent failure" },
    status: "DLQ",
    priority: 0,
    attempts: 3,
    maxAttempts: 3,
    retryPolicyId: exponentialPolicy.id,
    failedAt: new Date(Date.now() - 1_000),
  });

  await upsertJob({
    id: "job_test_success_queued",
    projectId: notifications.id,
    queueId: emailQueue.id,
    createdByUserId: admin.id,
    name: "Synthetic success (queued)",
    type: "BATCH",
    taskType: "test_success",
    payload: { marker: "seed" },
    status: "QUEUED",
    priority: 8,
    attempts: 0,
    maxAttempts: 3,
    retryPolicyId: exponentialPolicy.id,
    batchId: batch.id,
    idempotencyKey: "batch-welcome-test-success",
  });

  const completedExec = await prisma.jobExecution.upsert({
    where: { jobId_attemptNumber: { jobId: completedJob.id, attemptNumber: 1 } },
    update: {},
    create: {
      id: "exec_welcome_1",
      jobId: completedJob.id,
      workerId: workerB.id,
      attemptNumber: 1,
      status: "COMPLETED",
      startedAt: completedJob.startedAt,
      completedAt: completedJob.completedAt,
      durationMs: 3000,
      result: { messageId: "msg_seed_1" },
    },
  });

  await prisma.jobExecution.upsert({
    where: { jobId_attemptNumber: { jobId: runningJob.id, attemptNumber: 1 } },
    update: {},
    create: {
      id: "exec_report_1",
      jobId: runningJob.id,
      workerId: workerA.id,
      attemptNumber: 1,
      status: "RUNNING",
      startedAt: runningJob.startedAt,
    },
  });

  await prisma.jobExecution.upsert({
    where: { jobId_attemptNumber: { jobId: retryingJob.id, attemptNumber: 1 } },
    update: {},
    create: {
      id: "exec_export_1",
      jobId: retryingJob.id,
      workerId: workerB.id,
      attemptNumber: 1,
      status: "FAILED",
      startedAt: new Date(Date.now() - 20_000),
      completedAt: new Date(Date.now() - 18_000),
      durationMs: 2000,
      errorCode: "EXPORT_TIMEOUT",
      errorMessage: "Upstream export API timed out",
    },
  });

  await prisma.jobExecution.upsert({
    where: { jobId_attemptNumber: { jobId: retryingJob.id, attemptNumber: 2 } },
    update: {},
    create: {
      id: "exec_export_2",
      jobId: retryingJob.id,
      workerId: workerA.id,
      attemptNumber: 2,
      status: "FAILED",
      startedAt: new Date(Date.now() - 8_000),
      completedAt: new Date(Date.now() - 6_000),
      durationMs: 2000,
      errorCode: "EXPORT_TIMEOUT",
      errorMessage: "Upstream export API timed out",
    },
  });

  const finalFail = await prisma.jobExecution.upsert({
    where: { jobId_attemptNumber: { jobId: failedJob.id, attemptNumber: 3 } },
    update: {},
    create: {
      id: "exec_fail_3",
      jobId: failedJob.id,
      workerId: workerB.id,
      attemptNumber: 3,
      status: "FAILED",
      startedAt: new Date(Date.now() - 4_000),
      completedAt: new Date(Date.now() - 3_500),
      durationMs: 500,
      errorCode: "TASK_FAILED",
      errorMessage: "test_failure handler always fails",
      errorStack: "Error: seeded failure\n    at test_failure",
    },
  });

  await prisma.scheduledJob.upsert({
    where: { jobId: cronJob.id },
    update: { active: true, nextRunAt: nextNineUtc() },
    create: {
      id: "sched_cleanup",
      jobId: cronJob.id,
      scheduleType: "CRON",
      cronExpression: "0 9 * * *",
      timezone: "UTC",
      nextRunAt: nextNineUtc(),
      active: true,
    },
  });

  await prisma.deadLetterJob.upsert({
    where: { jobId: failedJob.id },
    update: {},
    create: {
      id: "dlq_test_failure",
      jobId: failedJob.id,
      finalExecutionId: finalFail.id,
      reason: "max_attempts_exhausted",
      finalError: "test_failure handler always fails",
      attempts: 3,
    },
  });

  await prisma.jobLog.deleteMany({
    where: { jobId: { in: [completedJob.id, failedJob.id, queuedJob.id] } },
  });
  await prisma.jobLog.createMany({
    data: [
      {
        jobId: completedJob.id,
        executionId: completedExec.id,
        workerId: workerB.id,
        level: "INFO",
        message: "Email accepted by provider",
        metadata: { to: "ada@example.com" },
      },
      {
        jobId: failedJob.id,
        executionId: finalFail.id,
        workerId: workerB.id,
        level: "ERROR",
        message: "Task test_failure returned a permanent error",
      },
      {
        jobId: queuedJob.id,
        level: "INFO",
        message: "Job enqueued (queue currently paused)",
      },
    ],
  });

  // eslint-disable-next-line no-console
  console.log(`Seed complete.
  Admin: ${DEV_ADMIN_EMAIL} / ${DEV_ADMIN_PASSWORD}
  Org:   acme
  Queues: email, push (paused), reports, maintenance
`);
}

function nextNineUtc(): Date {
  const next = new Date();
  next.setUTCHours(9, 0, 0, 0);
  if (next.getTime() <= Date.now()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next;
}

async function upsertQueue(data: Prisma.QueueUncheckedCreateInput) {
  return prisma.queue.upsert({
    where: { projectId_name: { projectId: data.projectId, name: data.name } },
    update: {
      description: data.description,
      status: data.status,
      maxConcurrency: data.maxConcurrency,
      defaultPriority: data.defaultPriority,
      retryPolicyId: data.retryPolicyId,
      pausedAt: data.pausedAt,
    },
    create: data,
  });
}

async function upsertJob(data: Prisma.JobUncheckedCreateInput) {
  return prisma.job.upsert({
    where: { id: data.id ?? "" },
    update: {
      status: data.status,
      attempts: data.attempts,
      lockedBy: data.lockedBy,
      lockedAt: data.lockedAt,
      nextRetryAt: data.nextRetryAt,
    },
    create: data,
  });
}

main()
  .catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
