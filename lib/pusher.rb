require 'typhoeus'
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

  def self.support_message(message, opts)
    # opts { join_code, room_id, user_agent, name, email, subject}
    body = "<i>Source App: Co-VidSpeak</i><br/>";
    body += "Name: #{opts['name']} #{opts['config'] || ''}<br/><br/>" if opts['name']
    body += (message || 'no message') + "<br/><br/><span style='font-style: italic;'>"
    if opts['join_code']
      body += opts['join_code'] + '<br/>'
    end
    if opts['room_id']
      body += "room: #{opts['room_id']}<br/>"
    end
    body += (opts['user_agent'] ? "browser: #{opts['user_agent']}" : 'no user agent found') + "</span>"
    basic_auth = "#{ENV['ZENDESK_USER']}/token:#{ENV['ZENDESK_TOKEN']}"
    endpoint = "https://#{ENV['ZENDESK_DOMAIN']}/api/v2/tickets.json"
    json = {
      'ticket' => {
        'requester' => {
          'name' => opts['name'] || opts['email'],
          'email' => opts['email']
        },
        'subject' => (opts['subject'].blank? ? "Ticket #{Date.today.iso8601}" : opts['subject']),
        'comment' => {
          'html_body' => body
        }
      }
    }
    res = Typhoeus.post(endpoint, {body: json.to_json, userpwd: basic_auth, headers: {'Content-Type' => 'application/json'}})
    if res.code == 201
      true
    else
      false
    end
  end

  def self.config
    cred = Aws::Credentials.new((ENV['SNS_KEY']), (ENV['SNS_SECRET']))
    Aws::SNS::Client.new(region: (ENV['SNS_REGION']), credentials: cred)
  end
end