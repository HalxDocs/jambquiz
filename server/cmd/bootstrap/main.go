// Command bootstrap creates or promotes the first admin account.
// Usage: go run ./cmd/bootstrap --name "Full Name" --password "secret123"
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/274lab/server/internal/config"
	"github.com/274lab/server/pkg/hash"
	"github.com/274lab/server/pkg/ids"
	"github.com/jackc/pgx/v5"
)

func main() {
	name := flag.String("name", "", "admin full name")
	password := flag.String("password", "", "admin password (min 8 chars)")
	flag.Parse()
	if strings.TrimSpace(*name) == "" || len(*password) < 8 {
		fmt.Fprintln(os.Stderr, "usage: bootstrap --name \"Full Name\" --password \"secret123\"")
		os.Exit(2)
	}
	cfg := config.Load()
	ctx := context.Background()
	conn, err := pgx.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("[bootstrap] connect: %v", err)
	}
	defer conn.Close(ctx)

	nameLower := strings.ToLower(strings.TrimSpace(*name))
	var id, role string
	err = conn.QueryRow(ctx, `SELECT id, role FROM students WHERE name_lower=$1`, nameLower).Scan(&id, &role)
	if err == nil {
		pw, err := hash.Password(*password)
		if err != nil {
			log.Fatalf("[bootstrap] hash: %v", err)
		}
		if _, err := conn.Exec(ctx, `UPDATE students SET role='admin', password_hash=$1, updated_at=now() WHERE id=$2`,
			pw, id); err != nil {
			log.Fatalf("[bootstrap] promote: %v", err)
		}
		fmt.Printf("promoted %q to admin (password reset)\n", *name)
		return
	}

	pw, err := hash.Password(*password)
	if err != nil {
		log.Fatalf("[bootstrap] hash: %v", err)
	}
	id = ids.New()
	now := time.Now().UTC()
	if _, err := conn.Exec(ctx, `INSERT INTO students
		(id, password_hash, name, name_lower, name_lower_words, nickname, nickname_lower, year,
		 subjects, role, free_attempts_used, trial_started_at, joined_at, coins)
		VALUES ($1,$2,$3,$4,$5,'','','2026','{}','admin',0,$6,$6,0)`,
		id, pw, strings.TrimSpace(*name), nameLower, strings.Fields(nameLower), now); err != nil {
		log.Fatalf("[bootstrap] create: %v", err)
	}
	fmt.Printf("created admin %q (id %s)\n", *name, id)
}
