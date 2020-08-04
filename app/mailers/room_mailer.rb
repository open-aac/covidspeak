class RoomMailer < ActionMailer::Base
  include General
  helper MailerHelper
  default from: ENV['DEFAULT_EMAIL_FROM']
  layout 'mailer'
  
  def room_invite(email, url)
    if email
      subj = "#{app_name} - Room Invite"
      @url = url
      mail(to: email, subject: subj)
    end
  end
end
