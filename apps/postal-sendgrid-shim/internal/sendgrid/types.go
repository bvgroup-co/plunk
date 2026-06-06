package sendgrid

type ErrorResponse struct {
	Errors []ErrorItem `json:"errors"`
}

type ErrorItem struct {
	Message string `json:"message"`
	Field   string `json:"field,omitempty"`
}

type DomainRequest struct {
	Domain            string `json:"domain"`
	Subdomain         string `json:"subdomain"`
	AutomaticSecurity bool   `json:"automatic_security"`
	Default           bool   `json:"default"`
}

type DNSRecord struct {
	Type  string `json:"type"`
	Host  string `json:"host"`
	Data  string `json:"data"`
	Valid bool   `json:"valid"`
}

type DomainResponse struct {
	ID        int64                `json:"id"`
	Domain    string               `json:"domain"`
	Subdomain string               `json:"subdomain"`
	Valid     bool                 `json:"valid"`
	DNS       map[string]DNSRecord `json:"dns"`
}

type ValidationRecord struct {
	Valid  bool   `json:"valid"`
	Reason string `json:"reason,omitempty"`
}

type ValidateResponse struct {
	Valid             bool                        `json:"valid"`
	ValidationResults map[string]ValidationRecord `json:"validation_results"`
}

type MailAddress struct {
	Email string `json:"email"`
	Name  string `json:"name,omitempty"`
}

type Attachment struct {
	Content     string `json:"content"`
	Filename    string `json:"filename"`
	Type        string `json:"type,omitempty"`
	Disposition string `json:"disposition,omitempty"`
	ContentID   string `json:"content_id,omitempty"`
	ContentId   string `json:"contentId,omitempty"`
}

type TrackingSettings struct {
	ClickTracking struct {
		Enable          *bool `json:"enable"`
		EnableText      *bool `json:"enable_text"`
		EnableTextCamel *bool `json:"enableText"`
	} `json:"click_tracking"`
	ClickTrackingCamel struct {
		Enable          *bool `json:"enable"`
		EnableText      *bool `json:"enable_text"`
		EnableTextCamel *bool `json:"enableText"`
	} `json:"clickTracking"`
	OpenTracking struct {
		Enable *bool `json:"enable"`
	} `json:"open_tracking"`
	OpenTrackingCamel struct {
		Enable *bool `json:"enable"`
	} `json:"openTracking"`
}

type MailSendRequest struct {
	From             MailAddress       `json:"from"`
	To               []MailAddress     `json:"to"`
	Subject          string            `json:"subject"`
	HTML             string            `json:"html"`
	Text             string            `json:"text"`
	ReplyTo          *MailAddress      `json:"reply_to"`
	ReplyToCamel     *MailAddress      `json:"replyTo"`
	Headers          map[string]string `json:"headers"`
	Attachments      []Attachment      `json:"attachments"`
	CustomArgs       map[string]string `json:"custom_args"`
	CustomArgsCamel  map[string]string `json:"customArgs"`
	TrackingSettings TrackingSettings  `json:"tracking_settings"`
	TrackingCamel    TrackingSettings  `json:"trackingSettings"`
}

type Event struct {
	Event       string            `json:"event"`
	SGMessageID string            `json:"sg_message_id"`
	Email       string            `json:"email"`
	Timestamp   int64             `json:"timestamp"`
	URL         string            `json:"url,omitempty"`
	Reason      string            `json:"reason,omitempty"`
	CustomArgs  map[string]string `json:"custom_args,omitempty"`
}
