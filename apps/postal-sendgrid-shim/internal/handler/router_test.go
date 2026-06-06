package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"testing"
	"time"

	"github.com/bvgroup-co/plunk/apps/postal-sendgrid-shim/internal/domain"
	"github.com/bvgroup-co/plunk/apps/postal-sendgrid-shim/internal/postal"
	"github.com/bvgroup-co/plunk/apps/postal-sendgrid-shim/internal/sendgrid"
	"github.com/bvgroup-co/plunk/apps/postal-sendgrid-shim/internal/storage"
	"github.com/bvgroup-co/plunk/apps/postal-sendgrid-shim/internal/webhook"
)

type fakePostal struct {
	request postal.SendMessageRequest
}

func (f *fakePostal) SendMessage(_ context.Context, request postal.SendMessageRequest) (postal.SendMessageResponse, error) {
	f.request = request
	return postal.SendMessageResponse{MessageID: "postal-message-id", Token: "postal-token"}, nil
}

func TestDomainLifecycle(t *testing.T) {
	server, _, cleanup := testServer(t, nil)
	defer cleanup()

	createResponse := doJSON(t, server, http.MethodPost, "/v3/whitelabel/domains", sendgrid.DomainRequest{Domain: "example.com", Subdomain: "mail"})
	if createResponse.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", createResponse.Code, createResponse.Body.String())
	}
	var domainResponse sendgrid.DomainResponse
	decodeResponse(t, createResponse, &domainResponse)
	if domainResponse.ID == 0 || domainResponse.DNS["mail_cname"].Host != "mail.example.com" {
		t.Fatalf("unexpected domain response: %#v", domainResponse)
	}

	validateResponse := doJSON(t, server, http.MethodPost, "/v3/whitelabel/domains/"+itoa(domainResponse.ID)+"/validate", map[string]string{})
	if validateResponse.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", validateResponse.Code, validateResponse.Body.String())
	}
	var validation sendgrid.ValidateResponse
	decodeResponse(t, validateResponse, &validation)
	if validation.Valid || validation.ValidationResults["mail_cname"].Reason == "" {
		t.Fatalf("unexpected validation response: %#v", validation)
	}

	deleteResponse := doJSON(t, server, http.MethodDelete, "/v3/whitelabel/domains/"+itoa(domainResponse.ID), nil)
	if deleteResponse.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d: %s", deleteResponse.Code, deleteResponse.Body.String())
	}
}

func TestSendMailMapsPostalAndStoresMapping(t *testing.T) {
	postalClient := &fakePostal{}
	server, store, cleanup := testServer(t, postalClient)
	defer cleanup()

	response := doJSON(t, server, http.MethodPost, "/v3/mail/send", map[string]any{
		"from":    map[string]string{"email": "sender@example.com", "name": "Sender"},
		"to":      []map[string]string{{"email": "recipient@example.net", "name": "Recipient"}},
		"subject": "Hello",
		"html":    "<p>Hello</p>",
		"headers": map[string]string{"X-Custom": "value"},
		"customArgs": map[string]string{
			"plunk_email_id":   "email_123",
			"plunk_project_id": "project_123",
		},
		"trackingSettings": map[string]any{
			"clickTracking": map[string]bool{"enable": false, "enableText": false},
			"openTracking":  map[string]bool{"enable": false},
		},
	})
	if response.Code != http.StatusAccepted {
		t.Fatalf("expected 202, got %d: %s", response.Code, response.Body.String())
	}
	shimMessageID := response.Header().Get("x-message-id")
	if shimMessageID == "" {
		t.Fatal("missing x-message-id")
	}
	if postalClient.request.From != "Sender <sender@example.com>" || postalClient.request.To[0] != "Recipient <recipient@example.net>" {
		t.Fatalf("unexpected Postal request: %#v", postalClient.request)
	}
	if postalClient.request.Headers["X-Shim-Message-ID"] != shimMessageID {
		t.Fatalf("missing shim message header: %#v", postalClient.request.Headers)
	}

	mapping, found, err := store.FindMessageMapping(context.Background(), shimMessageID, "", "")
	if err != nil {
		t.Fatal(err)
	}
	if !found || mapping.PostalMessageID != "postal-message-id" || mapping.PlunkEmailID != "email_123" || mapping.TrackingOpenEnabled {
		t.Fatalf("unexpected mapping: %#v", mapping)
	}
}

func TestPostalWebhookForwardsSendGridEventAndDeduplicates(t *testing.T) {
	var forwarded [][]sendgrid.Event
	plunk := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/webhooks/sendgrid/events" {
			t.Fatalf("unexpected path: %s", request.URL.Path)
		}
		var events []sendgrid.Event
		if err := json.NewDecoder(request.Body).Decode(&events); err != nil {
			t.Fatal(err)
		}
		forwarded = append(forwarded, events)
		w.WriteHeader(http.StatusOK)
	}))
	defer plunk.Close()

	postalClient := &fakePostal{}
	server, _, cleanup := testServerWithPlunk(t, postalClient, plunk.URL)
	defer cleanup()

	sendResponse := doJSON(t, server, http.MethodPost, "/v3/mail/send", map[string]any{
		"from":    map[string]string{"email": "sender@example.com"},
		"to":      []map[string]string{{"email": "recipient@example.net"}},
		"subject": "Hello",
		"html":    "<p>Hello</p>",
		"customArgs": map[string]string{
			"plunk_email_id":   "email_123",
			"plunk_project_id": "project_123",
		},
	})
	if sendResponse.Code != http.StatusAccepted {
		t.Fatalf("expected 202, got %d", sendResponse.Code)
	}

	postalEvent := postal.WebhookEvent{Event: "MessageLoaded", UUID: "event-1", Message: postal.MessagePayload{ID: "postal-message-id", Recipient: "recipient.net"}, Timestamp: 1760000000, URL: "https://example.net"}
	webhookResponse := doJSON(t, server, http.MethodPost, "/webhooks/postal", postalEvent)
	if webhookResponse.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", webhookResponse.Code, webhookResponse.Body.String())
	}
	duplicateResponse := doJSON(t, server, http.MethodPost, "/webhooks/postal", postalEvent)
	if duplicateResponse.Code != http.StatusOK {
		t.Fatalf("expected duplicate 200, got %d", duplicateResponse.Code)
	}
	if len(forwarded) != 1 {
		t.Fatalf("expected one forwarded payload, got %d", len(forwarded))
	}
	event := forwarded[0][0]
	if event.Event != "open" || event.SGMessageID != sendResponse.Header().Get("x-message-id") || event.CustomArgs["plunk_email_id"] != "email_123" {
		t.Fatalf("unexpected forwarded event: %#v", event)
	}
}

func testServer(t *testing.T, postalClient *fakePostal) (http.Handler, *storage.Store, func()) {
	return testServerWithPlunk(t, postalClient, "http://plunk.invalid")
}

func testServerWithPlunk(t *testing.T, postalClient *fakePostal, plunkURL string) (http.Handler, *storage.Store, func()) {
	t.Helper()
	if postalClient == nil {
		postalClient = &fakePostal{}
	}
	store, err := storage.Open(filepath.Join(t.TempDir(), "shim.db"))
	if err != nil {
		t.Fatal(err)
	}
	domainService := domain.NewService(store, "postal.example.com", false)
	forwarder := webhook.NewForwarder(store, plunkURL, http.DefaultClient, 1, time.Millisecond)
	server := NewRouter("test-token", 15*1024*1024, 1024*1024, domainService, postalClient, forwarder, store)
	return server, store, func() { _ = store.Close() }
}

func doJSON(t *testing.T, handler http.Handler, method string, path string, payload any) *httptest.ResponseRecorder {
	t.Helper()
	var body bytes.Buffer
	if payload != nil {
		if err := json.NewEncoder(&body).Encode(payload); err != nil {
			t.Fatal(err)
		}
	}
	request := httptest.NewRequest(method, path, &body)
	request.Header.Set("Authorization", "Bearer test-token")
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	return recorder
}

func decodeResponse(t *testing.T, response *httptest.ResponseRecorder, target any) {
	t.Helper()
	if err := json.NewDecoder(response.Body).Decode(target); err != nil {
		t.Fatal(err)
	}
}

func itoa(value int64) string {
	return strconv.FormatInt(value, 10)
}
