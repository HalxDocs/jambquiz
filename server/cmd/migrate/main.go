// Command migrate applies server/migrations/*.sql in order.
// Usage: go run ./cmd/migrate [up|status]
package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"sort"

	"github.com/274lab/server/internal/config"
	migrations "github.com/274lab/server/migrations"
	"github.com/jackc/pgx/v5"
)

func main() {
	cmd := "up"
	if len(os.Args) > 1 {
		cmd = os.Args[1]
	}
	cfg := config.Load()
	ctx := context.Background()
	conn, err := pgx.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("[migrate] connect: %v", err)
	}
	defer conn.Close(ctx)

	if _, err := conn.Exec(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (
		version TEXT PRIMARY KEY,
		applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
	)`); err != nil {
		log.Fatalf("[migrate] schema_migrations: %v", err)
	}

	files := mustList()
	applied := map[string]bool{}
	rows, err := conn.Query(ctx, `SELECT version FROM schema_migrations`)
	if err != nil {
		log.Fatalf("[migrate] read versions: %v", err)
	}
	for rows.Next() {
		var v string
		if err := rows.Scan(&v); err != nil {
			log.Fatalf("[migrate] scan: %v", err)
		}
		applied[v] = true
	}
	rows.Close()

	pending := []string{}
	for _, f := range files {
		if !applied[f] {
			pending = append(pending, f)
		}
	}

	if cmd == "status" {
		fmt.Printf("applied=%d pending=%d\n", len(files)-len(pending), len(pending))
		for _, p := range pending {
			fmt.Println("  pending:", p)
		}
		return
	}
	if cmd != "up" {
		log.Fatalf("[migrate] unknown command %q (up|status)", cmd)
	}

	for _, f := range pending {
		content, err := migrations.FS.ReadFile(f)
		if err != nil {
			log.Fatalf("[migrate] read %s: %v", f, err)
		}
		tx, err := conn.Begin(ctx)
		if err != nil {
			log.Fatalf("[migrate] begin: %v", err)
		}
		if _, err := tx.Exec(ctx, string(content)); err != nil {
			tx.Rollback(ctx)
			log.Fatalf("[migrate] apply %s: %v", f, err)
		}
		if _, err := tx.Exec(ctx, `INSERT INTO schema_migrations (version) VALUES ($1)`, f); err != nil {
			tx.Rollback(ctx)
			log.Fatalf("[migrate] record %s: %v", f, err)
		}
		if err := tx.Commit(ctx); err != nil {
			log.Fatalf("[migrate] commit %s: %v", f, err)
		}
		fmt.Println("applied:", f)
	}
	fmt.Printf("done: %d applied, %d total\n", len(pending), len(files))
}

func mustList() []string {
	entries, err := migrations.FS.ReadDir(".")
	if err != nil {
		log.Fatalf("[migrate] list: %v", err)
	}
	files := []string{}
	for _, e := range entries {
		if !e.IsDir() {
			files = append(files, e.Name())
		}
	}
	sort.Strings(files)
	return files
}
