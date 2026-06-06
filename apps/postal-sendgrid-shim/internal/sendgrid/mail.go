package sendgrid

func (r MailSendRequest) CustomArguments() map[string]string {
	if r.CustomArgs != nil {
		return r.CustomArgs
	}
	if r.CustomArgsCamel != nil {
		return r.CustomArgsCamel
	}
	return map[string]string{}
}

func (r MailSendRequest) ReplyAddress() *MailAddress {
	if r.ReplyTo != nil {
		return r.ReplyTo
	}
	return r.ReplyToCamel
}

func (r MailSendRequest) OpenTrackingEnabled() bool {
	if r.TrackingSettings.OpenTracking.Enable != nil {
		return *r.TrackingSettings.OpenTracking.Enable
	}
	if r.TrackingSettings.OpenTrackingCamel.Enable != nil {
		return *r.TrackingSettings.OpenTrackingCamel.Enable
	}
	if r.TrackingCamel.OpenTracking.Enable != nil {
		return *r.TrackingCamel.OpenTracking.Enable
	}
	if r.TrackingCamel.OpenTrackingCamel.Enable != nil {
		return *r.TrackingCamel.OpenTrackingCamel.Enable
	}
	return true
}

func (r MailSendRequest) ClickTrackingEnabled() bool {
	if r.TrackingSettings.ClickTracking.Enable != nil {
		return *r.TrackingSettings.ClickTracking.Enable
	}
	if r.TrackingSettings.ClickTrackingCamel.Enable != nil {
		return *r.TrackingSettings.ClickTrackingCamel.Enable
	}
	if r.TrackingCamel.ClickTracking.Enable != nil {
		return *r.TrackingCamel.ClickTracking.Enable
	}
	if r.TrackingCamel.ClickTrackingCamel.Enable != nil {
		return *r.TrackingCamel.ClickTrackingCamel.Enable
	}
	return true
}
