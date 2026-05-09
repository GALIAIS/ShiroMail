package bootstrap

import (
	"context"
	"fmt"

	"shiro-email/backend/internal/jobs"
	"shiro-email/backend/internal/modules/ingest"
	"shiro-email/backend/internal/modules/mailbox"
	"shiro-email/backend/internal/modules/message"
	"shiro-email/backend/internal/modules/system"
)

const inboundSpoolWorkers = 8

func runWorkerCycle(ctx context.Context, mailboxRepo mailbox.Repository, messageRepo message.Repository, configRepo system.ConfigRepository, storage ingest.FileStorage, spoolProcessor jobs.InboundSpoolProcessor, syncService jobs.MailboxSyncer, jobRepo system.JobRepository) error {
	if err := jobs.RunSyncMessagesJob(ctx, mailboxRepo, syncService); err != nil {
		recordWorkerFailure(ctx, jobRepo, "sync_messages", err)
		return err
	}
	if err := jobs.RunInboundSpoolJobConcurrent(ctx, spoolProcessor, inboundSpoolWorkers); err != nil {
		recordWorkerFailure(ctx, jobRepo, "inbound_spool", err)
		return err
	}
	if err := jobs.RunCleanupExpiredJob(ctx, mailboxRepo, messageRepo, configRepo, storage); err != nil {
		recordWorkerFailure(ctx, jobRepo, "cleanup_expired", err)
		return err
	}
	if err := jobs.RunCleanupRetentionJob(ctx, mailboxRepo, messageRepo); err != nil {
		recordWorkerFailure(ctx, jobRepo, "cleanup_retention", err)
		return err
	}
	return nil
}

func recordWorkerFailure(ctx context.Context, jobRepo system.JobRepository, jobType string, err error) {
	if jobRepo == nil || err == nil {
		return
	}
	_, _ = jobRepo.Create(ctx, jobType, "failed", fmt.Sprintf("%v", err))
}
