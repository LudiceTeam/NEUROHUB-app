package messagesdatabase

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
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

func Create_Message(ctx context.Context, pool *pgxpool.Pool, email string, message_text string, chat_id string, response string) string {

	message_id := uuid.New()

	message_id_string := message_id.String()

	_, err := pool.Exec(
		ctx,
		`INSERT INTO messages_table (email,chat_id,message_id,message_text,response) VALUES($1,$2,$3,$4,$5)`,
		email, chat_id, message_id_string, message_text, response,
	)
	if err != nil {
		return ""
	}

	return message_id_string

}

func Get_Chat_Messages(ctx context.Context, pool *pgxpool.Pool, chat_id string) []string {

	var messages []string

	rows, err := pool.Query(
		ctx,
		`SELECT messsge_text FROM messages_table WHERE chat_id = $1`,
		chat_id,
	)

	if err != nil {
		return messages
	}

	for rows.Next() {
		var message string
		err := rows.Scan(&message)
		if err != nil {
			return messages
		}
		messages = append(messages, message)
	}
	return messages

}
