package smtp

import (
	"context"
	"fmt"
	"net"
	"sync"
	"time"
)

type Config struct {
	ListenAddr      string
	Hostname        string
	MaxMessageBytes int
	Timeout         time.Duration
}

type Server struct {
	cfg      Config
	deliver  Deliverer
	listener net.Listener
	addr     string
	wg       sync.WaitGroup
}

func NewServer(cfg Config, deliver Deliverer) *Server {
	if cfg.ListenAddr == "" {
		cfg.ListenAddr = "127.0.0.1:2525"
	}
	if cfg.Hostname == "" {
		cfg.Hostname = "shiro.local"
	}
	if cfg.MaxMessageBytes <= 0 {
		cfg.MaxMessageBytes = 10 * 1024 * 1024
	}
	if cfg.Timeout <= 0 {
		cfg.Timeout = 30 * time.Second
	}
	return &Server{
		cfg:     cfg,
		deliver: deliver,
	}
}

func (s *Server) Start(ctx context.Context, ready func()) error {
	ln, err := net.Listen("tcp", s.cfg.ListenAddr)
	if err != nil {
		return fmt.Errorf("smtp listen failed: %w", err)
	}
	s.listener = ln
	s.addr = ln.Addr().String()
	if ready != nil {
		ready()
	}

	go func() {
		<-ctx.Done()
		_ = s.listener.Close()
	}()

	for {
		conn, err := s.listener.Accept()
		if err != nil {
			select {
			case <-ctx.Done():
				return nil
			default:
				continue
			}
		}

		s.wg.Add(1)
		go func() {
			defer s.wg.Done()
			ssn := newSession(ctx, s.cfg, s.deliver, conn)
			ssn.run()
		}()
	}
}

func (s *Server) Addr() string {
	return s.addr
}

func (s *Server) Drain() {
	s.wg.Wait()
}
