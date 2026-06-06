package postal

import "encoding/json"

type WebhookEvent struct {
	Event     string          `json:"event"`
	UUID      string          `json:"uuid"`
	ID        string          `json:"id"`
	MessageID string          `json:"message_id"`
	Token     string          `json:"token"`
	Timestamp int64           `json:"timestamp"`
	Payload   json.RawMessage `json:"payload"`
	Message   MessagePayload  `json:"message"`
	Status    string          `json:"status"`
	Details   string          `json:"details"`
	URL       string          `json:"url"`
}

type MessagePayload struct {
	ID        string   `json:"id"`
	MessageID string   `json:"message_id"`
	Token     string   `json:"token"`
	To        []string `json:"to"`
	Recipient string   `json:"recipient"`
}
