class AccountMailer < ActionMailer::Base
  include General
  helper MailerHelper
  default from: ENV['DEFAULT_EMAIL_FROM']
  layout 'mailer'
  
  def call_feedback(feedback)
    @feedback = feedback
    subj = "#{app_name} - Call Feedback"
    mail(to: ENV['ADMIN_EMAIL'] || ENV['DEFAULT_EMAIL_FROM'], subject: subj)
  end

  def admin_code(email, codes)
    if email
      subj = "#{app_name} - Account Login Link"
      @codes = codes
      mail(to: email, subject: subj)
    end
  end
end
