ActionMailer::Base.add_delivery_method :ses, Mail::SES,
    region: ENV['SES_REGION'],
    access_key_id: ENV['SES_KEY'],
    secret_access_key: ENV['SES_SECRET'],
    error_handler: ->(error, raw_email) do
      # Bugsnag.notify(error){|r| r.add_tab('email', { email: raw_email })}
      raise error    
    end    
