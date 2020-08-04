require 'aws-sdk-sns'

module Pusher
  def self.sms(phone, message)
    client = config
    raise "missing config" unless ENV['SNS_KEY'] && ENV['SNS_SECRET'] && ENV['SNS_REGION']
    phone.strip!
    raise "phone missing" if phone.blank?
    raise "message missing" if message.blank?
    if phone.match(/,/)
      return phone.split(/,/).map{|p| Pusher.sms(p, message)[0]}
    end
    phones = phone.split(/,/)
    if !phone.match(/^\+\d/)
      phone = "+1" + phone
    end
    phone = phone.gsub(/[^\+\d]/, '')
    res = client.publish({
      phone_number: phone,
      message: "Co-VidSpeak: #{message}",
      message_attributes: {
        "AWS.SNS.SMS.MaxPrice" => {
          data_type: "Number",
          string_value: "0.5"
        },
        "AWS.SNS.SMS.SenderID" => {
          data_type: "String",
          string_value: "CoVidSpeak"
        }
      }
    })
    message_id = res.message_id
    [message_id]
  end

  def self.config
    cred = Aws::Credentials.new((ENV['SNS_KEY']), (ENV['SNS_SECRET']))
    Aws::SNS::Client.new(region: (ENV['SNS_REGION']), credentials: cred)
  end
end