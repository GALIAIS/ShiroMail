package jobs

import (
	"context"
	"time"

	"shiro-email/backend/internal/modules/mailbox"
	"shiro-email/backend/internal/modules/message"
)

// RunCleanupRetentionJob soft-deletes messages older than the configured
// retention period for each mailbox that has RetentionDays > 0.
func RunCleanupRetentionJob(ctx context.Context, mailboxRepo mailbox.Repository, messageRepo message.Repository) error {
	items, err := mailboxRepo.ListActive(ctx)
	if err != nil {
		return err
	}

	now := time.Now()
	for _, item := range items {
		if item.RetentionDays <= 0 {
			continue
		}
		cutoff := now.AddDate(0, 0, -item.RetentionDays)
		if err := messageRepo.SoftDeleteOlderThan(ctx, item.ID, cutoff); err != nil {
			return err
		}
	}

	return nil
}
