class SubscriptionMailer < ActionMailer::Base
  include General
  helper MailerHelper
  default from: ENV['DEFAULT_EMAIL_FROM']
  layout 'mailer'
  
  def new_subscription(account)
    @account = account
    subj = "#{app_name} - New Subscription"
    mail(to: ENV['ADMIN_EMAIL'] || ENV['DEFAULT_EMAIL_FROM'], subject: subj)
  end

  def unsubscribe_reason(account, reason=nil)
    @account = account
    mail(to: ENV['ADMIN_EMAIL'] || ENV['DEFAULT_EMAIL_FROM'], subject: "#{app_name} - Subcsription Ended")
  end
  
  def purchase_bounced(account)
    @account = account
    mail_message(account, "Problem with your Subscription")
  end
  
  def subscription_confirmed(account)
    @account = account
    mail_message(account, "Subscription Confirmed")
  end

  def subscription_updated(account)
    @account = account
    mail_message(account, "Billing Details Updated")
  end

  def subscription_canceled(account)
    @account = account
    mail_message(account, "Subscription Canceled")
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
