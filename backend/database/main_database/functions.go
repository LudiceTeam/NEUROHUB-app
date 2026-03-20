package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
)

func NewPool(databaseURL string) (*pgxpool.Pool, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, err
	}

	config.MaxConns = 20
	config.MinConns = 5
	config.MaxConnLifetime = time.Hour
	config.MaxConnIdleTime = 30 * time.Minute
	config.HealthCheckPeriod = time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, err
	}

	return pool, nil
}

func is_user_exists(ctx context.Context, pool *pgxpool.Pool, username string) bool {

	var DbUsername string

	err := pool.QueryRow(
		ctx,
		`SELECT email FROM main_app_table WHERE email = $1`,
		username,
	).Scan(&DbUsername)

	if err != nil {
		return false
	}
	return DbUsername == username

}

func create_user(ctx context.Context, pool *pgxpool.Pool, email string) bool {
	res := is_user_exists(ctx, pool, email)
	if res {
		//fmt.Println("1")
		return false
	}
	now := time.Now()

	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())

	today_string := today.Format("2006-01-02")

	_, err2 := pool.Exec(
		ctx,
		`INSERT INTO main_app_table (provider_id,provider,email,sub,date)
		VALUES($1,$2,$3,$4,$5)`,
		"123456", "apple", email, false, today_string,
	)

	if err2 != nil {
		//fmt.Println("2")
		return false
	}
	return true

}

func main() {

	err_env := godotenv.Load()

	if err_env != nil {
		log.Fatal(err_env)
	}

	db_psw := os.Getenv("DB_PASSWORD")
	db_user := os.Getenv("DB_USER")

	database_url := "postgres://" + db_user + ":" + db_psw + "@localhost:5432/main_database"

	pool, err := NewPool(database_url)

	if err != nil {
		log.Fatal(err)
	}

	defer pool.Close()

	ctx := context.Background()

	ok := create_user(ctx, pool, "test@gmail.com")

	if ok {
		fmt.Println("user created")
	} else {
		fmt.Println("error user wanst created")
	}

}
