package mailbox

import (
	"time"

	"shiro-email/backend/internal/modules/domain"
)

type Mailbox struct {
	ID            uint64    `json:"id"`
	UserID        uint64    `json:"userId"`
	DomainID      uint64    `json:"domainId"`
	Domain        string    `json:"domain"`
	LocalPart     string    `json:"localPart"`
	Address       string    `json:"address"`
	Status        string    `json:"status"`
	ExpiresAt     time.Time `json:"expiresAt"`
	RetentionDays int       `json:"retentionDays"`
	CreatedAt     time.Time `json:"createdAt"`
	UpdatedAt     time.Time `json:"updatedAt"`
}

type CreateMailboxRequest struct {
	LocalPart      string `json:"localPart"`
	DomainID       uint64 `json:"domainId" binding:"required"`
	ExpiresInHours int    `json:"expiresInHours" binding:"required"`
	RetentionDays  int    `json:"retentionDays"`
}

type ExtendMailboxRequest struct {
	ExpiresInHours int `json:"expiresInHours" binding:"required"`
}

type DashboardPayload struct {
	TotalMailboxCount  int             `json:"totalMailboxCount"`
	ActiveMailboxCount int             `json:"activeMailboxCount"`
	AvailableDomains   []domain.Domain `json:"availableDomains"`
	Mailboxes          []Mailbox       `json:"mailboxes"`
	UnreadCounts       map[uint64]int  `json:"unreadCounts"`
}
