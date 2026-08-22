-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `status` ENUM('ACTIVE', 'DISABLED', 'PENDING') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `lastLoginAt` DATETIME(3) NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    INDEX `users_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `organizations` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `slug` VARCHAR(128) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `organizations_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `organization_members` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `role` ENUM('OWNER', 'ADMIN', 'MEMBER', 'VIEWER') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `organization_members_userId_idx`(`userId`),
    UNIQUE INDEX `organization_members_organizationId_userId_key`(`organizationId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `projects` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `slug` VARCHAR(128) NOT NULL,
    `description` VARCHAR(512) NULL,
    `status` ENUM('ACTIVE', 'ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `projects_organizationId_status_idx`(`organizationId`, `status`),
    UNIQUE INDEX `projects_organizationId_slug_key`(`organizationId`, `slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `retry_policies` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `strategy` ENUM('FIXED', 'LINEAR', 'EXPONENTIAL') NOT NULL,
    `maxAttempts` INTEGER NOT NULL,
    `initialDelayMs` INTEGER NOT NULL,
    `maxDelayMs` INTEGER NOT NULL,
    `multiplier` DECIMAL(8, 2) NOT NULL DEFAULT 2,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `retry_policies_organizationId_idx`(`organizationId`),
    UNIQUE INDEX `retry_policies_organizationId_name_key`(`organizationId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `queues` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `description` VARCHAR(512) NULL,
    `status` ENUM('ACTIVE', 'PAUSED', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
    `maxConcurrency` INTEGER NOT NULL DEFAULT 5,
    `defaultPriority` INTEGER NOT NULL DEFAULT 0,
    `retryPolicyId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `pausedAt` DATETIME(3) NULL,

    INDEX `queues_projectId_idx`(`projectId`),
    INDEX `queues_status_idx`(`status`),
    INDEX `queues_projectId_status_idx`(`projectId`, `status`),
    UNIQUE INDEX `queues_projectId_name_key`(`projectId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `job_batches` (
    `id` VARCHAR(191) NOT NULL,
    `queueId` VARCHAR(191) NOT NULL,
    `createdByUserId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `job_batches_queueId_createdAt_idx`(`queueId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `jobs` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `queueId` VARCHAR(191) NOT NULL,
    `batchId` VARCHAR(191) NULL,
    `createdByUserId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` ENUM('IMMEDIATE', 'DELAYED', 'SCHEDULED', 'RECURRING', 'BATCH') NOT NULL,
    `taskType` VARCHAR(64) NOT NULL,
    `payload` JSON NOT NULL,
    `status` ENUM('QUEUED', 'SCHEDULED', 'CLAIMED', 'RUNNING', 'COMPLETED', 'FAILED', 'RETRYING', 'CANCELLED', 'DLQ') NOT NULL DEFAULT 'QUEUED',
    `priority` INTEGER NOT NULL DEFAULT 0,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `maxAttempts` INTEGER NOT NULL,
    `retryPolicyId` VARCHAR(191) NULL,
    `idempotencyKey` VARCHAR(128) NULL,
    `scheduledAt` DATETIME(3) NULL,
    `startedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `failedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `nextRetryAt` DATETIME(3) NULL,
    `lockedAt` DATETIME(3) NULL,
    `lockedBy` VARCHAR(128) NULL,
    `timeoutMs` INTEGER NULL,

    INDEX `jobs_queueId_status_idx`(`queueId`, `status`),
    INDEX `jobs_queueId_priority_idx`(`queueId`, `priority`),
    INDEX `jobs_queueId_createdAt_idx`(`queueId`, `createdAt`),
    INDEX `jobs_status_scheduledAt_idx`(`status`, `scheduledAt`),
    INDEX `jobs_status_nextRetryAt_idx`(`status`, `nextRetryAt`),
    INDEX `jobs_projectId_idx`(`projectId`),
    INDEX `jobs_idempotencyKey_idx`(`idempotencyKey`),
    INDEX `jobs_queueId_status_priority_createdAt_idx`(`queueId`, `status`, `priority`, `createdAt`),
    INDEX `jobs_lockedBy_status_idx`(`lockedBy`, `status`),
    INDEX `jobs_taskType_idx`(`taskType`),
    UNIQUE INDEX `jobs_projectId_idempotencyKey_key`(`projectId`, `idempotencyKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `job_executions` (
    `id` VARCHAR(191) NOT NULL,
    `jobId` VARCHAR(191) NOT NULL,
    `workerId` VARCHAR(191) NULL,
    `attemptNumber` INTEGER NOT NULL,
    `status` ENUM('CLAIMED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT') NOT NULL,
    `startedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `durationMs` INTEGER NULL,
    `errorCode` VARCHAR(64) NULL,
    `errorMessage` VARCHAR(1024) NULL,
    `errorStack` TEXT NULL,
    `result` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `job_executions_jobId_idx`(`jobId`),
    INDEX `job_executions_workerId_idx`(`workerId`),
    INDEX `job_executions_status_idx`(`status`),
    INDEX `job_executions_createdAt_idx`(`createdAt`),
    UNIQUE INDEX `job_executions_jobId_attemptNumber_key`(`jobId`, `attemptNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workers` (
    `id` VARCHAR(191) NOT NULL,
    `workerId` VARCHAR(128) NOT NULL,
    `hostname` VARCHAR(255) NOT NULL,
    `processId` INTEGER NOT NULL,
    `version` VARCHAR(32) NOT NULL,
    `status` ENUM('STARTING', 'ONLINE', 'DRAINING', 'OFFLINE', 'FAILED') NOT NULL DEFAULT 'STARTING',
    `concurrency` INTEGER NOT NULL,
    `currentJobCount` INTEGER NOT NULL DEFAULT 0,
    `lastHeartbeatAt` DATETIME(3) NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `stoppedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `workers_workerId_key`(`workerId`),
    INDEX `workers_status_idx`(`status`),
    INDEX `workers_lastHeartbeatAt_idx`(`lastHeartbeatAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `worker_heartbeats` (
    `id` VARCHAR(191) NOT NULL,
    `workerId` VARCHAR(191) NOT NULL,
    `heartbeatAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `currentJobCount` INTEGER NOT NULL DEFAULT 0,
    `memoryUsage` BIGINT NULL,
    `cpuUsage` DECIMAL(8, 4) NULL,
    `metadata` JSON NULL,

    INDEX `worker_heartbeats_workerId_heartbeatAt_idx`(`workerId`, `heartbeatAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `job_logs` (
    `id` VARCHAR(191) NOT NULL,
    `jobId` VARCHAR(191) NOT NULL,
    `executionId` VARCHAR(191) NULL,
    `workerId` VARCHAR(191) NULL,
    `level` ENUM('DEBUG', 'INFO', 'WARN', 'ERROR') NOT NULL,
    `message` VARCHAR(2048) NOT NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `job_logs_jobId_createdAt_idx`(`jobId`, `createdAt`),
    INDEX `job_logs_executionId_createdAt_idx`(`executionId`, `createdAt`),
    INDEX `job_logs_workerId_createdAt_idx`(`workerId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `scheduled_jobs` (
    `id` VARCHAR(191) NOT NULL,
    `jobId` VARCHAR(191) NOT NULL,
    `scheduleType` ENUM('DELAY', 'CRON', 'ONE_TIME') NOT NULL,
    `cronExpression` VARCHAR(64) NULL,
    `timezone` VARCHAR(64) NOT NULL DEFAULT 'UTC',
    `nextRunAt` DATETIME(3) NOT NULL,
    `lastRunAt` DATETIME(3) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `scheduled_jobs_jobId_key`(`jobId`),
    INDEX `scheduled_jobs_active_nextRunAt_idx`(`active`, `nextRunAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `dead_letter_jobs` (
    `id` VARCHAR(191) NOT NULL,
    `jobId` VARCHAR(191) NOT NULL,
    `finalExecutionId` VARCHAR(191) NULL,
    `reason` VARCHAR(255) NOT NULL,
    `finalError` TEXT NULL,
    `attempts` INTEGER NOT NULL,
    `movedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `resolvedAt` DATETIME(3) NULL,
    `resolution` ENUM('RETRIED', 'DISCARDED', 'RESOLVED') NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `dead_letter_jobs_jobId_key`(`jobId`),
    INDEX `dead_letter_jobs_jobId_idx`(`jobId`),
    INDEX `dead_letter_jobs_createdAt_idx`(`createdAt`),
    INDEX `dead_letter_jobs_resolvedAt_idx`(`resolvedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `organization_members` ADD CONSTRAINT `organization_members_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `organization_members` ADD CONSTRAINT `organization_members_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `projects` ADD CONSTRAINT `projects_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `retry_policies` ADD CONSTRAINT `retry_policies_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `queues` ADD CONSTRAINT `queues_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `queues` ADD CONSTRAINT `queues_retryPolicyId_fkey` FOREIGN KEY (`retryPolicyId`) REFERENCES `retry_policies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `job_batches` ADD CONSTRAINT `job_batches_queueId_fkey` FOREIGN KEY (`queueId`) REFERENCES `queues`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `jobs` ADD CONSTRAINT `jobs_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `jobs` ADD CONSTRAINT `jobs_queueId_fkey` FOREIGN KEY (`queueId`) REFERENCES `queues`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `jobs` ADD CONSTRAINT `jobs_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `job_batches`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `jobs` ADD CONSTRAINT `jobs_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `jobs` ADD CONSTRAINT `jobs_retryPolicyId_fkey` FOREIGN KEY (`retryPolicyId`) REFERENCES `retry_policies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `jobs` ADD CONSTRAINT `jobs_lockedBy_fkey` FOREIGN KEY (`lockedBy`) REFERENCES `workers`(`workerId`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `job_executions` ADD CONSTRAINT `job_executions_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `jobs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `job_executions` ADD CONSTRAINT `job_executions_workerId_fkey` FOREIGN KEY (`workerId`) REFERENCES `workers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `worker_heartbeats` ADD CONSTRAINT `worker_heartbeats_workerId_fkey` FOREIGN KEY (`workerId`) REFERENCES `workers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `job_logs` ADD CONSTRAINT `job_logs_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `jobs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `job_logs` ADD CONSTRAINT `job_logs_executionId_fkey` FOREIGN KEY (`executionId`) REFERENCES `job_executions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `job_logs` ADD CONSTRAINT `job_logs_workerId_fkey` FOREIGN KEY (`workerId`) REFERENCES `workers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `scheduled_jobs` ADD CONSTRAINT `scheduled_jobs_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `jobs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dead_letter_jobs` ADD CONSTRAINT `dead_letter_jobs_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `jobs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dead_letter_jobs` ADD CONSTRAINT `dead_letter_jobs_finalExecutionId_fkey` FOREIGN KEY (`finalExecutionId`) REFERENCES `job_executions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

