package chatsdatabase

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/google/uuid"
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

func Create_Chat(ctx context.Context, pool *pgxpool.Pool, email string) string {
	id := uuid.New()

	id_string := id.String()

	_, err := pool.Exec(
		ctx,
		`INSERT INTO chats_table (email,chat_id) VALUES($1,$2)`,
		email, id_string,
	)
	if err != nil {
		return ""
	}
	return id_string
}

func Get_User_Chats(ctx context.Context, pool *pgxpool.Pool, email string) []string {

	var chats []string

	rows, err := pool.Query(
		ctx,
		`SELECT chat_id FROM chats_table WHERE email = $1`,
		email,
	)

	if err != nil {
		return nil
	}

	defer rows.Close()

	for rows.Next() {
		var chat_id string

		err := rows.Scan(&chat_id)
		if err != nil {
			return nil
		}

		chats = append(chats, chat_id)
	}
	return chats
}

func run_event() {
	err_env := godotenv.Load()
	if err_env != nil {
		log.Fatal(err_env)
	}

	db_psw := os.Getenv("DB_PASSWORD")
	db_user := os.Getenv("DB_USER")

	database_url := "postgres://" + db_user + ":" + db_psw + "@localhost:5432/chats_database"

	pool, err := NewPool(database_url)

	if err != nil {
		log.Fatal(err)
	}

	defer pool.Close()

	ctx := context.Background()

	res := Create_Chat(ctx, pool, "test@gmail.com")

	fmt.Println(res)
}
