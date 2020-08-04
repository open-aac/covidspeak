module General
  extend ActiveSupport::Concern
  
  def mail_message(account, subject, channel_type=nil)
    email = account && account.settings['contact_email']
    channel_type ||= caller_locations(1,1)[0].label
    return nil unless email
    from = ENV['DEFAULT_EMAIL_FROM']
    opts = {to: email, subject: "#{app_name} - #{subject}"}
    opts[:from] = from if !from.blank?
    mail(opts)
  end

  def app_name
    'Co-VidSpeak'
  end

  
  module ClassMethods
    def deliver_message(method_name, *args)
      begin
        method = self.send(method_name, *args)
        method.respond_to?(:deliver_now) ? method.deliver_now : method.deliver
      end
    end
  end
end