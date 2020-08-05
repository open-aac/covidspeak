class ApplicationMailer < ActionMailer::Base
  default from: 'from@example.com'
  layout 'mailer'

  def self.current_host
    @@current_host ||= nil
    @@current_host || ENV['DEFAULT_HOST']
  end

  def self.set_current_host(host)
    @@current_host = host
  end
end
