class AccountMailer < ActionMailer::Base
  include General
  helper MailerHelper
  default from: ENV['DEFAULT_EMAIL_FROM']
  layout 'mailer'
  
  def admin_code(email, codes)
    if email
      subj = "#{app_name} - Account Login Link"
      @codes = codes
      mail(to: email, subject: subj)
    end
  end
end
