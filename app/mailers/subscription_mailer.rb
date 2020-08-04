class SubscriptionMailer < ActionMailer::Base
  include General
  helper MailerHelper
  default from: ENV['DEFAULT_EMAIL_FROM']
  layout 'mailer'
  
  def new_subscription(account)
    @account = account
    if account.settings['contact_email']
      subj = "#{app_name} - New Subscription"
      mail(to: account.settings['contact_email'], subject: subj)
    end
  end

  def unsubscribe_reason(account, reason=nil)
    @account = account
    mail(to: account.settings['contact_email'], subject: "#{app_name} - Subcsription Ended")
  end
  
  def purchase_bounced(account)
    @account = account
    mail_message(account, "Problem with your Subscription")
  end
  
  def purchase_confirmed(account)
    @account = account
    mail_message(account, "Subscription Confirmed")
  end

  # def deletion_warning(account, attempts)
  #   @account = account
  #   @attempt = attempts
  #   mail_message(@account, "Account Deletion Notice")
  # end

  # def account_deleted(account)
  #   @account = account
  #   mail_message(@account, "Account Deleted")
  # end
end
